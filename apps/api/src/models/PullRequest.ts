import mongoose, { Document, Schema } from 'mongoose';

export interface IPullRequest extends Document {
  githubPullId?: number;
  repository: mongoose.Types.ObjectId;
  owner: string;
  repo: string;
  number: number;
  title: string;
  body?: string;
  author: string;
  authorAvatarUrl?: string;
  state: 'open' | 'closed' | 'merged';
  htmlUrl: string;
  baseBranch: string;
  headBranch: string;
  baseSha: string;
  headSha: string;
  additions: number;
  deletions: number;
  changedFilesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const PullRequestSchema = new Schema<IPullRequest>(
  {
    githubPullId: { type: Number },
    repository: { type: Schema.Types.ObjectId, ref: 'Repository', required: true, index: true },
    owner: { type: String, required: true, index: true },
    repo: { type: String, required: true, index: true },
    number: { type: Number, required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    author: { type: String, required: true },
    authorAvatarUrl: { type: String, default: '' },
    state: { type: String, enum: ['open', 'closed', 'merged'], default: 'open' },
    htmlUrl: { type: String, required: true },
    baseBranch: { type: String, default: 'main' },
    headBranch: { type: String, default: 'patch' },
    baseSha: { type: String, default: '' },
    headSha: { type: String, default: '' },
    additions: { type: Number, default: 0 },
    deletions: { type: Number, default: 0 },
    changedFilesCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

PullRequestSchema.index({ owner: 1, repo: 1, number: 1 }, { unique: true });

export const PullRequest = mongoose.model<IPullRequest>('PullRequest', PullRequestSchema);
