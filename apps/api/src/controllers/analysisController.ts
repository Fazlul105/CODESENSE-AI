import { Request, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { config } from '../config';
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
import { canAccessAnalysis } from '../middleware/auth';
import { redactSensitiveData } from '../utils/redact';

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
  const currentUser = req.user;

  try {
    // 1. Fetch PR metadata from GitHub
    const prMeta = await fetchPullRequestMetadata(owner, repo, pullNumber);

    // 2. Ensure Repository record exists
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

    // 3. Security Policy: Reject anonymous analysis of private repositories
    if (repoDoc.isPrivate && !currentUser) {
      res.status(403).json({
        success: false,
        error: 'Anonymous users can only analyze public repositories. Please log in with GitHub to analyze private repositories.',
      });
      return;
    }

    // 4. Ensure PullRequest record exists or update
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

    // 5. Create AnalysisJob associated with user if authenticated
    const job = await AnalysisJob.create({
      user: currentUser ? currentUser._id : undefined,
      isAnonymous: !Boolean(currentUser),
      repository: repoDoc._id,
      pullRequest: prDoc._id,
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

    // Run async analysis pipeline with timeout guard
    (async () => {
      const timeoutMs = config.limits.analysisTimeoutMs || 120000;
      let isTimedOut = false;
      const timer = setTimeout(async () => {
        isTimedOut = true;
        await AnalysisJob.findByIdAndUpdate(job._id, {
          status: 'failed',
          error: `Analysis job exceeded execution timeout limit (${timeoutMs / 1000}s)`,
          statusMessage: 'Job execution timed out',
        });
      }, timeoutMs);

      try {
        const files = await fetchPullRequestFiles(owner, repo, pullNumber);

        if (isTimedOut) return;

        const result = await analyzePullRequest(
          prMeta,
          files,
          currentUser?.accessToken || undefined,
          async (percent, message) => {
            if (!isTimedOut) {
              await AnalysisJob.findByIdAndUpdate(job._id, {
                progressPercent: percent,
                statusMessage: message,
              });
            }
          }
        );

        if (isTimedOut) return;

        // Delete any existing findings for this analysis
        await ReviewFinding.deleteMany({ analysisId: job._id });

        // Save findings to MongoDB with secret redaction applied to snippets & patches
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
          suggestedPatch: f.suggestedPatch ? redactSensitiveData(f.suggestedPatch) : undefined,
          codeSnippet: f.codeSnippet ? redactSensitiveData(f.codeSnippet) : undefined,
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

        // Trigger background RAG indexing if feature flag is active and repository is public
        if (config.rag?.enabled && !repoDoc.isPrivate) {
          const { indexAnalysisSourceCode } = await import('../rag/indexingService');
          indexAnalysisSourceCode({
            analysisId: job._id.toString(),
            prMeta,
            files,
            isPrivateRepo: false,
            token: currentUser?.accessToken || undefined,
          }).catch((ragErr) => {
            console.warn(`[RAG Indexing] Background job error for ${job._id}:`, ragErr.message);
          });
        }
      } catch (pipelineErr: any) {
        if (!isTimedOut) {
          console.error(`[AnalysisJob] Pipeline failed for ${job._id}:`, pipelineErr);
          await AnalysisJob.findByIdAndUpdate(job._id, {
            status: 'failed',
            error: pipelineErr.message || 'Analysis pipeline encountered an error',
            statusMessage: 'Failed to complete analysis',
          });
        }
      } finally {
        clearTimeout(timer);
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

  const job = await AnalysisJob.findById(id).select('status progressPercent statusMessage error filesAnalyzed repository user isAnonymous');
  if (!job) {
    res.status(404).json({ success: false, error: 'Analysis job not found' });
    return;
  }

  const access = await canAccessAnalysis(job, req.user);
  if (!access.allowed) {
    res.status(403).json({ success: false, error: access.reason });
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

  const access = await canAccessAnalysis(job, req.user);
  if (!access.allowed) {
    res.status(403).json({ success: false, error: access.reason });
    return;
  }

  const report = await AnalysisReport.findOne({ analysisId: job._id });
  const findings = await ReviewFinding.find({ analysisId: job._id }).sort({
    severity: 1,
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

  const job = await AnalysisJob.findById(id);
  if (!job) {
    res.status(404).json({ success: false, error: 'Analysis job not found' });
    return;
  }

  const access = await canAccessAnalysis(job, req.user);
  if (!access.allowed) {
    res.status(403).json({ success: false, error: access.reason });
    return;
  }

  const { severity, category, file } = req.query;
  const filter: any = { analysisId: id };

  if (severity && typeof severity === 'string' && severity !== 'all') {
    filter.severity = severity;
  }
  if (category && typeof category === 'string' && category !== 'all') {
    filter.category = category;
  }
  if (file && typeof file === 'string' && file !== 'all') {
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

  const job = await AnalysisJob.findById(id);
  if (!job) {
    res.status(404).json({ success: false, error: 'Analysis not found' });
    return;
  }

  const access = await canAccessAnalysis(job, req.user);
  if (!access.allowed) {
    res.status(403).json({ success: false, error: access.reason });
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

  const access = await canAccessAnalysis(job, req.user);
  if (!access.allowed) {
    res.status(403).json({ success: false, error: access.reason });
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

  const sanitizedMarkdown = redactSensitiveData(md);

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="codesense-review-${repo.name}-pr${pr.number}.md"`);
  res.send(sanitizedMarkdown);
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

  const access = await canAccessAnalysis(job, req.user);
  if (!access.allowed) {
    res.status(403).json({ success: false, error: access.reason });
    return;
  }

  const { askAssistantQuestion } = await import('../services/llmService');
  const report = await AnalysisReport.findOne({ analysisId: job._id });
  const findings = await ReviewFinding.find({ analysisId: job._id });

  const repo: any = job.repository;
  const pr: any = job.pullRequest;

  const result = await askAssistantQuestion(
    redactSensitiveData(question),
    {
      prTitle: pr.title,
      repo: repo.fullName,
      findings: findings as any,
      report: report as any,
    },
    {
      analysisId: job._id.toString(),
      commitSha: pr.headSha,
      isPrivate: repo.isPrivate === true,
    }
  );

  res.json({
    success: true,
    data: {
      answer: redactSensitiveData(result.answer),
      references: result.references || [],
      ragUsed: Boolean(result.ragUsed),
      timestamp: new Date().toISOString(),
    },
  });
}

export async function getAnalysisRagStatus(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, error: 'Invalid analysis ID' });
    return;
  }

  const job = await AnalysisJob.findById(id).populate('repository');
  if (!job) {
    res.status(404).json({ success: false, error: 'Analysis job not found' });
    return;
  }

  const access = await canAccessAnalysis(job, req.user);
  if (!access.allowed) {
    res.status(403).json({ success: false, error: access.reason });
    return;
  }

  const repo: any = job.repository;
  const { getIndexingStatus } = await import('../rag/indexingService');
  const { CodeChunk } = await import('../rag/models/CodeChunk');

  const inMemoryStatus = getIndexingStatus(id);
  const storedChunkCount = await CodeChunk.countDocuments({ analysisId: job._id });

  let computedStatus = inMemoryStatus.status;
  if (repo.isPrivate) {
    computedStatus = 'skipped_private';
  } else if (storedChunkCount > 0) {
    computedStatus = 'indexed';
  }

  res.json({
    success: true,
    data: {
      enabled: Boolean(config.rag?.enabled),
      isIndexed: storedChunkCount > 0,
      status: computedStatus,
      chunkCount: storedChunkCount,
      commitSha: inMemoryStatus.commitSha,
      indexedAt: inMemoryStatus.indexedAt,
      embeddingModel: config.rag?.embeddingModel || 'gemini-embedding-001',
    },
  });
}

export async function triggerAnalysisRagIndex(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, error: 'Invalid analysis ID' });
    return;
  }

  const job = await AnalysisJob.findById(id).populate('repository').populate('pullRequest');
  if (!job) {
    res.status(404).json({ success: false, error: 'Analysis job not found' });
    return;
  }

  const access = await canAccessAnalysis(job, req.user);
  if (!access.allowed) {
    res.status(403).json({ success: false, error: access.reason });
    return;
  }

  const repo: any = job.repository;
  const pr: any = job.pullRequest;

  if (repo.isPrivate) {
    res.status(403).json({
      success: false,
      error: 'RAG indexing is restricted to public repositories pending cryptographic token authorization.',
    });
    return;
  }

  // Trigger background indexing asynchronously
  (async () => {
    try {
      const { fetchPullRequestMetadata, fetchPullRequestFiles } = await import('../integrations/github');
      const { indexAnalysisSourceCode } = await import('../rag/indexingService');
      const prMeta = await fetchPullRequestMetadata(repo.owner, repo.name, pr.number);
      const files = await fetchPullRequestFiles(repo.owner, repo.name, pr.number);
      await indexAnalysisSourceCode({
        analysisId: job._id.toString(),
        prMeta,
        files,
        isPrivateRepo: false,
      });
    } catch (err: any) {
      console.warn(`[triggerAnalysisRagIndex] Background indexing failed for ${job._id}:`, err.message);
    }
  })();

  res.status(202).json({
    success: true,
    message: 'RAG indexing initiated successfully in the background.',
  });
}

export async function searchAnalysisRag(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const query = req.body.query || req.body.question;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, error: 'Invalid analysis ID' });
    return;
  }

  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({ success: false, error: 'Search query must be a non-empty string' });
    return;
  }

  const job = await AnalysisJob.findById(id).populate('repository').populate('pullRequest');
  if (!job) {
    res.status(404).json({ success: false, error: 'Analysis job not found' });
    return;
  }

  const access = await canAccessAnalysis(job, req.user);
  if (!access.allowed) {
    res.status(403).json({ success: false, error: access.reason });
    return;
  }

  const repo: any = job.repository;
  const pr: any = job.pullRequest;

  const { retrieveRelevantCode } = await import('../rag/retriever');
  const results = await retrieveRelevantCode({
    question: redactSensitiveData(query),
    analysisId: id,
    repository: repo.fullName,
    commitSha: pr.headSha,
    topK: Math.min(parseInt(req.body.limit || '6', 10), 10),
  });

  res.json({
    success: true,
    data: results,
  });
}
