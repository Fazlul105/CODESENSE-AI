export type ChunkType = 'function' | 'method' | 'class' | 'module' | 'block' | 'fallback';

export interface CodeChunkMetadata {
  analysisId: string;
  repository: string; // e.g. "owner/repo"
  pullNumber: number;
  commitSha: string;
  filePath: string;
  startLine: number;
  endLine: number;
  symbolName?: string;
  chunkType: ChunkType;
  language: string;
  contentHash: string;
  isPrivate: boolean;
  isChangedInPr?: boolean;
}

export interface ICodeChunkDoc extends CodeChunkMetadata {
  _id: string;
  content: string;
  embedding?: number[];
  embeddingModel: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetrievedChunk {
  chunkId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  symbolName?: string;
  chunkType: ChunkType;
  content: string;
  score: number;
  matchSource: 'vector' | 'keyword' | 'hybrid';
  isChangedInPr?: boolean;
}

export interface RagCitation {
  filePath: string;
  startLine: number;
  endLine: number;
  symbolName?: string;
  snippet?: string;
  gitRef?: string;
  githubUrl?: string;
}

export interface RagSearchResult {
  query: string;
  chunks: RetrievedChunk[];
  totalRetrieved: number;
  searchMethod: 'atlas_vector' | 'exact_cosine' | 'keyword' | 'hybrid';
}

export interface RagIndexingResult {
  analysisId: string;
  repository: string;
  commitSha: string;
  filesProcessed: number;
  chunksCreated: number;
  chunksSkipped: number;
  durationMs: number;
  errors: string[];
}

export interface RagIndexingStatus {
  analysisId: string;
  status: 'not_indexed' | 'indexing' | 'indexed' | 'failed' | 'skipped_private';
  chunkCount: number;
  commitSha?: string;
  indexedAt?: string;
  embeddingModel?: string;
  error?: string;
}
