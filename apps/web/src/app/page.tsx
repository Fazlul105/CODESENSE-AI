'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createAnalysis, getAnalysisStatus } from '@/lib/api';
import {
  ShieldAlert,
  GitPullRequest,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Code2,
  Lock,
  Cpu,
} from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [prUrl, setPrUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);

  const samplePrs = [
    {
      label: 'facebook/react #28000',
      url: 'https://github.com/facebook/react/pull/28000',
    },
    {
      label: 'vercel/next.js #55000',
      url: 'https://github.com/vercel/next.js/pull/55000',
    },
    {
      label: 'expressjs/express #5000',
      url: 'https://github.com/expressjs/express/pull/5000',
    },
  ];

  async function handleAnalyze(urlToAnalyze?: string) {
    const targetUrl = urlToAnalyze || prUrl;
    if (!targetUrl.trim()) {
      setError('Please enter a valid GitHub pull request URL.');
      return;
    }

    setError(null);
    setIsLoading(true);
    setStatusMessage('Connecting to GitHub API...');
    setProgressPercent(10);

    try {
      const result = await createAnalysis(targetUrl);
      const { analysisId } = result;

      // Poll status until complete or redirected
      const pollInterval = setInterval(async () => {
        try {
          const status = await getAnalysisStatus(analysisId);
          setProgressPercent(status.progressPercent);
          setStatusMessage(status.statusMessage);

          if (status.status === 'completed') {
            clearInterval(pollInterval);
            router.push(`/analysis/${analysisId}`);
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            setIsLoading(false);
            setError(status.error || 'Analysis failed. Please try again or check the PR URL.');
          }
        } catch (pollErr: any) {
          clearInterval(pollInterval);
          setIsLoading(false);
          setError(pollErr.message);
        }
      }, 1000);
    } catch (err: any) {
      setIsLoading(false);
      setError(err.message || 'Failed to start analysis');
    }
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)] px-4 py-8 sm:px-8 max-w-6xl mx-auto">
      {/* Hero Section */}
      <section className="text-center py-10 sm:py-16 space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Next-Generation Automated Code Review Platform</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white max-w-3xl mx-auto leading-tight">
          Smarter Code Reviews.{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-cyan-400">
            Better Software.
          </span>
        </h1>

        <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto">
          Catch bugs, security vulnerabilities, and subtle regressions before merging. CodeSense AI couples
          deterministic AST static analysis, machine learning risk estimation, and MongoDB reporting for GitHub pull requests.
        </p>

        {/* URL Input Box */}
        <div className="pt-6 max-w-2xl mx-auto">
          <div className="relative flex flex-col sm:flex-row gap-2 rounded-xl border border-slate-700/80 bg-slate-900/90 p-2 shadow-2xl backdrop-blur">
            <div className="relative flex-1 flex items-center">
              <GitPullRequest className="absolute left-3.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={prUrl}
                onChange={(e) => setPrUrl(e.target.value)}
                placeholder="https://github.com/owner/repo/pull/123 or owner/repo#123"
                disabled={isLoading}
                className="w-full rounded-lg bg-slate-950/70 py-2.5 pl-10 pr-4 text-xs sm:text-sm text-slate-100 placeholder-slate-500 border border-slate-800 focus:border-blue-500 focus:outline-none transition"
              />
            </div>
            <button
              onClick={() => handleAnalyze()}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow hover:bg-blue-500 disabled:opacity-50 transition"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <span>Analyze Pull Request</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>

          {/* Quick Samples */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
            <span className="text-slate-500">Try public example:</span>
            {samplePrs.map((sample) => (
              <button
                key={sample.url}
                onClick={() => {
                  setPrUrl(sample.url);
                  handleAnalyze(sample.url);
                }}
                disabled={isLoading}
                className="rounded-md border border-slate-800 bg-slate-900/40 px-2.5 py-1 text-slate-300 hover:border-slate-700 hover:text-white transition disabled:opacity-50"
              >
                {sample.label}
              </button>
            ))}
          </div>

          {/* Live Progress Bar during Analysis */}
          {isLoading && (
            <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/80 p-4 text-left shadow">
              <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                  {statusMessage || 'Analyzing pull request...'}
                </span>
                <span className="font-mono text-blue-400">{progressPercent}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Parsing changed files, running AST bug detectors, evaluating security rules, and computing risk metrics.
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 text-left text-xs text-rose-300 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-rose-400 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-200">Analysis Error</p>
                <p className="mt-0.5 text-rose-300/90">{error}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-8 border-t border-slate-800/80">
        <div className="text-center mb-8">
          <h2 className="text-lg font-bold text-slate-100">Engineering-Grade Code Inspection</h2>
          <p className="text-xs text-slate-400 mt-1">
            Built for developers who demand real AST-based static verification and reproducible defect analysis.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:border-slate-700 transition">
            <div className="h-9 w-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-3">
              <Code2 className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">Deterministic AST Analysis</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Syntactic parsing of TypeScript and JavaScript code without execution. Detects dead code, NaN comparisons,
              unhandled rejections, and loose equality.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:border-slate-700 transition">
            <div className="h-9 w-9 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-3">
              <Lock className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">Security & Secret Guards</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Detects accidental credential leaks (AWS, GitHub tokens, JWTs), dangerous innerHTML manipulation, and eval
              invocations before production deployment.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:border-slate-700 transition">
            <div className="h-9 w-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-3">
              <Cpu className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">Defect Risk Estimation</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Transparent defect risk scoring factoring in line churn, file cross-coupling, and finding severity weights,
              supplemented by machine learning models.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
