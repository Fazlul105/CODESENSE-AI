import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from './app';
import { connectDatabase, disconnectDatabase } from './database/db';
import { Repository, PullRequest, AnalysisJob, ReviewFinding, AnalysisReport } from './models';

describe('End-to-End API Suite', () => {
  const cleanupTestData = async () => {
    const repos = await Repository.find({ owner: 'testowner' });
    const repoIds = repos.map(r => r._id);
    const prs = await PullRequest.find({ repository: { $in: repoIds } });
    const prIds = prs.map(p => p._id);
    const jobs = await AnalysisJob.find({ pullRequest: { $in: prIds } });
    const jobIds = jobs.map(j => j._id);
    await ReviewFinding.deleteMany({ analysisId: { $in: jobIds } });
    await AnalysisReport.deleteMany({ analysisId: { $in: jobIds } });
    await AnalysisJob.deleteMany({ _id: { $in: jobIds } });
    await PullRequest.deleteMany({ _id: { $in: prIds } });
    await Repository.deleteMany({ _id: { $in: repoIds } });
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase();
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await disconnectDatabase();
  });

  it('GET /api/health returns 200 and connected database state', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('connected');
  });

  it('GET /api/auth/me returns anonymous user session info', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isAuthenticated).toBe(false);
  });

  it('POST /api/analyses rejects invalid URL formats', async () => {
    const res = await request(app)
      .post('/api/analyses')
      .send({ pullRequestUrl: 'https://invalid-site.com/test' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Invalid GitHub Pull Request URL');
  });

  it('Analysis lifecycle: saves job, report, and retrieves via API endpoints', async () => {
    // 1. Seed simulated repository & pull request
    const repo = await Repository.create({
      owner: 'testowner',
      name: 'testrepo',
      fullName: 'testowner/testrepo',
      htmlUrl: 'https://github.com/testowner/testrepo',
      isPrivate: false,
    });

    const pr = await PullRequest.create({
      repository: repo._id,
      owner: 'testowner',
      repo: 'testrepo',
      number: 101,
      title: 'Fix edge case in auth token validator',
      author: 'dev-alice',
      state: 'open',
      htmlUrl: 'https://github.com/testowner/testrepo/pull/101',
      baseBranch: 'main',
      headBranch: 'patch-1',
      additions: 45,
      deletions: 12,
      changedFilesCount: 2,
    });

    // 2. Create AnalysisJob
    const job = await AnalysisJob.create({
      repository: repo._id,
      pullRequest: pr._id,
      isAnonymous: true,
      status: 'completed',
      progressPercent: 100,
      statusMessage: 'Analysis complete',
      filesAnalyzed: 2,
      totalFilesChanged: 2,
    });

    // 3. Create Sample ReviewFinding
    await ReviewFinding.create({
      analysisId: job._id,
      ruleId: 'suspicious-nan-comparison',
      title: 'Direct comparison with NaN always fails',
      category: 'potential_bug',
      severity: 'high',
      filePath: 'src/auth.ts',
      line: 34,
      explanation: 'In JavaScript, NaN === NaN is false.',
      suggestion: 'Use Number.isNaN(val)',
      confidence: 'high',
      source: 'static_analysis',
      isDeterministic: true,
    });

    // 4. Create AnalysisReport
    await AnalysisReport.create({
      analysisId: job._id,
      summary: 'Analysis completed with 1 finding.',
      keyConcerns: ['1 high-severity defect detected'],
      testingRecommendations: ['Add NaN edge-case unit test'],
      securityObservations: ['No credentials exposed'],
      findingsCount: { critical: 0, high: 1, medium: 0, low: 0, informational: 0, total: 1 },
      riskAssessment: {
        overallScore: 28,
        riskLevel: 'medium',
        method: 'heuristic',
        factors: [{ factor: '1 High Severity Issue', impact: 'Potential logic defect', weight: 15 }],
        summary: 'Moderate defect risk.',
      },
    });

    // 5. Test GET /api/analyses/:id
    const getRes = await request(app).get(`/api/analyses/${job._id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.job.status).toBe('completed');
    expect(getRes.body.data.findings.length).toBe(1);
    expect(getRes.body.data.report.riskAssessment.overallScore).toBe(28);

    // 6. Test GET /api/analyses/:id/status
    const statusRes = await request(app).get(`/api/analyses/${job._id}/status`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.status).toBe('completed');
    expect(statusRes.body.data.progressPercent).toBe(100);

    // 7. Test GET /api/analyses/:id/findings with severity filter
    const findingsRes = await request(app).get(`/api/analyses/${job._id}/findings?severity=high`);
    expect(findingsRes.status).toBe(200);
    expect(findingsRes.body.data.length).toBe(1);

    // 8. Test GET /api/analyses/:id/export (Markdown)
    const exportRes = await request(app).get(`/api/analyses/${job._id}/export`);
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers['content-type']).toContain('text/markdown');
    expect(exportRes.text).toContain('# CodeSense AI — Code Review Report');
    expect(exportRes.text).toContain('Direct comparison with NaN always fails');

    // 9. Test GET /api/analyses/stats
    const statsRes = await request(app).get('/api/analyses/stats');
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.data.totalAnalyses).toBeGreaterThanOrEqual(1);

    // 10. Test POST /api/analyses/:id/chat (Contextual Assistant)
    const chatRes = await request(app)
      .post(`/api/analyses/${job._id}/chat`)
      .send({ question: 'Explain the high severity issue in this PR' });
    expect(chatRes.status).toBe(200);
    expect(chatRes.body.success).toBe(true);
    expect(chatRes.body.data.answer).toBeDefined();
  }, 30000);
});
