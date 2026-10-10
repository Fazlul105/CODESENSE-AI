import mongoose, { Document, Schema } from 'mongoose';
import { RiskAssessment } from '@codesense/shared';

export interface IAnalysisReport extends Document {
  analysisId: mongoose.Types.ObjectId;
  summary: string;
  keyConcerns: string[];
  testingRecommendations: string[];
  securityObservations: string[];
  findingsCount: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
    total: number;
  };
  riskAssessment: RiskAssessment;
  createdAt: Date;
}

const AnalysisReportSchema = new Schema<IAnalysisReport>(
  {
    analysisId: { type: Schema.Types.ObjectId, ref: 'AnalysisJob', required: true, unique: true, index: true },
    summary: { type: String, default: '' },
    keyConcerns: [{ type: String }],
    testingRecommendations: [{ type: String }],
    securityObservations: [{ type: String }],
    findingsCount: {
      critical: { type: Number, default: 0 },
      high: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      low: { type: Number, default: 0 },
      informational: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    riskAssessment: {
      overallScore: { type: Number, default: 0 },
      riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
      method: { type: String, enum: ['heuristic', 'ml_model'], default: 'heuristic' },
      factors: [
        {
          factor: { type: String },
          impact: { type: String },
          weight: { type: Number },
        },
      ],
      mlDetails: {
        modelVersion: { type: String },
        defectProbability: { type: Number },
        modelType: { type: String },
        topFeatures: [
          {
            feature: { type: String },
            importance: { type: Number },
          },
        ],
        evaluationMetricsSummary: {
          rocAuc: { type: Number },
          prAuc: { type: Number },
          f1Score: { type: Number },
        },
      },
      summary: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

export const AnalysisReport = mongoose.model<IAnalysisReport>('AnalysisReport', AnalysisReportSchema);
