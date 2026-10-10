import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  githubId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  email?: string;
  accessToken?: string;
  preferences?: {
    theme?: 'light' | 'dark' | 'system';
    enableLLMByDefault?: boolean;
    defaultRiskThreshold?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    githubId: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, index: true },
    displayName: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    email: { type: String, default: '' },
    accessToken: { type: String, select: false }, // Never return token in queries by default
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'dark' },
      enableLLMByDefault: { type: Boolean, default: true },
      defaultRiskThreshold: { type: String, default: 'medium' },
    },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
