'use client';

import React, { useEffect, useState } from 'react';
import {
  Activity,
  Shield,
  Database,
  Github,
  Cpu,
  Key,
  CheckCircle2,
  Info,
  Sparkles,
  Bot,
  RefreshCw,
  AlertCircle,
  Check,
} from 'lucide-react';
import { getSystemStatus, SystemStatus } from '@/lib/api';

export default function SettingsPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAiTab, setSelectedAiTab] = useState<'gemini' | 'openai'>('gemini');

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      setLoading(true);
      const data = await getSystemStatus();
      setStatus(data);
      if (data.ai?.activeProvider === 'openai') {
        setSelectedAiTab('openai');
      } else {
        setSelectedAiTab('gemini');
      }
    } catch (err) {
      console.warn('Could not load live status, using defaults:', err);
    } finally {
      setLoading(false);
    }
  }

  const isGeminiActive = status?.ai?.gemini?.active ?? true;
  const activeModel = isGeminiActive
    ? status?.ai?.gemini?.model || 'gemini-3.8-flash'
    : status?.ai?.openai?.model || 'gpt-4o-mini';

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Activity className="h-6 w-6 text-blue-400" />
            System Status & Diagnostics
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time service health, AI provider connectivity, and backend deployment configuration.
          </p>
        </div>
        <button
          onClick={loadStatus}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-300 transition-colors"
          title="Refresh status"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="space-y-4">
        {/* Generative AI Review Engine (Promoted & Dynamic) */}
        <div className="rounded-xl border border-purple-900/40 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-purple-950/20 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-500/10 p-2 text-purple-400 border border-purple-500/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-200">Generative AI Review Engine (Phase 2)</h3>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Engine Active
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Augments deterministic static analysis with grounded explanations, edge-case tests, and conversational follow-up chat.
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-300 border border-purple-500/20">
                {isGeminiActive ? (
                  <>
                    <Bot className="h-3.5 w-3.5 text-purple-400" />
                    Google Gemini ({activeModel})
                  </>
                ) : (
                  <>
                    <Key className="h-3.5 w-3.5 text-purple-400" />
                    OpenAI ({activeModel})
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Provider Tabs */}
          <div className="mt-4 pt-4 border-t border-slate-800/80">
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                onClick={() => setSelectedAiTab('gemini')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedAiTab === 'gemini'
                    ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 shadow-sm'
                    : 'bg-slate-800/50 text-slate-400 hover:text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                Google Gemini
                {isGeminiActive && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded-full font-semibold border border-emerald-500/30">
                    Active
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSelectedAiTab('openai')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedAiTab === 'openai'
                    ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 shadow-sm'
                    : 'bg-slate-800/50 text-slate-400 hover:text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Key className="h-3.5 w-3.5 text-purple-400" />
                OpenAI / Compatible
                {!isGeminiActive && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded-full font-semibold border border-emerald-500/30">
                    Active
                  </span>
                )}
              </button>
            </div>

            {selectedAiTab === 'gemini' ? (
              <div className="space-y-2">
                <div className="rounded-lg bg-slate-950 p-3 text-xs font-mono text-slate-300 border border-slate-800/80 space-y-1">
                  <div className="text-slate-500"># Google Gemini AI Configuration (Currently Active)</div>
                  <div className="text-purple-300">AI_PROVIDER=gemini</div>
                  <div>GEMINI_API_KEY={status?.ai?.gemini?.configured ? 'AQ.Ab8RN6... (Configured)' : 'your_gemini_api_key_here'}</div>
                  <div className="text-emerald-400">GEMINI_MODEL={status?.ai?.gemini?.model || 'gemini-3.8-flash'}</div>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>
                    Official Google GenAI SDK integration enabled. CodeSense AI uses this model for finding explanations and PR assistant chat.
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-lg bg-slate-950 p-3 text-xs font-mono text-slate-300 border border-slate-800/80 space-y-1">
                  <div className="text-slate-500"># OpenAI / LLM-Compatible Fallback Configuration</div>
                  <div>AI_PROVIDER=openai</div>
                  <div>OPENAI_API_KEY=sk-...</div>
                  <div>LLM_MODEL=gpt-4o-mini</div>
                  <div className="text-slate-500">LLM_BASE_URL=https://api.openai.com/v1</div>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Info className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                  <span>
                    To switch from Gemini to OpenAI, set <code className="text-slate-300">AI_PROVIDER=openai</code> and your API key in your environment configuration (Render / <code className="text-slate-300">.env</code>).
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* MongoDB Atlas Status */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Database — MongoDB Atlas</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Stores user profiles, pull request metadata, analysis runs, findings, and history.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
              {status?.database?.connected ? 'Atlas Connected' : 'Active / Ready'}
            </span>
          </div>
          <div className="mt-4 rounded-lg bg-slate-950 p-3 text-xs font-mono text-slate-400 border border-slate-800/80">
            {status?.database?.name
              ? `MONGODB_URI=mongodb+srv://***:***@cluster0.../${status.database.name}`
              : 'MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/codesense_ai'}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            In development or test mode, the system automatically falls back to an embedded MongoDB instance if no cloud connection string is provided.
          </p>
        </div>

        {/* GitHub OAuth & API Tokens */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
                <Github className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">GitHub API Integration</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Fetches pull requests, changed files, patches, and repository structures.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-400 border border-blue-500/20">
              {status?.github?.hasOAuth ? 'OAuth & PAT Active' : status?.github?.hasToken ? 'PAT Active (5,000 req/hr)' : 'Octokit REST API'}
            </span>
          </div>
          <div className="mt-4 space-y-2 text-xs text-slate-400">
            <p>
              Public pull requests can be analyzed without authentication (up to GitHub&apos;s unauthenticated rate limit).
              For 5,000 requests/hour and private repository access, credentials are configured on the API backend:
            </p>
            <div className="rounded-lg bg-slate-950 p-3 font-mono text-slate-400 border border-slate-800/80 space-y-1">
              <div>GITHUB_TOKEN={status?.github?.hasToken ? 'github_pat_11BOX... (Active)' : 'Not configured'}</div>
              <div>GITHUB_CLIENT_ID={status?.github?.hasOAuth ? 'Ov23liP... (Configured & Active)' : 'your_oauth_client_id'}</div>
              <div>GITHUB_CLIENT_SECRET={status?.github?.hasOAuth ? '•••••••••••••••••••• (Active)' : 'your_oauth_client_secret'}</div>
            </div>
          </div>
        </div>

        {/* Python ML Defect Risk Service */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-cyan-500/10 p-2 text-cyan-400">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">ML Defect-Risk Inference Service (Phase 4)</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Python FastAPI microservice serving scikit-learn defect estimation models.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-400 border border-cyan-500/20">
              FastAPI / Scikit-Learn
            </span>
          </div>
          <div className="mt-4 rounded-lg bg-slate-950 p-3 text-xs font-mono text-slate-400 border border-slate-800/80">
            ML_SERVICE_URL={status?.mlService?.url || 'http://127.0.0.1:8000'}
          </div>
        </div>
      </div>
    </div>
  );
}
