import mongoose, { Document, Schema } from 'mongoose';

export interface IRepository extends Document {
  githubRepoId?: number;
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  language?: string;
  stargazersCount?: number;
  openIssuesCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

const RepositorySchema = new Schema<IRepository>(
  {
    githubRepoId: { type: Number, index: true },
    owner: { type: String, required: true, index: true },
    name: { type: String, required: true, index: true },
    fullName: { type: String, required: true, unique: true, index: true },
    htmlUrl: { type: String, required: true },
    defaultBranch: { type: String, default: 'main' },
    isPrivate: { type: Boolean, default: false },
    language: { type: String, default: 'TypeScript' },
    stargazersCount: { type: Number, default: 0 },
    openIssuesCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Repository = mongoose.model<IRepository>('Repository', RepositorySchema);
