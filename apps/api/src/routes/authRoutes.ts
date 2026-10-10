import { Router, Request, Response } from 'express';
import { config } from '../config';

const router = Router();

// GET /api/auth/me
router.get('/me', (req: Request, res: Response) => {
  // Return anonymous or active session user
  res.json({
    success: true,
    data: {
      isAuthenticated: false,
      user: null,
      message: 'Anonymous session active. Public pull request analysis available without login.',
    },
  });
});

// GET /api/auth/github - OAuth redirect endpoint
router.get('/github', (req: Request, res: Response) => {
  if (!config.github.clientId) {
    res.status(503).json({
      success: false,
      error: 'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env.',
    });
    return;
  }

  const redirectUri = `${config.frontendUrl}/api/auth/callback`;
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${config.github.clientId}&scope=read:user,repo&redirect_uri=${encodeURIComponent(
    redirectUri
  )}`;
  res.redirect(githubAuthUrl);
});

// POST /api/auth/logout
router.post('/logout', (req: Request, res: Response) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
