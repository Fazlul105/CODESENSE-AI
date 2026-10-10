import { AnalysisJob, ReviewFinding, AnalysisReport, ApiResponse } from '@codesense/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Request failed with status ${res.status}`);
  }
  return json.data !== undefined ? json.data : json;
}

export async function createAnalysis(pullRequestUrl: string, enableLLM = true): Promise<{
  analysisId: string;
  repository: { owner: string; repo: string; fullName: string };
  pullRequest: { number: number; title: string; author: string };
}> {
  return fetchJson(`${API_BASE}/analyses`, {
    method: 'POST',
    body: JSON.stringify({ pullRequestUrl, enableLLM }),
  });
}

export async function getAnalysisStatus(id: string): Promise<{
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progressPercent: number;
  statusMessage: string;
  error?: string;
  filesAnalyzed: number;
}> {
  return fetchJson(`${API_BASE}/analyses/${id}/status`);
}

export async function getAnalysis(id: string): Promise<{
  job: AnalysisJob;
  report?: AnalysisReport;
  findings: ReviewFinding[];
}> {
  return fetchJson(`${API_BASE}/analyses/${id}`);
}

export async function getAnalysisFindings(
  id: string,
  filter?: { severity?: string; category?: string; file?: string }
): Promise<ReviewFinding[]> {
  const query = new URLSearchParams();
  if (filter?.severity && filter.severity !== 'all') query.set('severity', filter.severity);
  if (filter?.category && filter.category !== 'all') query.set('category', filter.category);
  if (filter?.file && filter.file !== 'all') query.set('file', filter.file);

  const qs = query.toString() ? `?${query.toString()}` : '';
  return fetchJson(`${API_BASE}/analyses/${id}/findings${qs}`);
}

export async function getDashboardStats(): Promise<{
  totalAnalyses: number;
  totalCompleted: number;
  totalFindings: number;
  avgRiskScore: number;
  severityCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
}> {
  return fetchJson(`${API_BASE}/analyses/stats`);
}

export async function listAnalyses(page = 1, limit = 10): Promise<{
  analyses: any[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  return fetchJson(`${API_BASE}/analyses?page=${page}&limit=${limit}`);
}

export function getExportMarkdownUrl(analysisId: string): string {
  return `${API_BASE}/analyses/${analysisId}/export`;
}

export async function askAnalysisChat(id: string, question: string): Promise<{ answer: string; timestamp: string }> {
  return fetchJson(`${API_BASE}/analyses/${id}/chat`, {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

export interface SystemStatus {
  database: {
    connected: boolean;
    host: string | null;
    name: string | null;
  };
  github: {
    hasToken: boolean;
    hasOAuth: boolean;
  };
  ai: {
    activeProvider: string;
    gemini: {
      configured: boolean;
      model: string;
      active: boolean;
    };
    openai: {
      configured: boolean;
      model: string;
      active: boolean;
    };
  };
  mlService: {
    url: string;
  };
}

export async function getSystemStatus(): Promise<SystemStatus> {
  return fetchJson(`${API_BASE}/system/status`);
}

