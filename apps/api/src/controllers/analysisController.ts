import { Request, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import {
  parsePullRequestUrl,
  fetchPullRequestMetadata,
  fetchPullRequestFiles,
} from '../integrations/github';
import { analyzePullRequest } from '../analysis/analyzer';
import {
  Repository,
  PullRequest,
  AnalysisJob,
  ReviewFinding,
  AnalysisReport,
} from '../models';

const createAnalysisSchema = z.object({
  pullRequestUrl: z.string().min(1, 'Pull request URL is required'),
  enableLLM: z.boolean().optional().default(true),
});

export async function createAnalysis(req: Request, res: Response): Promise<void> {
  const parseResult = createAnalysisSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: parseResult.error.errors[0].message,
    });
    return;
  }

  const { pullRequestUrl, enableLLM } = parseResult.data;

  let parsed;
  try {
    parsed = parsePullRequestUrl(pullRequestUrl);
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
    return;
  }

  const { owner, repo, pullNumber } = parsed;
  const fullName = `${owner}/${repo}`.toLowerCase();

  try {
    // 1. Ensure Repository record exists
    let repoDoc = await Repository.findOne({ fullName });
    if (!repoDoc) {
      repoDoc = await Repository.create({
        owner,
        name: repo,
        fullName,
        htmlUrl: `https://github.com/${owner}/${repo}`,
        isPrivate: false,
      });
    }

    // 2. Fetch PR metadata from GitHub
    const prMeta = await fetchPullRequestMetadata(owner, repo, pullNumber);

    // 3. Ensure PullRequest record exists or update
    let prDoc = await PullRequest.findOne({ owner, repo, number: pullNumber });
    if (!prDoc) {
      prDoc = await PullRequest.create({
        repository: repoDoc._id,
        owner,
        repo,
        number: pullNumber,
        title: prMeta.title,
        body: prMeta.body,
        author: prMeta.author,
        authorAvatarUrl: prMeta.authorAvatarUrl,
        state: prMeta.state,
        htmlUrl: prMeta.htmlUrl,
        baseBranch: prMeta.baseBranch,
        headBranch: prMeta.headBranch,
        baseSha: prMeta.baseSha,
        headSha: prMeta.headSha,
        additions: prMeta.additions,
        deletions: prMeta.deletions,
        changedFilesCount: prMeta.changedFilesCount,
      });
    } else {
      prDoc.title = prMeta.title;
      prDoc.additions = prMeta.additions;
      prDoc.deletions = prMeta.deletions;
      prDoc.changedFilesCount = prMeta.changedFilesCount;
      prDoc.headSha = prMeta.headSha;
      await prDoc.save();
    }

    // 4. Create AnalysisJob
    const job = await AnalysisJob.create({
      repository: repoDoc._id,
      pullRequest: prDoc._id,
      isAnonymous: true,
      status: 'in_progress',
      progressPercent: 5,
      statusMessage: 'Fetching pull request changes from GitHub...',
      totalFilesChanged: prMeta.changedFilesCount,
      enableLLM,
    });

    // Send immediate response so client can begin polling progress
    res.status(202).json({
      success: true,
      message: 'Analysis initiated',
      data: {
        analysisId: job._id.toString(),
        repository: { owner, repo, fullName },
        pullRequest: {
          number: pullNumber,
          title: prMeta.title,
          author: prMeta.author,
          additions: prMeta.additions,
          deletions: prMeta.deletions,
        },
      },
    });

    // Run async analysis pipeline in the background
    (async () => {
      try {
        const files = await fetchPullRequestFiles(owner, repo, pullNumber);

        const result = await analyzePullRequest(
          prMeta,
          files,
          undefined,
          async (percent, message) => {
            await AnalysisJob.findByIdAndUpdate(job._id, {
              progressPercent: percent,
              statusMessage: message,
            });
          }
        );

        // Delete any existing findings for this analysis
        await ReviewFinding.deleteMany({ analysisId: job._id });

        // Save findings to MongoDB
        const findingDocs = result.findings.map((f) => ({
          analysisId: job._id,
          ruleId: f.ruleId,
          title: f.title,
          category: f.category,
          severity: f.severity,
          filePath: f.filePath,
          line: f.line,
          endLine: f.endLine,
          explanation: f.explanation,
          suggestion: f.suggestion,
          suggestedPatch: f.suggestedPatch,
          codeSnippet: f.codeSnippet,
          confidence: f.confidence,
          source: f.source,
          isDeterministic: f.isDeterministic,
        }));

        if (findingDocs.length > 0) {
          await ReviewFinding.insertMany(findingDocs);
        }

        // Save AnalysisReport
        await AnalysisReport.findOneAndUpdate(
          { analysisId: job._id },
          {
            analysisId: job._id,
            summary: result.report.summary,
            keyConcerns: result.report.keyConcerns,
            testingRecommendations: result.report.testingRecommendations,
            securityObservations: result.report.securityObservations,
            findingsCount: result.report.findingsCount,
            riskAssessment: result.report.riskAssessment,
          },
          { upsert: true, new: true }
        );

        // Mark Job Completed
        await AnalysisJob.findByIdAndUpdate(job._id, {
          status: 'completed',
          progressPercent: 100,
          statusMessage: 'Analysis complete',
          filesAnalyzed: result.filesAnalyzed,
          completedAt: new Date(),
        });
      } catch (pipelineErr: any) {
        console.error(`[AnalysisJob] Pipeline failed for ${job._id}:`, pipelineErr);
        await AnalysisJob.findByIdAndUpdate(job._id, {
          status: 'failed',
          error: pipelineErr.message || 'Analysis pipeline encountered an error',
          statusMessage: 'Failed to complete analysis',
        });
      }
    })();
  } catch (err: any) {
    console.error('[createAnalysis] Error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to initialize analysis',
    });
  }
}

export async function getAnalysisStatus(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, error: 'Invalid analysis ID' });
    return;
  }

  const job = await AnalysisJob.findById(id).select('status progressPercent statusMessage error filesAnalyzed');
  if (!job) {
    res.status(404).json({ success: false, error: 'Analysis job not found' });
    return;
  }

  res.json({
    success: true,
    data: {
      status: job.status,
      progressPercent: job.progressPercent,
      statusMessage: job.statusMessage,
      error: job.error,
      filesAnalyzed: job.filesAnalyzed,
    },
  });
}

export async function getAnalysis(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, error: 'Invalid analysis ID' });
    return;
  }

  const job = await AnalysisJob.findById(id)
    .populate('repository')
    .populate('pullRequest');

  if (!job) {
    res.status(404).json({ success: false, error: 'Analysis job not found' });
    return;
  }

  const report = await AnalysisReport.findOne({ analysisId: job._id });
  const findings = await ReviewFinding.find({ analysisId: job._id }).sort({
    severity: 1, // Will sort in application code
    line: 1,
  });

  res.json({
    success: true,
    data: {
      job,
      report,
      findings,
    },
  });
}

export async function getAnalysisFindings(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, error: 'Invalid analysis ID' });
    return;
  }

  const { severity, category, file } = req.query;
  const filter: any = { analysisId: id };

  if (severity && typeof severity === 'string') {
    filter.severity = severity;
  }
  if (category && typeof category === 'string') {
    filter.category = category;
  }
  if (file && typeof file === 'string') {
    filter.filePath = file;
  }

  const findings = await ReviewFinding.find(filter).sort({ line: 1 });
  res.json({
    success: true,
    data: findings,
  });
}

export async function getAnalysisReport(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, error: 'Invalid analysis ID' });
    return;
  }

  const report = await AnalysisReport.findOne({ analysisId: id });
  if (!report) {
    res.status(404).json({ success: false, error: 'Report not found' });
    return;
  }

  res.json({
    success: true,
    data: report,
  });
}

export async function exportAnalysisMarkdown(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, error: 'Invalid analysis ID' });
    return;
  }

  const job = await AnalysisJob.findById(id).populate('repository').populate('pullRequest');
  if (!job) {
    res.status(404).json({ success: false, error: 'Analysis not found' });
    return;
  }

  const report = await AnalysisReport.findOne({ analysisId: job._id });
  const findings = await ReviewFinding.find({ analysisId: job._id });

  const repo: any = job.repository;
  const pr: any = job.pullRequest;

  let md = `# CodeSense AI — Code Review Report\n\n`;
  md += `**Repository:** [${repo.fullName}](${repo.htmlUrl})\n`;
  md += `**Pull Request:** [#${pr.number} — ${pr.title}](${pr.htmlUrl})\n`;
  md += `**Author:** @${pr.author}\n`;
  md += `**Date:** ${new Date().toUTCString()}\n`;
  md += `**Risk Level:** ${report?.riskAssessment?.riskLevel?.toUpperCase()} (Score: ${report?.riskAssessment?.overallScore}/100)\n\n`;
  md += `## Executive Summary\n${report?.summary || 'Analysis completed.'}\n\n`;

  if (report?.keyConcerns && report.keyConcerns.length > 0) {
    md += `## Key Concerns\n`;
    for (const c of report.keyConcerns) {
      md += `- ${c}\n`;
    }
    md += `\n`;
  }

  md += `## Findings Summary\n`;
  md += `| Severity | Count |\n| --- | --- |\n`;
  md += `| Critical | ${report?.findingsCount?.critical || 0} |\n`;
  md += `| High | ${report?.findingsCount?.high || 0} |\n`;
  md += `| Medium | ${report?.findingsCount?.medium || 0} |\n`;
  md += `| Low | ${report?.findingsCount?.low || 0} |\n`;
  md += `| Informational | ${report?.findingsCount?.informational || 0} |\n\n`;

  md += `## Detailed Findings (${findings.length})\n\n`;
  for (const f of findings) {
    md += `### [${f.severity.toUpperCase()}] ${f.title}\n`;
    md += `- **File:** \`${f.filePath}:${f.line}\`\n`;
    md += `- **Rule:** \`${f.ruleId}\` (${f.category})\n`;
    md += `- **Source:** ${f.source} (${f.isDeterministic ? 'Deterministic' : 'Heuristic/AI'})\n\n`;
    md += `**Explanation:**\n${f.explanation}\n\n`;
    if (f.suggestion) {
      md += `**Recommendation:**\n${f.suggestion}\n\n`;
    }
    if (f.codeSnippet) {
      md += `\`\`\`typescript\n${f.codeSnippet}\n\`\`\`\n\n`;
    }
  }

  md += `## Limitations & Methodology\n`;
  md += `Automated code analysis by CodeSense AI combines deterministic AST parsing, rule-based heuristics, and defect risk estimation. It highlights potential issues and regressions but does not guarantee the absence of defects. Manual peer review remains recommended for safety-critical releases.\n`;

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="codesense-review-${repo.name}-pr${pr.number}.md"`);
  res.send(md);
}

export async function chatAnalysis(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const question = req.body.question || req.body.message;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, error: 'Invalid analysis ID' });
    return;
  }

  if (!question || typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ success: false, error: 'Question must be a non-empty string' });
    return;
  }

  const job = await AnalysisJob.findById(id).populate('repository').populate('pullRequest');
  if (!job) {
    res.status(404).json({ success: false, error: 'Analysis not found' });
    return;
  }

  const { askAssistantQuestion } = await import('../services/llmService');
  const report = await AnalysisReport.findOne({ analysisId: job._id });
  const findings = await ReviewFinding.find({ analysisId: job._id });

  const repo: any = job.repository;
  const pr: any = job.pullRequest;

  const answer = await askAssistantQuestion(question, {
    prTitle: pr.title,
    repo: repo.fullName,
    findings: findings as any,
    report: report as any,
  });

  res.json({
    success: true,
    data: {
      answer,
      timestamp: new Date().toISOString(),
    },
  });
}
