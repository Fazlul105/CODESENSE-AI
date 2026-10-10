import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { config } from './config';
import analysisRoutes from './routes/analysisRoutes';
import repositoryRoutes from './routes/repositoryRoutes';
import authRoutes from './routes/authRoutes';

const app = express();

// Security and utility middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        origin === config.frontendUrl ||
        origin === 'https://codesense-ai-iota.vercel.app' ||
        origin.endsWith('.vercel.app') ||
        origin === 'http://localhost:3000' ||
        origin === 'http://127.0.0.1:3000'
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

import rateLimit from 'express-rate-limit';

if (config.env !== 'test') {
  app.use(morgan('dev'));
}

// Global API rate limiter to protect public endpoints from abuse
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.env === 'test' ? 10000 : 120,
  message: { success: false, error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'CodeSense AI API',
    version: '1.0.0',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    databaseName: mongoose.connection.name || null,
    databaseHost: mongoose.connection.host || null,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// System status and configuration endpoint
app.get('/api/system/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      database: {
        connected: mongoose.connection.readyState === 1,
        host: mongoose.connection.host || null,
        name: mongoose.connection.name || null,
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
        url: config.mlServiceUrl,
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

// Centralized error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[API Error]:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: err.message || 'Internal Server Error',
    ...(config.env === 'development' ? { stack: err.stack } : {}),
  });
});

export default app;
