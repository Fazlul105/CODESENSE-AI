import { Request, Response } from 'express';
import { AnalysisJob, AnalysisReport, ReviewFinding } from '../models';

export async function listAnalyses(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 10;
  const status = req.query.status as string;

  const query: any = {};
  if (status) {
    query.status = status;
  }

  const skip = (page - 1) * limit;

  const [total, jobs] = await Promise.all([
    AnalysisJob.countDocuments(query),
    AnalysisJob.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('repository')
      .populate('pullRequest'),
  ]);

  // Attach report summaries to jobs
  const jobIds = jobs.map((j) => j._id);
  const reports = await AnalysisReport.find({ analysisId: { $in: jobIds } });
  const reportMap = new Map(reports.map((r) => [r.analysisId.toString(), r]));

  const enriched = jobs.map((job) => {
    const rep = reportMap.get(job._id.toString());
    return {
      id: job._id,
      status: job.status,
      progressPercent: job.progressPercent,
      statusMessage: job.statusMessage,
      repository: job.repository,
      pullRequest: job.pullRequest,
      filesAnalyzed: job.filesAnalyzed,
      totalFilesChanged: job.totalFilesChanged,
      riskAssessment: rep?.riskAssessment || null,
      findingsCount: rep?.findingsCount || null,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    };
  });

  res.json({
    success: true,
    data: {
      analyses: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
}

export async function getDashboardStats(req: Request, res: Response): Promise<void> {
  const [totalAnalyses, totalCompleted, reports, allFindings] = await Promise.all([
    AnalysisJob.countDocuments(),
    AnalysisJob.countDocuments({ status: 'completed' }),
    AnalysisReport.find().limit(100),
    ReviewFinding.find().select('severity category').limit(1000),
  ]);

  const severityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
  };

  const categoryCounts: Record<string, number> = {
    potential_bug: 0,
    security: 0,
    code_quality: 0,
    performance: 0,
    maintainability: 0,
  };

  for (const f of allFindings) {
    if (severityCounts[f.severity] !== undefined) {
      severityCounts[f.severity]++;
    }
    categoryCounts[f.category] = (categoryCounts[f.category] || 0) + 1;
  }

  // Calculate average risk score
  let totalScore = 0;
  let reportCount = 0;
  for (const r of reports) {
    if (r.riskAssessment?.overallScore !== undefined) {
      totalScore += r.riskAssessment.overallScore;
      reportCount++;
    }
  }
  const avgRiskScore = reportCount > 0 ? Math.round(totalScore / reportCount) : 0;

  res.json({
    success: true,
    data: {
      totalAnalyses,
      totalCompleted,
      totalFindings: allFindings.length,
      avgRiskScore,
      severityCounts,
      categoryCounts,
    },
  });
}
