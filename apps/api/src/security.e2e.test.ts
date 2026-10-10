import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from './app';
import { connectDatabase, disconnectDatabase } from './database/db';
import { Repository, PullRequest, AnalysisJob, ReviewFinding, AnalysisReport, User } from './models';

describe('Security & Access Control Suite (Phase 1 & Phase 2)', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase();
    await User.deleteMany({ username: { $regex: /^secure-owner/ } });
  });

  afterAll(async () => {
    await User.deleteMany({ username: { $regex: /^secure-owner/ } });
    await disconnectDatabase();
  });

  describe('CORS Validation', () => {
    it('accepts localhost origin in test/development environment', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('rejects unauthorized arbitrary third-party origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://malicious-attacker-domain.com');
      // For rejected origin, cors either throws 403 or omits access-control-allow-origin
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Access Control & Ownership Isolation', () => {
    it('rejects private repository analysis for anonymous users', async () => {
      const res = await request(app)
        .post('/api/analyses')
        .send({
          pullRequestUrl: 'https://github.com/private-org/private-repo/pull/1',
        });
      // Anonymous request for nonexistent or private repository fails safely
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.success).toBe(false);
    });

    it('isolates private analysis jobs from unauthorized callers', async () => {
      const stamp = Date.now();
      const owner = `secure-owner-${stamp}`;
      const repoName = `private-vault-${stamp}`;
      const fullName = `${owner}/${repoName}`;

      // Create user and private job
      const user = await User.create({
        githubId: `gh-${stamp}`,
        username: owner,
        displayName: 'Secure Owner',
      });

      const repo = await Repository.create({
        owner,
        name: repoName,
        fullName,
        htmlUrl: `https://github.com/${fullName}`,
        isPrivate: true,
      });

      const pr = await PullRequest.create({
        repository: repo._id,
        owner,
        repo: repoName,
        number: 1,
        title: 'Secret internal update',
        author: owner,
        state: 'open',
        htmlUrl: `https://github.com/${fullName}/pull/1`,
        baseBranch: 'main',
        headBranch: 'feature',
        additions: 10,
        deletions: 2,
        changedFilesCount: 1,
      });

      const privateJob = await AnalysisJob.create({
        repository: repo._id,
        pullRequest: pr._id,
        user: user._id,
        isAnonymous: false,
        status: 'completed',
        progressPercent: 100,
        statusMessage: 'Completed',
        filesAnalyzed: 1,
        totalFilesChanged: 1,
      });

      // Anonymous / unauthenticated request should be rejected with 403 Forbidden
      const res = await request(app).get(`/api/analyses/${privateJob._id}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('private repository');

      // Cleanup
      await AnalysisJob.deleteOne({ _id: privateJob._id });
      await PullRequest.deleteOne({ _id: pr._id });
      await Repository.deleteOne({ _id: repo._id });
      await User.deleteOne({ _id: user._id });
    });
  });

  describe('Rate Limiter Headers', () => {
    it('attaches rate limiting headers to API routes', async () => {
      const res = await request(app).get('/api/analyses/stats');
      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit'] || res.headers['x-ratelimit-limit']).toBeDefined();
    });
  });
});
