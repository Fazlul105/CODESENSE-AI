import { GoogleGenAI } from '@google/genai';
import { config } from '../config';

const EMBEDDING_CACHE = new Map<string, number[]>();
const MAX_CACHE_SIZE = 2000;
const DEFAULT_DIMENSION = 768;

let cachedGenaiClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI | null {
  if (!config.gemini.apiKey) {
    return null;
  }
  if (!cachedGenaiClient) {
    cachedGenaiClient = new GoogleGenAI({
      apiKey: config.gemini.apiKey,
    });
  }
  return cachedGenaiClient;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface EmbeddingOptions {
  model?: string;
  outputDimensionality?: number;
  taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';
  maxRetries?: number;
}

/**
 * Generates an embedding vector for a single piece of text using Google Gemini embeddings.
 */
export async function generateEmbedding(
  text: string,
  cacheKey?: string,
  options: EmbeddingOptions = {}
): Promise<number[] | null> {
  if (!text || text.trim().length === 0) {
    return null;
  }

  // Check in-memory cache
  if (cacheKey && EMBEDDING_CACHE.has(cacheKey)) {
    return EMBEDDING_CACHE.get(cacheKey)!;
  }

  const client = getClient();
  if (!client) {
    return null;
  }

  const model = options.model || (config as any).rag?.embeddingModel || 'gemini-embedding-001';
  const outputDimensionality = options.outputDimensionality || DEFAULT_DIMENSION;
  const taskType = options.taskType || 'RETRIEVAL_DOCUMENT';
  const maxRetries = options.maxRetries ?? 3;

  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const response = await client.models.embedContent({
        model,
        contents: text,
        config: {
          taskType,
          outputDimensionality,
        },
      });

      const vector = response.embeddings?.[0]?.values;
      if (vector && Array.isArray(vector) && vector.length === outputDimensionality) {
        if (cacheKey) {
          if (EMBEDDING_CACHE.size >= MAX_CACHE_SIZE) {
            const firstKey = EMBEDDING_CACHE.keys().next().value;
            if (firstKey) EMBEDDING_CACHE.delete(firstKey);
          }
          EMBEDDING_CACHE.set(cacheKey, vector);
        }
        return vector;
      }

      console.warn(`[EmbeddingService] Unexpected vector dimension: ${vector?.length} (expected ${outputDimensionality})`);
      return null;
    } catch (err: any) {
      attempt++;
      const isRetryable =
        err?.status === 429 ||
        err?.status === 503 ||
        err?.message?.includes('429') ||
        err?.message?.includes('503') ||
        err?.message?.includes('RESOURCE_EXHAUSTED') ||
        err?.message?.includes('UNAVAILABLE') ||
        err?.message?.includes('high demand');

      if (isRetryable && attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`[EmbeddingService] Transient error hit (${err?.status || 'retryable'}). Retrying in ${Math.round(backoff)}ms (attempt ${attempt}/${maxRetries})...`);
        await sleep(backoff);
      } else if (attempt >= maxRetries) {
        console.error(`[EmbeddingService] Failed to embed after ${maxRetries} attempts:`, err?.message);
        return null;
      } else {
        console.warn(`[EmbeddingService] Embedding attempt ${attempt} failed:`, err?.message);
        await sleep(500);
      }
    }
  }

  return null;
}

/**
 * Generates embeddings in batches for a list of items with bounded concurrency and caching.
 */
export async function generateBatchEmbeddings(
  items: Array<{ text: string; cacheKey?: string }>,
  options: EmbeddingOptions = {}
): Promise<Array<number[] | null>> {
  if (items.length === 0) return [];

  const results: Array<number[] | null> = new Array(items.length).fill(null);
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];

  // Check cache first
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.cacheKey && EMBEDDING_CACHE.has(item.cacheKey)) {
      results[i] = EMBEDDING_CACHE.get(item.cacheKey)!;
    } else {
      uncachedIndices.push(i);
      uncachedTexts.push(item.text);
    }
  }

  if (uncachedIndices.length === 0) {
    return results;
  }

  const client = getClient();
  if (!client) {
    return results;
  }

  const model = options.model || (config as any).rag?.embeddingModel || 'gemini-embedding-001';
  const outputDimensionality = options.outputDimensionality || DEFAULT_DIMENSION;
  const taskType = options.taskType || 'RETRIEVAL_DOCUMENT';
  const batchSize = 10;

  for (let b = 0; b < uncachedIndices.length; b += batchSize) {
    const batchIndices = uncachedIndices.slice(b, b + batchSize);
    const batchTexts = uncachedTexts.slice(b, b + batchSize);

    try {
      const response = await client.models.embedContent({
        model,
        contents: batchTexts,
        config: {
          taskType,
          outputDimensionality,
        },
      });

      const vectors = response.embeddings;
      if (vectors && Array.isArray(vectors)) {
        for (let j = 0; j < batchIndices.length; j++) {
          const originalIdx = batchIndices[j];
          const vector = vectors[j]?.values;
          if (vector && Array.isArray(vector) && vector.length === outputDimensionality) {
            results[originalIdx] = vector;
            const cacheKey = items[originalIdx].cacheKey;
            if (cacheKey) {
              EMBEDDING_CACHE.set(cacheKey, vector);
            }
          }
        }
      }
    } catch (batchErr: any) {
      console.warn(`[EmbeddingService] Batch embedContent failed: ${batchErr.message}. Falling back to individual embedding.`);
      for (const idx of batchIndices) {
        results[idx] = await generateEmbedding(items[idx].text, items[idx].cacheKey, options);
      }
    }

    // Small delay between batches to respect rate limits
    if (b + batchSize < uncachedIndices.length) {
      await sleep(250);
    }
  }

  return results;
}

/**
 * Clears the in-memory embedding cache (useful for tests or teardown).
 */
export function clearEmbeddingCache(): void {
  EMBEDDING_CACHE.clear();
}
