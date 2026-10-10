import mongoose, { Document, Schema } from 'mongoose';
import { Severity, FindingCategory, FindingSource, Confidence } from '@codesense/shared';

export interface IReviewFinding extends Document {
  analysisId: mongoose.Types.ObjectId;
  ruleId: string;
  title: string;
  category: FindingCategory;
  severity: Severity;
  filePath: string;
  line: number;
  endLine?: number;
  explanation: string;
  suggestion?: string;
  suggestedPatch?: string;
  codeSnippet?: string;
  confidence: Confidence;
  source: FindingSource;
  isDeterministic: boolean;
  createdAt: Date;
}

const ReviewFindingSchema = new Schema<IReviewFinding>(
  {
    analysisId: { type: Schema.Types.ObjectId, ref: 'AnalysisJob', required: true, index: true },
    ruleId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    category: {
      type: String,
      enum: ['potential_bug', 'security', 'code_quality', 'performance', 'maintainability'],
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low', 'informational'],
      required: true,
      index: true,
    },
    filePath: { type: String, required: true, index: true },
    line: { type: Number, required: true },
    endLine: { type: Number },
    explanation: { type: String, required: true },
    suggestion: { type: String },
    suggestedPatch: { type: String },
    codeSnippet: { type: String },
    confidence: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
    source: { type: String, enum: ['static_analysis', 'llm', 'ml_risk'], default: 'static_analysis' },
    isDeterministic: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const ReviewFinding = mongoose.model<IReviewFinding>('ReviewFinding', ReviewFindingSchema);
