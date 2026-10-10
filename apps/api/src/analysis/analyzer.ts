import { ChangedFile, PullRequestMetadata, ReviewFinding, AnalysisReport } from '@codesense/shared';
import { parseGitPatch, extractCodeSnippet } from './diffMapper';
import { parseSourceCode } from './astParser';
import { runPotentialBugRules, RuleContext } from './rules/potentialBugs';
import { runSecurityRules } from './rules/security';
import { runCodeQualityRules } from './rules/codeQuality';
import { calculateHeuristicRisk } from './riskCalculator';
import { fetchFileContentAtRef } from '../integrations/github';

export interface AnalysisProgressCallback {
  (progressPercent: number, message: string): void;
}

export interface AnalysisResult {
  findings: ReviewFinding[];
  report: AnalysisReport;
  filesAnalyzed: number;
}

/**
 * Reconstructs file content from patch additions if full raw file is unavailable
 */
function reconstructContentFromPatch(patch: string): string {
  const lines = patch.split('\n');
  const reconstructed: string[] = [];
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      reconstructed.push(line.slice(1));
    } else if (!line.startsWith('-') && !line.startsWith('@@')) {
      reconstructed.push(line);
    }
  }
  return reconstructed.join('\n');
}

export async function analyzePullRequest(
  pr: PullRequestMetadata,
  files: ChangedFile[],
  token?: string,
  onProgress?: AnalysisProgressCallback
): Promise<AnalysisResult> {
  const allFindings: ReviewFinding[] = [];
  let filesAnalyzed = 0;

  const supportedFiles = files.filter((f) => f.isSupported && f.status !== 'removed');
  const totalSupported = supportedFiles.length;

  onProgress?.(15, `Found ${totalSupported} supported files to inspect`);

  for (let i = 0; i < supportedFiles.length; i++) {
    const file = supportedFiles[i];
    const filePercent = Math.round(15 + ((i + 1) / (totalSupported || 1)) * 60);
    onProgress?.(filePercent, `Analyzing ${file.filename} (${i + 1}/${totalSupported})`);

    // Parse diff to know which lines were modified
    const { addedLines } = parseGitPatch(file.patch);

    // Try to fetch full head file content from GitHub; fallback to patch reconstruction
    let sourceContent: string | null = null;
    if (pr.headSha) {
      sourceContent = await fetchFileContentAtRef(pr.owner, pr.repo, file.filename, pr.headSha, token);
    }
    if (!sourceContent && file.patch) {
      sourceContent = reconstructContentFromPatch(file.patch);
    }
    if (!sourceContent) {
      continue;
    }

    // AST Parse
    const ast = parseSourceCode(sourceContent, file.filename);
    const fileFindings: ReviewFinding[] = [];

    const ctx: RuleContext = {
      filePath: file.filename,
      sourceCode: sourceContent,
      addedLines,
      findings: fileFindings,
    };

    if (ast) {
      runPotentialBugRules(ast, ctx);
      runSecurityRules(ast, ctx);
      runCodeQualityRules(ast, ctx);
    } else {
      // If AST parsing failed, run line-by-line checks safely
      runSecurityRules(null, ctx);
      runCodeQualityRules(null, ctx);
    }

    // Attach code snippets and finalize findings
    for (const finding of fileFindings) {
      if (!finding.codeSnippet && sourceContent) {
        finding.codeSnippet = extractCodeSnippet(sourceContent, finding.line);
      }
      allFindings.push(finding);
    }

    filesAnalyzed++;
  }

  onProgress?.(80, 'Calculating risk metrics and aggregating findings');

  // Compute severity distributions
  const findingsCount = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
    total: allFindings.length,
  };

  for (const f of allFindings) {
    findingsCount[f.severity]++;
  }

  // Calculate Heuristic Risk
  const riskAssessment = calculateHeuristicRisk({
    additions: pr.additions,
    deletions: pr.deletions,
    changedFilesCount: pr.changedFilesCount,
    findings: allFindings,
  });

  // Attempt ML Service Defect Prediction
  try {
    const axios = (await import('axios')).default;
    const { config } = await import('../config');
    const isBugfix = pr.title.toLowerCase().includes('fix') || (pr.body && pr.body.toLowerCase().includes('fix')) ? 1 : 0;
    const distinctExts = new Set(files.map((f) => f.filename.split('.').pop() || '')).size;

    const mlResponse = await axios.post(
      `${config.mlServiceUrl}/predict`,
      {
        lines_added: pr.additions,
        lines_deleted: pr.deletions,
        files_changed: Math.max(1, pr.changedFilesCount),
        entropy: Math.min(1.0, (distinctExts / Math.max(1, pr.changedFilesCount))),
        is_bugfix: isBugfix,
        file_types_count: Math.max(1, distinctExts),
        static_critical_findings: findingsCount.critical,
        static_high_findings: findingsCount.high,
        static_medium_findings: findingsCount.medium,
      },
      { timeout: 3000 }
    );

    if (mlResponse.data && mlResponse.data.defect_probability !== undefined) {
      const mlData = mlResponse.data;
      const mlScore = Math.round(mlData.defect_probability * 100);

      riskAssessment.method = 'ml_model';
      // Weighted combination: 60% ML Model, 40% Static Heuristic
      riskAssessment.overallScore = Math.round(mlScore * 0.6 + riskAssessment.overallScore * 0.4);
      riskAssessment.riskLevel =
        riskAssessment.overallScore >= 75
          ? 'critical'
          : riskAssessment.overallScore >= 50
          ? 'high'
          : riskAssessment.overallScore >= 25
          ? 'medium'
          : 'low';

      riskAssessment.mlDetails = {
        modelVersion: mlData.model_version,
        modelType: mlData.model_type,
        defectProbability: mlData.defect_probability,
        topFeatures: mlData.top_contributing_features.map((f: any) => ({
          feature: f.feature,
          importance: f.importance,
        })),
        evaluationMetricsSummary: mlData.evaluation_metrics_summary
          ? {
              rocAuc: mlData.evaluation_metrics_summary.roc_auc,
              prAuc: mlData.evaluation_metrics_summary.pr_auc,
              f1Score: mlData.evaluation_metrics_summary.f1_score,
            }
          : undefined,
      };

      riskAssessment.summary = `ML Defect Estimation (${mlData.model_type} v${mlData.model_version}): ${Math.round(
        mlData.defect_probability * 100
      )}% probability of introducing a regression. ${riskAssessment.summary}`;
    }
  } catch {
    // If ML service is offline, gracefully retain documented heuristic calculation
  }

  // Synthesize Summary and Observations
  const keyConcerns: string[] = [];
  if (findingsCount.critical > 0) {
    keyConcerns.push(`${findingsCount.critical} critical security or crash vulnerability requires immediate attention.`);
  }
  if (findingsCount.high > 0) {
    keyConcerns.push(`${findingsCount.high} high-severity defect risks detected in modified code paths.`);
  }
  if (pr.additions + pr.deletions > 500) {
    keyConcerns.push('Large pull request volume increases review fatigue and regression probability.');
  }

  const securityObservations: string[] = [];
  const secFindings = allFindings.filter((f) => f.category === 'security');
  if (secFindings.length > 0) {
    for (const sf of secFindings) {
      securityObservations.push(`${sf.filePath}:${sf.line} - ${sf.title}: ${sf.explanation}`);
    }
  } else {
    securityObservations.push('No obvious static security violations (eval, raw innerHTML, exposed tokens) identified.');
  }

  const testingRecommendations: string[] = [
    'Add unit test coverage for newly introduced branches and error handling paths.',
    'Verify that nullish or edge-case arguments do not trigger runtime type errors.',
  ];
  if (secFindings.length > 0) {
    testingRecommendations.push('Add security regression tests ensuring input sanitization and secret safety.');
  }

  const report: AnalysisReport = {
    analysisId: '' as any,
    summary: `Analysis completed for ${pr.owner}/${pr.repo}#${pr.pullNumber} ("${pr.title}"). Analyzed ${filesAnalyzed} file(s) with ${allFindings.length} finding(s) detected.`,
    keyConcerns,
    testingRecommendations,
    securityObservations,
    findingsCount,
    riskAssessment,
    generatedAt: new Date().toISOString(),
  };

  onProgress?.(95, 'Finalizing analysis report');

  return {
    findings: allFindings,
    report,
    filesAnalyzed,
  };
}
