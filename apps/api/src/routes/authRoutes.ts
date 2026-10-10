import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { config } from '../config';
import { User } from '../models';

const router = Router();

// GET /api/auth/me - Current user session state
router.get('/me', (req: Request, res: Response) => {
  if (req.user) {
    res.json({
      success: true,
      data: {
        isAuthenticated: true,
        user: {
          id: req.user._id.toString(),
          githubId: req.user.githubId,
          username: req.user.username,
          displayName: req.user.displayName,
          avatarUrl: req.user.avatarUrl,
          email: req.user.email,
        },
      },
    });
  } else {
    res.json({
      success: true,
      data: {
        isAuthenticated: false,
        user: null,
        message: 'Anonymous session active. Public pull request analysis available without login.',
      },
    });
  }
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

  const state = crypto.randomBytes(16).toString('hex');
  if (req.session) {
    (req.session as any).oauthState = state;
  }

  const redirectUri = `${config.frontendUrl}/api/auth/callback`;
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${config.github.clientId}&scope=read:user,repo&state=${state}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}`;

  res.redirect(githubAuthUrl);
});

// POST /api/auth/callback - OAuth code exchange
router.post('/callback', async (req: Request, res: Response) => {
  const { code, state } = req.body;

  if (!code || typeof code !== 'string') {
    res.status(400).json({ success: false, error: 'Authorization code is required' });
    return;
  }

  // Validate state if session is present
  const sessionState = (req.session as any)?.oauthState;
  if (sessionState && state && sessionState !== state) {
    res.status(400).json({ success: false, error: 'Invalid OAuth state parameter. Possible CSRF attack.' });
    return;
  }

  if (!config.github.clientId || !config.github.clientSecret) {
    res.status(503).json({ success: false, error: 'GitHub OAuth credentials not configured on backend.' });
    return;
  }

  try {
    // 1. Exchange code for access token
    const tokenRes = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
      },
      {
        headers: { Accept: 'application/json' },
        timeout: 10000,
      }
    );

    const accessToken = tokenRes.data.access_token;
    if (!accessToken) {
      res.status(400).json({
        success: false,
        error: tokenRes.data.error_description || 'Failed to obtain access token from GitHub.',
      });
      return;
    }

    // 2. Fetch authenticated user profile
    const profileRes = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'CodeSense-AI-App',
      },
      timeout: 10000,
    });

    const ghUser = profileRes.data;

    // 3. Upsert user record in MongoDB
    const user = await User.findOneAndUpdate(
      { githubId: ghUser.id.toString() },
      {
        githubId: ghUser.id.toString(),
        username: ghUser.login,
        displayName: ghUser.name || ghUser.login,
        avatarUrl: ghUser.avatar_url || '',
        email: ghUser.email || '',
        accessToken, // securely saved, excluded from default queries
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (req.session) {
      (req.session as any).userId = user._id.toString();
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user._id.toString(),
          githubId: user.githubId,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
      },
    });
  } catch (err: any) {
    console.error('[OAuth Callback Error]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to complete GitHub authentication.',
    });
  }
});

// POST /api/auth/dev-login - Development / test mock authentication
router.post('/dev-login', async (req: Request, res: Response) => {
  if (config.env === 'production') {
    res.status(403).json({ success: false, error: 'Dev login is disabled in production.' });
    return;
  }

  const username = req.body.username || 'test-developer';
  const githubId = req.body.githubId || '999999';

  let user = await User.findOne({ githubId });
  if (!user) {
    user = await User.create({
      githubId,
      username,
      displayName: `Dev ${username}`,
      avatarUrl: 'https://avatars.githubusercontent.com/u/999999?v=4',
      email: `${username}@example.com`,
    });
  }

  if (req.session) {
    (req.session as any).userId = user._id.toString();
  }

  res.json({
    success: true,
    data: {
      user: {
        id: user._id.toString(),
        githubId: user.githubId,
        username: user.username,
        displayName: user.displayName,
      },
    },
  });
});

// POST /api/auth/logout - Terminate session
router.post('/logout', (req: Request, res: Response) => {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        res.status(500).json({ success: false, error: 'Failed to destroy session.' });
        return;
      }
      res.clearCookie('connect.sid');
      res.json({ success: true, message: 'Logged out successfully' });
    });
  } else {
    res.json({ success: true, message: 'Logged out successfully' });
  }
});

export default router;
