import rateLimit from 'express-rate-limit';
import { config } from '../config';

const isTest = config.env === 'test';

/**
 * General API limiter across all endpoints to prevent basic DoS.
 */
export const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isTest ? 100000 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP. Please try again shortly.',
  },
});

/**
 * Dedicated limiter for high-resource analysis job creations.
 * Protects GitHub API quota, Babel AST parser, and ML inference service.
 */
export const analysisCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 100000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Analysis creation limit reached. Please wait before analyzing another pull request.',
  },
});

/**
 * Dedicated limiter for Gemini AI and LLM assistant interactions.
 * Protects paid LLM API token quotas and prevents chatbot spam.
 */
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isTest ? 100000 : config.limits.maxChatRequestsPerMinute || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'AI chat request limit reached. Please wait a moment before sending another prompt.',
  },
});

/**
 * Limiter for Markdown and report generation exports.
 */
export const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 100000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Report export limit reached. Please try again later.',
  },
});
