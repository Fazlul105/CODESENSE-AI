import mongoose, { Schema, Document } from 'mongoose';
import { ChunkType } from '../types';

export interface ICodeChunk extends Document {
  analysisId: mongoose.Types.ObjectId;
  repository: string; // e.g. "owner/repo"
  pullNumber: number;
  commitSha: string;
  filePath: string;
  startLine: number;
  endLine: number;
  symbolName?: string;
  chunkType: ChunkType;
  language: string;
  content: string;
  contentHash: string;
  embedding?: number[];
  embeddingModel: string;
  isPrivate: boolean;
  isChangedInPr: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CodeChunkSchema = new Schema<ICodeChunk>(
  {
    analysisId: {
      type: Schema.Types.ObjectId,
      ref: 'AnalysisJob',
      required: true,
      index: true,
    },
    repository: {
      type: String,
      required: true,
      index: true,
    },
    pullNumber: {
      type: Number,
      required: true,
    },
    commitSha: {
      type: String,
      required: true,
      index: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    startLine: {
      type: Number,
      required: true,
    },
    endLine: {
      type: Number,
      required: true,
    },
    symbolName: {
      type: String,
    },
    chunkType: {
      type: String,
      enum: ['function', 'method', 'class', 'module', 'block', 'fallback'],
      default: 'block',
    },
    language: {
      type: String,
      default: 'typescript',
    },
    content: {
      type: String,
      required: true,
    },
    contentHash: {
      type: String,
      required: true,
    },
    embedding: {
      type: [Number],
      required: false,
    },
    embeddingModel: {
      type: String,
      default: 'gemini-embedding-001',
    },
    isPrivate: {
      type: Boolean,
      default: false,
      index: true,
    },
    isChangedInPr: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: 'codechunks',
  }
);

// Compound indexes for high-performance scoped lookups
CodeChunkSchema.index({ analysisId: 1, filePath: 1 });
CodeChunkSchema.index({ commitSha: 1, contentHash: 1 });
CodeChunkSchema.index({ repository: 1, pullNumber: 1 });

export const CodeChunk = mongoose.model<ICodeChunk>('CodeChunk', CodeChunkSchema);
