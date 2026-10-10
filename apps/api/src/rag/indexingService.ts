import mongoose from 'mongoose';
import { ChangedFile, PullRequestMetadata } from '@codesense/shared';
import { extractCodeChunks, ProcessedChunk } from './chunker';
import { generateBatchEmbeddings } from './embeddingService';
import { CodeChunk } from './models/CodeChunk';
import { RagIndexingResult, RagIndexingStatus } from './types';
import { fetchFileContentAtRef, isSupportedLanguageFile } from '../integrations/github';
import { config } from '../config';

const INDEXING_STATUS_MAP = new Map<string, RagIndexingStatus>();

export function getIndexingStatus(analysisId: string): RagIndexingStatus {
  if (INDEXING_STATUS_MAP.has(analysisId)) {
    return INDEXING_STATUS_MAP.get(analysisId)!;
  }
  return {
    analysisId,
    status: 'not_indexed',
    chunkCount: 0,
  };
}

/**
 * Reconstructs file content from patch additions if full raw file is unavailable.
 */
function reconstructContentFromPatch(patch: string): string {
  const lines = patch.split('\n');
  const reconstructed: string[] = [];
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      reconstructed.push(line.slice(1));
    } else if (!line.startsWith('-') && !line.startsWith('@@')) {
      reconstructed.push(line);
    }
  }
  return reconstructed.join('\n');
}

export interface IndexAnalysisParams {
  analysisId: string;
  prMeta: PullRequestMetadata;
  files: ChangedFile[];
  isPrivateRepo: boolean;
  token?: string;
}

/**
 * Asynchronously indexes the pull request source code into MongoDB Atlas chunks and vector embeddings.
 */
export async function indexAnalysisSourceCode(
  params: IndexAnalysisParams
): Promise<RagIndexingResult> {
  const { analysisId, prMeta, files, isPrivateRepo, token } = params;
  const startTime = Date.now();
  const repoFullName = `${prMeta.owner}/${prMeta.repo}`.toLowerCase();
  const commitSha = prMeta.headSha || 'unknown';

  // 1. Security enforcement: disable RAG indexing on private repositories
  if (isPrivateRepo) {
    INDEXING_STATUS_MAP.set(analysisId, {
      analysisId,
      status: 'skipped_private',
      chunkCount: 0,
      commitSha,
      indexedAt: new Date().toISOString(),
    });
    return {
      analysisId,
      repository: repoFullName,
      commitSha,
      filesProcessed: 0,
      chunksCreated: 0,
      chunksSkipped: 0,
      durationMs: Date.now() - startTime,
      errors: ['Private repository RAG indexing is disabled pending cryptographic token authentication.'],
    };
  }

  INDEXING_STATUS_MAP.set(analysisId, {
    analysisId,
    status: 'indexing',
    chunkCount: 0,
    commitSha,
  });

  const maxFiles = (config as any).rag?.maxFiles || 30;
  const maxChunks = (config as any).rag?.maxChunks || 500;
  const errors: string[] = [];
  let filesProcessed = 0;
  const allExtractedChunks: ProcessedChunk[] = [];

  try {
    // 2. Select eligible files (supported languages, not deleted, under limit)
    const eligibleFiles = files
      .filter((f) => f.status !== 'removed' && isSupportedLanguageFile(f.filename).isSupported)
      .slice(0, maxFiles);

    for (const file of eligibleFiles) {
      if (allExtractedChunks.length >= maxChunks) break;

      try {
        let content: string | null = null;
        if (prMeta.headSha) {
          content = await fetchFileContentAtRef(prMeta.owner, prMeta.repo, file.filename, prMeta.headSha, token);
        }
        if (!content && file.patch) {
          content = reconstructContentFromPatch(file.patch);
        }
        if (!content || content.length > config.limits.maxFileSizeBytes) {
          continue;
        }

        const chunks = extractCodeChunks({
          sourceCode: content,
          filePath: file.filename,
          analysisId,
          repository: repoFullName,
          commitSha,
          pullNumber: prMeta.pullNumber,
          isPrivate: false,
          isChangedInPr: true,
        });

        allExtractedChunks.push(...chunks);
        filesProcessed++;
      } catch (fileErr: any) {
        errors.push(`Failed to chunk ${file.filename}: ${fileErr.message}`);
      }
    }

    const cappedChunks = allExtractedChunks.slice(0, maxChunks);

    if (cappedChunks.length === 0) {
      INDEXING_STATUS_MAP.set(analysisId, {
        analysisId,
        status: 'indexed',
        chunkCount: 0,
        commitSha,
        indexedAt: new Date().toISOString(),
      });
      return {
        analysisId,
        repository: repoFullName,
        commitSha,
        filesProcessed,
        chunksCreated: 0,
        chunksSkipped: 0,
        durationMs: Date.now() - startTime,
        errors,
      };
    }

    // 3. Check for existing chunks in MongoDB to reuse existing embeddings
    const existingDocs = await CodeChunk.find({
      commitSha,
      contentHash: { $in: cappedChunks.map((c) => c.contentHash) },
      embedding: { $exists: true, $ne: [] },
    }).select('contentHash embedding');

    const cachedMap = new Map<string, number[]>();
    for (const d of existingDocs) {
      if (d.embedding && d.embedding.length === 768) {
        cachedMap.set(d.contentHash, d.embedding);
      }
    }

    // 4. Batch generate embeddings for chunks not already cached
    const itemsToEmbed = cappedChunks.map((c) => ({
      text: `File: ${c.filePath}\n${c.content}`,
      cacheKey: c.contentHash,
    }));

    const embeddings = await generateBatchEmbeddings(itemsToEmbed, {
      taskType: 'RETRIEVAL_DOCUMENT',
    });

    // 5. Clean up any existing chunks for this analysis before inserting
    await CodeChunk.deleteMany({ analysisId: new mongoose.Types.ObjectId(analysisId) });

    // 6. Build documents and insert into MongoDB
    const docsToInsert = cappedChunks.map((chunk, idx) => {
      const embedding = embeddings[idx] || cachedMap.get(chunk.contentHash);
      return {
        analysisId: new mongoose.Types.ObjectId(analysisId),
        repository: chunk.repository,
        pullNumber: chunk.pullNumber,
        commitSha: chunk.commitSha,
        filePath: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        symbolName: chunk.symbolName,
        chunkType: chunk.chunkType,
        language: chunk.language,
        content: chunk.content,
        contentHash: chunk.contentHash,
        embedding: embedding || undefined,
        embeddingModel: (config as any).rag?.embeddingModel || 'gemini-embedding-001',
        isPrivate: false,
        isChangedInPr: chunk.isChangedInPr,
      };
    });

    await CodeChunk.insertMany(docsToInsert);

    INDEXING_STATUS_MAP.set(analysisId, {
      analysisId,
      status: 'indexed',
      chunkCount: docsToInsert.length,
      commitSha,
      indexedAt: new Date().toISOString(),
      embeddingModel: (config as any).rag?.embeddingModel || 'gemini-embedding-001',
    });

    return {
      analysisId,
      repository: repoFullName,
      commitSha,
      filesProcessed,
      chunksCreated: docsToInsert.length,
      chunksSkipped: allExtractedChunks.length - cappedChunks.length,
      durationMs: Date.now() - startTime,
      errors,
    };
  } catch (err: any) {
    console.error(`[IndexingService] Indexing error for ${analysisId}:`, err);
    INDEXING_STATUS_MAP.set(analysisId, {
      analysisId,
      status: 'failed',
      chunkCount: 0,
      commitSha,
      error: err.message,
    });
    return {
      analysisId,
      repository: repoFullName,
      commitSha,
      filesProcessed,
      chunksCreated: 0,
      chunksSkipped: 0,
      durationMs: Date.now() - startTime,
      errors: [...errors, err.message],
    };
  }
}
