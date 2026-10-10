import mongoose, { Document, Schema } from 'mongoose';
import { JobStatus } from '@codesense/shared';

export interface IAnalysisJob extends Document {
  user?: mongoose.Types.ObjectId;
  isAnonymous: boolean;
  repository: mongoose.Types.ObjectId;
  pullRequest: mongoose.Types.ObjectId;
  status: JobStatus;
  progressPercent: number;
  statusMessage: string;
  error?: string;
  filesAnalyzed: number;
  totalFilesChanged: number;
  enableLLM: boolean;
  analyzerVersion: string;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AnalysisJobSchema = new Schema<IAnalysisJob>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    isAnonymous: { type: Boolean, default: true },
    repository: { type: Schema.Types.ObjectId, ref: 'Repository', required: true, index: true },
    pullRequest: { type: Schema.Types.ObjectId, ref: 'PullRequest', required: true, index: true },
    status: {
      type: String,
      enum: ['queued', 'in_progress', 'completed', 'failed'],
      default: 'queued',
      index: true,
    },
    progressPercent: { type: Number, default: 0 },
    statusMessage: { type: String, default: 'Queued for analysis' },
    error: { type: String },
    filesAnalyzed: { type: Number, default: 0 },
    totalFilesChanged: { type: Number, default: 0 },
    enableLLM: { type: Boolean, default: true },
    analyzerVersion: { type: String, default: '1.0.0' },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

AnalysisJobSchema.index({ createdAt: -1 });

export const AnalysisJob = mongoose.model<IAnalysisJob>('AnalysisJob', AnalysisJobSchema);
