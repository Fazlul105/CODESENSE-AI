import { Router, Request, Response } from 'express';
import { getOctokitClient } from '../integrations/github';
import { Repository } from '../models';

const router = Router();

// GET /api/repositories — list cached repositories
router.get('/', async (req: Request, res: Response) => {
  try {
    const repos = await Repository.find().sort({ updatedAt: -1 }).limit(20);
    res.json({ success: true, data: repos });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/repositories/:owner/:repo/pulls — fetch pull requests for a public repo from GitHub
router.get('/:owner/:repo/pulls', async (req: Request, res: Response) => {
  const { owner, repo } = req.params;
  const state = (req.query.state as 'open' | 'closed' | 'all') || 'open';

  try {
    const octokit = getOctokitClient();
    const { data: pulls } = await octokit.rest.pulls.list({
      owner,
      repo,
      state,
      per_page: 20,
    });

    const formatted = pulls.map((p) => ({
      number: p.number,
      title: p.title,
      author: p.user?.login,
      authorAvatarUrl: p.user?.avatar_url,
      state: p.state,
      htmlUrl: p.html_url,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));

    res.json({ success: true, data: formatted });
  } catch (err: any) {
    res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Failed to fetch pull requests from GitHub',
    });
  }
});

export default router;
