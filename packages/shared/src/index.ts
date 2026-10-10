export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational';

export type FindingCategory = 
  | 'potential_bug' 
  | 'security' 
  | 'code_quality' 
  | 'performance' 
  | 'maintainability';

export type FindingSource = 'static_analysis' | 'llm' | 'ml_risk';

export type Confidence = 'high' | 'medium' | 'low';

export type JobStatus = 'queued' | 'in_progress' | 'completed' | 'failed';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface UserProfile {
  id: string;
  githubId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  email?: string;
  createdAt: string;
}

export interface PullRequestMetadata {
  owner: string;
  repo: string;
  pullNumber: number;
  title: string;
  body?: string;
  author: string;
  authorAvatarUrl?: string;
  baseBranch: string;
  headBranch: string;
  headSha: string;
  baseSha: string;
  changedFilesCount: number;
  additions: number;
  deletions: number;
  htmlUrl: string;
  state: 'open' | 'closed' | 'merged';
  createdAt: string;
  updatedAt: string;
}

export interface ChangedFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  rawUrl?: string;
  language: string;
  isSupported: boolean;
  skipReason?: string;
}

export interface ReviewFinding {
  id: string;
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
}

export interface RiskFactor {
  factor: string;
  impact: string;
  weight: number;
}

export interface MLDetails {
  modelVersion: string;
  defectProbability: number;
  modelType: string;
  topFeatures: Array<{ feature: string; importance: number }>;
  evaluationMetricsSummary?: {
    rocAuc: number;
    prAuc: number;
    f1Score: number;
  };
}

export interface RiskAssessment {
  overallScore: number; // 0 - 100
  riskLevel: RiskLevel;
  method: 'heuristic' | 'ml_model';
  factors: RiskFactor[];
  mlDetails?: MLDetails;
  summary: string;
}

export interface AnalysisReport {
  analysisId: string;
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
  generatedAt: string;
}

export interface AnalysisJob {
  id: string;
  userId?: string;
  isAnonymous: boolean;
  repository: {
    owner: string;
    name: string;
    htmlUrl: string;
    isPrivate: boolean;
  };
  pullRequest: PullRequestMetadata;
  status: JobStatus;
  progressPercent: number;
  statusMessage: string;
  error?: string;
  filesAnalyzed: number;
  totalFilesChanged: number;
  findings: ReviewFinding[];
  report?: AnalysisReport;
  createdAt: string;
  completedAt?: string;
}

export interface CreateAnalysisRequest {
  pullRequestUrl: string;
  enableLLM?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  references?: Array<{
    filePath: string;
    line?: number;
    snippet?: string;
  }>;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  statusCode?: number;
}
