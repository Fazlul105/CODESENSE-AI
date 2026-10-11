import { AnalysisJob, ReviewFinding, AnalysisReport, ApiResponse } from '@codesense/shared';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

function getAuthHeaders(): Record<string, string> {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('codesense_token');
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  }
  return {};
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const authHeaders = getAuthHeaders();
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options?.headers,
    },
  });

  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Request failed with status ${res.status}`);
  }
  return json.data !== undefined ? json.data : json;
}

export async function getCurrentUser(): Promise<{
  isAuthenticated: boolean;
  token?: string;
  user: {
    id: string;
    githubId: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    email?: string;
  } | null;
  message?: string;
}> {
  return fetchJson(`${API_BASE}/auth/me`);
}

export async function logoutUser(): Promise<{ success: boolean; message: string }> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('codesense_token');
    localStorage.removeItem('codesense_user');
  }
  return fetchJson(`${API_BASE}/auth/logout`, { method: 'POST' });
}

export async function devLogin(username?: string): Promise<any> {
  return fetchJson(`${API_BASE}/auth/dev-login`, {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

export async function exchangeOAuthCode(code: string, state?: string): Promise<any> {
  return fetchJson(`${API_BASE}/auth/callback`, {
    method: 'POST',
    body: JSON.stringify({ code, state }),
  });
}

export async function getRepoPulls(owner: string, repo: string, state = 'open'): Promise<any[]> {
  return fetchJson(`${API_BASE}/repositories/${owner}/${repo}/pulls?state=${state}`);
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

export interface ChatResponse {
  answer: string;
  timestamp: string;
  references?: Array<{
    filePath: string;
    startLine?: number;
    endLine?: number;
    symbolName?: string;
    snippet?: string;
    githubUrl?: string;
  }>;
  ragUsed?: boolean;
}

export async function askAnalysisChat(id: string, question: string): Promise<ChatResponse> {
  return fetchJson(`${API_BASE}/analyses/${id}/chat`, {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

export async function getAnalysisRagStatus(id: string): Promise<{
  enabled: boolean;
  isIndexed: boolean;
  status: string;
  chunkCount: number;
  commitSha?: string;
  indexedAt?: string;
  embeddingModel?: string;
}> {
  return fetchJson(`${API_BASE}/analyses/${id}/rag/status`);
}

export async function triggerAnalysisRagIndex(id: string): Promise<{ success: boolean; message: string }> {
  return fetchJson(`${API_BASE}/analyses/${id}/rag/index`, {
    method: 'POST',
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

