import mongoose from 'mongoose';
import { CodeChunk } from './models/CodeChunk';
import { RetrievedChunk } from './types';
import { config } from '../config';

const VECTOR_INDEX_NAME = (config as any).rag?.vectorIndexName || 'vector_index';
const VECTOR_DIMENSION = 768;

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface VectorSearchParams {
  queryEmbedding: number[];
  analysisId: string;
  repository?: string;
  commitSha?: string;
  limit?: number;
}

/**
 * Attempts to ensure that an Atlas Vector Search index exists on the codechunks collection.
 * If programmatic creation is not permitted by user permissions or cluster configuration,
 * it returns false with instructions so fallback exact-similarity retrieval is used.
 */
export async function ensureVectorSearchIndex(): Promise<{ success: boolean; message: string }> {
  try {
    const coll = CodeChunk.collection;
    if (typeof (coll as any).listSearchIndexes !== 'function') {
      return {
        success: false,
        message: 'listSearchIndexes is not supported by current MongoDB connection mode.',
      };
    }

    const indexes = await (coll as any).listSearchIndexes().toArray();
    const hasIndex = indexes.some((idx: any) => idx.name === VECTOR_INDEX_NAME);

    if (hasIndex) {
      return { success: true, message: `Vector index "${VECTOR_INDEX_NAME}" already exists.` };
    }

    if (typeof (coll as any).createSearchIndex === 'function') {
      try {
        await (coll as any).createSearchIndex({
          name: VECTOR_INDEX_NAME,
          type: 'vectorSearch',
          definition: {
            fields: [
              {
                type: 'vector',
                path: 'embedding',
                numDimensions: VECTOR_DIMENSION,
                similarity: 'cosine',
              },
              {
                type: 'filter',
                path: 'analysisId',
              },
              {
                type: 'filter',
                path: 'isPrivate',
              },
              {
                type: 'filter',
                path: 'repository',
              },
              {
                type: 'filter',
                path: 'commitSha',
              },
            ],
          },
        });
        return {
          success: true,
          message: `Vector search index "${VECTOR_INDEX_NAME}" creation initiated on Atlas.`,
        };
      } catch (createErr: any) {
        return {
          success: false,
          message: `Atlas createSearchIndex returned: ${createErr.message}. Exact cosine search fallback active.`,
        };
      }
    }

    return {
      success: false,
      message: `Automatic index creation not supported; Atlas UI index configuration recommended.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Could not verify Atlas Search index: ${err.message}. Using exact cosine fallback.`,
    };
  }
}

/**
 * Searches CodeChunk collection using MongoDB Atlas $vectorSearch aggregation stage.
 */
async function searchWithAtlasVector(params: VectorSearchParams): Promise<RetrievedChunk[]> {
  const { queryEmbedding, analysisId, limit = 6 } = params;
  const analysisObjectId = new mongoose.Types.ObjectId(analysisId);

  const pipeline = [
    {
      $vectorSearch: {
        index: VECTOR_INDEX_NAME,
        path: 'embedding',
        queryVector: queryEmbedding,
        numCandidates: Math.max(limit * 5, 30),
        limit,
        filter: {
          analysisId: { $eq: analysisObjectId },
          isPrivate: { $eq: false },
        },
      },
    },
    {
      $project: {
        _id: 1,
        filePath: 1,
        startLine: 1,
        endLine: 1,
        symbolName: 1,
        chunkType: 1,
        content: 1,
        isChangedInPr: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ];

  const results = await CodeChunk.aggregate(pipeline as any);
  return results.map((r: any) => ({
    chunkId: r._id.toString(),
    filePath: r.filePath,
    startLine: r.startLine,
    endLine: r.endLine,
    symbolName: r.symbolName,
    chunkType: r.chunkType,
    content: r.content,
    score: typeof r.score === 'number' ? r.score : 0.8,
    matchSource: 'vector' as const,
    isChangedInPr: r.isChangedInPr,
  }));
}

/**
 * Exact cosine similarity retrieval across chunks scoped strictly to the authorized analysisId.
 * Used whenever Atlas Search is not configured or in local/test environments.
 */
async function searchWithExactCosine(params: VectorSearchParams): Promise<RetrievedChunk[]> {
  const { queryEmbedding, analysisId, limit = 6 } = params;

  // Query only public chunks belonging to this analysis
  const docs = await CodeChunk.find({
    analysisId: new mongoose.Types.ObjectId(analysisId),
    isPrivate: false,
    embedding: { $exists: true, $ne: [] },
  }).select('_id filePath startLine endLine symbolName chunkType content embedding isChangedInPr');

  const scored: Array<{ doc: any; score: number }> = [];

  for (const doc of docs) {
    if (doc.embedding && Array.isArray(doc.embedding)) {
      const score = cosineSimilarity(queryEmbedding, doc.embedding);
      scored.push({ doc, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ doc, score }) => ({
    chunkId: doc._id.toString(),
    filePath: doc.filePath,
    startLine: doc.startLine,
    endLine: doc.endLine,
    symbolName: doc.symbolName,
    chunkType: doc.chunkType,
    content: doc.content,
    score,
    matchSource: 'vector' as const,
    isChangedInPr: doc.isChangedInPr,
  }));
}

/**
 * Vector search entry point. Tries Atlas Vector Search first, and falls back to
 * exact cosine similarity search over scoped analysis chunks if Atlas index is absent.
 */
export async function searchVectorChunks(
  params: VectorSearchParams
): Promise<{ chunks: RetrievedChunk[]; method: 'atlas_vector' | 'exact_cosine' }> {
  try {
    const results = await searchWithAtlasVector(params);
    if (results.length > 0) {
      return { chunks: results, method: 'atlas_vector' };
    }
  } catch (atlasErr: any) {
    // Atlas Vector Search failed or index not created yet
  }

  // Graceful fallback to exact cosine similarity
  const fallbackResults = await searchWithExactCosine(params);
  return { chunks: fallbackResults, method: 'exact_cosine' };
}
