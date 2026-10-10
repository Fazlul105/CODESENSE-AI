import { ReviewFinding, RiskAssessment, RiskFactor, RiskLevel } from '@codesense/shared';

export interface RiskInputMetrics {
  additions: number;
  deletions: number;
  changedFilesCount: number;
  findings: ReviewFinding[];
}

export function calculateHeuristicRisk(metrics: RiskInputMetrics): RiskAssessment {
  const { additions, deletions, changedFilesCount, findings } = metrics;
  const factors: RiskFactor[] = [];

  let score = 5; // Baseline minimum risk for any modified code

  // 1. Churn Factor (lines added + deleted)
  const totalChurn = additions + deletions;
  let churnScore = 0;
  if (totalChurn > 1000) {
    churnScore = 25;
    factors.push({
      factor: 'Very High Code Churn (>1000 lines)',
      impact: 'Large surface area for regressions and bugs',
      weight: 25,
    });
  } else if (totalChurn > 300) {
    churnScore = 15;
    factors.push({
      factor: 'Substantial Code Churn (>300 lines)',
      impact: 'Significant change volume increases review complexity',
      weight: 15,
    });
  } else if (totalChurn > 50) {
    churnScore = 8;
    factors.push({
      factor: 'Moderate Code Churn',
      impact: 'Moderate change volume',
      weight: 8,
    });
  }
  score += churnScore;

  // 2. File Spread Factor
  let fileSpreadScore = 0;
  if (changedFilesCount > 15) {
    fileSpreadScore = 20;
    factors.push({
      factor: 'Broad Cross-Module Spread (>15 files)',
      impact: 'Changes span multiple subsystems, increasing coupling risks',
      weight: 20,
    });
  } else if (changedFilesCount > 5) {
    fileSpreadScore = 10;
    factors.push({
      factor: 'Multi-File Modification (>5 files)',
      impact: 'Changes touch multiple files',
      weight: 10,
    });
  }
  score += fileSpreadScore;

  // 3. Finding Severities
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  for (const f of findings) {
    if (f.severity === 'critical') criticalCount++;
    else if (f.severity === 'high') highCount++;
    else if (f.severity === 'medium') mediumCount++;
    else if (f.severity === 'low') lowCount++;
  }

  if (criticalCount > 0) {
    const criticalImpact = criticalCount * 25;
    score += criticalImpact;
    factors.push({
      factor: `${criticalCount} Critical Severity Issue(s)`,
      impact: 'Immediate security or crash hazards detected',
      weight: criticalImpact,
    });
  }

  if (highCount > 0) {
    const highImpact = highCount * 15;
    score += highImpact;
    factors.push({
      factor: `${highCount} High Severity Issue(s)`,
      impact: 'Likely bugs or unhandled edge cases',
      weight: highImpact,
    });
  }

  if (mediumCount > 0) {
    const medImpact = Math.min(25, mediumCount * 7);
    score += medImpact;
    factors.push({
      factor: `${mediumCount} Medium Severity Issue(s)`,
      impact: 'Potential logic discrepancies or code smells',
      weight: medImpact,
    });
  }

  if (lowCount > 0) {
    const lowImpact = Math.min(10, lowCount * 3);
    score += lowImpact;
    factors.push({
      factor: `${lowCount} Low Severity Finding(s)`,
      impact: 'Minor styling or best-practice divergence',
      weight: lowImpact,
    });
  }

  const overallScore = Math.min(100, Math.max(5, Math.round(score)));

  let riskLevel: RiskLevel = 'low';
  if (overallScore >= 75) {
    riskLevel = 'critical';
  } else if (overallScore >= 50) {
    riskLevel = 'high';
  } else if (overallScore >= 25) {
    riskLevel = 'medium';
  }

  const summary =
    riskLevel === 'critical'
      ? 'Critical defect risk: PR contains high-impact security or bug findings requiring immediate remediation before merge.'
      : riskLevel === 'high'
      ? 'Elevated defect risk: PR touches significant code surface or contains high-severity warnings.'
      : riskLevel === 'medium'
      ? 'Moderate defect risk: Standard change with manageable complexity and some code-quality suggestions.'
      : 'Low defect risk: Clean change with low churn and no critical issues observed.';

  return {
    overallScore,
    riskLevel,
    method: 'heuristic',
    factors,
    summary,
  };
}
