import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { config } from './config';
import { attachUser } from './middleware/auth';
import { generalApiLimiter } from './middleware/rateLimiters';
import analysisRoutes from './routes/analysisRoutes';
import repositoryRoutes from './routes/repositoryRoutes';
import authRoutes from './routes/authRoutes';

const app = express();

// Trust reverse proxy (Render, Cloudflare, AWS) so secure cookies work properly
app.set('trust proxy', 1);

// Security headers
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Strict, configurable CORS origin validation
const allowedOriginsSet = new Set(config.allowedOrigins);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (e.g. server-to-server, curl, tests)
      if (!origin) {
        return callback(null, true);
      }

      // Check configured allowed origins
      if (allowedOriginsSet.has(origin)) {
        return callback(null, true);
      }

      // Check Vercel deployments for CodeSense AI
      if (
        origin === 'https://codesense-ai-iota.vercel.app' ||
        /^https:\/\/codesense-ai-[a-z0-9-]+\.vercel\.app$/.test(origin)
      ) {
        return callback(null, true);
      }

      // In development or test, allow local loopback origins
      if (config.env === 'development' || config.env === 'test') {
        if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
      }

      // Reject all unauthorized browser origins
      return callback(null, false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(config.sessionSecret));

// Session handling with secure cookies & proxy awareness
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: config.env === 'production',
      sameSite: config.env === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// Attach authenticated user if session is present
app.use(attachUser);

if (config.env !== 'test') {
  app.use(morgan('dev'));
}

// Global API rate limiter
app.use('/api', generalApiLimiter);

// Health check endpoint (sanitized - no database hosts or internal topology leaked)
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'CodeSense AI API',
    version: '1.0.0',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// System status and configuration endpoint (sanitized)
app.get('/api/system/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      database: {
        connected: mongoose.connection.readyState === 1,
      },
      github: {
        hasToken: Boolean(config.github.token),
        hasOAuth: Boolean(config.github.clientId && config.github.clientSecret),
      },
      ai: {
        activeProvider: config.aiProvider,
        gemini: {
          configured: Boolean(config.gemini.apiKey),
          model: config.gemini.model,
          active: config.aiProvider === 'gemini' && Boolean(config.gemini.apiKey),
        },
        openai: {
          configured: Boolean(config.llm.apiKey),
          model: config.llm.model,
          active: config.aiProvider === 'openai' && Boolean(config.llm.apiKey),
        },
      },
      mlService: {
        configured: Boolean(config.mlServiceUrl),
      },
    },
  });
});

// Mount application routes
app.use('/api/analyses', analysisRoutes);
app.use('/api/repositories', repositoryRoutes);
app.use('/api/auth', authRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized secure error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const errorId = crypto.randomUUID();
  console.error(`[API Error ${errorId}]:`, err.message || err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: status < 500 ? err.message : 'Internal Server Error. Please reference error ID with support.',
    errorId,
    ...(config.env === 'development' ? { stack: err.stack } : {}),
  });
});

export default app;
