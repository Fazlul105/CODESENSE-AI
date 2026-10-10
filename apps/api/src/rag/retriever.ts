import { generateEmbedding } from './embeddingService';
import { searchVectorChunks } from './vectorStore';
import { searchKeywordChunks } from './keywordSearch';
import { RetrievedChunk, RagSearchResult } from './types';
import { config } from '../config';

export interface RetrieveContextParams {
  question: string;
  analysisId: string;
  repository?: string;
  commitSha?: string;
  topK?: number;
}

/**
 * Checks whether two line ranges in the same file significantly overlap.
 */
function rangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return Math.max(startA, startB) <= Math.min(endA, endB);
}

/**
 * Deduplicates overlapping chunks from the same file, keeping the higher-scoring chunk.
 */
function deduplicateOverlappingChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const result: RetrievedChunk[] = [];

  for (const chunk of chunks) {
    let hasOverlap = false;

    for (let i = 0; i < result.length; i++) {
      const existing = result[i];
      if (existing.filePath === chunk.filePath && rangesOverlap(existing.startLine, existing.endLine, chunk.startLine, chunk.endLine)) {
        hasOverlap = true;
        // If the new chunk has a higher score, replace existing with new chunk
        if (chunk.score > existing.score) {
          result[i] = chunk;
        }
        break;
      }
    }

    if (!hasOverlap) {
      result.push(chunk);
    }
  }

  return result;
}

/**
 * Performs hybrid semantic and keyword retrieval against code chunks for the given analysis.
 */
export async function retrieveRelevantCode(
  params: RetrieveContextParams
): Promise<RagSearchResult> {
  const { question, analysisId, repository, commitSha } = params;
  const topK = params.topK ?? (config as any).rag?.topK ?? 6;

  // 1. Generate query embedding
  const queryEmbedding = await generateEmbedding(question, undefined, {
    taskType: 'RETRIEVAL_QUERY',
  });

  let vectorChunks: RetrievedChunk[] = [];
  let vectorMethod: 'atlas_vector' | 'exact_cosine' = 'exact_cosine';

  if (queryEmbedding) {
    const vRes = await searchVectorChunks({
      queryEmbedding,
      analysisId,
      repository,
      commitSha,
      limit: topK * 2,
    });
    vectorChunks = vRes.chunks;
    vectorMethod = vRes.method;
  }

  // 2. Perform keyword search
  const keywordChunks = await searchKeywordChunks({
    question,
    analysisId,
    limit: topK * 2,
  });

  // 3. Reciprocal Rank Fusion (RRF)
  const chunkMap = new Map<string, { chunk: RetrievedChunk; rrfScore: number; sources: Set<string> }>();
  const RRF_K = 30;

  // Score vector results
  vectorChunks.forEach((vc, rank) => {
    const weight = 1.0;
    const rrfScore = weight / (RRF_K + rank + 1);
    chunkMap.set(vc.chunkId, {
      chunk: { ...vc },
      rrfScore,
      sources: new Set(['vector']),
    });
  });

  // Score keyword results
  keywordChunks.forEach((kc, rank) => {
    const weight = 0.8;
    const rrfScore = weight / (RRF_K + rank + 1);
    const existing = chunkMap.get(kc.chunkId);
    if (existing) {
      existing.rrfScore += rrfScore;
      existing.sources.add('keyword');
      existing.chunk.matchSource = 'hybrid';
    } else {
      chunkMap.set(kc.chunkId, {
        chunk: { ...kc },
        rrfScore,
        sources: new Set(['keyword']),
      });
    }
  });

  // Add slight boost for PR changed files
  for (const entry of chunkMap.values()) {
    if (entry.chunk.isChangedInPr) {
      entry.rrfScore *= 1.15;
    }
    entry.chunk.score = parseFloat(entry.rrfScore.toFixed(4));
  }

  const merged = Array.from(chunkMap.values())
    .map((e) => e.chunk)
    .sort((a, b) => b.score - a.score);

  // 4. Deduplicate overlapping chunks
  const deduplicated = deduplicateOverlappingChunks(merged);
  const finalChunks = deduplicated.slice(0, topK);

  let searchMethod: 'atlas_vector' | 'exact_cosine' | 'keyword' | 'hybrid' = 'keyword';
  if (queryEmbedding && keywordChunks.length > 0) {
    searchMethod = 'hybrid';
  } else if (queryEmbedding) {
    searchMethod = vectorMethod;
  }

  return {
    query: question,
    chunks: finalChunks,
    totalRetrieved: finalChunks.length,
    searchMethod,
  };
}
