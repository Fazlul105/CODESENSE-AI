import dotenv from 'dotenv';
import path from 'path';

import fs from 'fs';

// Load environment variables from .env if present (supporting monorepo root and apps/api locations)
const possibleEnvPaths = [
  path.resolve(__dirname, '../../../../.env'), // From apps/api/src/config or apps/api/dist/config
  path.resolve(__dirname, '../../../.env'),
  path.resolve(process.cwd(), '../../.env'),   // When run inside apps/api workspace
  path.resolve(process.cwd(), '.env'),         // When run from repo root
];

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.API_PORT || '5001', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  allowedOrigins: (process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        'https://codesense-ai-iota.vercel.app',
      ]
  ).filter(Boolean),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/codesense_ai',
  allowMemoryDb: process.env.ALLOW_MEMORY_DB === 'true',
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    token: process.env.GITHUB_TOKEN || '', // Optional personal access token for higher GitHub rate limits (5000/hr)
  },
  sessionSecret: process.env.SESSION_SECRET || 'codesense-secret-key-32-chars-long-minimum',
  aiProvider: (process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? 'gemini' : 'openai')).toLowerCase(),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  },
  llm: {
    apiKey: process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
  },
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000',
  rag: {
    enabled: process.env.RAG_ENABLED === 'true',
    embeddingModel: process.env.RAG_EMBEDDING_MODEL || 'gemini-embedding-001',
    vectorIndexName: process.env.RAG_VECTOR_INDEX_NAME || 'vector_index',
    topK: parseInt(process.env.RAG_TOP_K || '6', 10),
    maxFiles: parseInt(process.env.RAG_MAX_FILES || '30', 10),
    maxChunks: parseInt(process.env.RAG_MAX_CHUNKS || '500', 10),
    maxContextTokens: parseInt(process.env.RAG_MAX_CONTEXT_TOKENS || '6000', 10),
    maxConcurrentEmbeddings: parseInt(process.env.RAG_MAX_CONCURRENT_EMBEDDINGS || '2', 10),
    embeddingDimension: 768,
  },
  limits: {
    maxFilesPerPr: 50,
    maxFileSizeBytes: 500 * 1024, // 500KB per file
    analysisTimeoutMs: 120 * 1000, // 2 minutes
    maxChatRequestsPerMinute: 20,
    maxAnalysesPerHourAnonymous: 10,
    maxAnalysesPerHourUser: 60,
  },
};
