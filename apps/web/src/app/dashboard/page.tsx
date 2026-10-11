'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getDashboardStats, listAnalyses, getCurrentUser, API_BASE } from '@/lib/api';
import { RiskBadge } from '@/components/RiskBadge';
import {
  LayoutDashboard,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  TrendingUp,
  GitPullRequest,
  ArrowRight,
  Loader2,
  Calendar,
  Lock,
  Github,
} from 'lucide-react';

export default function DashboardPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('codesense_user');
        if (stored) {
          setCurrentUser(JSON.parse(stored));
        }
      } catch (_) {}
    }

    getCurrentUser()
      .then((res: any) => {
        if (res?.isAuthenticated && res?.user) {
          setCurrentUser(res.user);
        } else {
          setCurrentUser(null);
        }
      })
      .catch(() => setCurrentUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats', currentUser?.id],
    queryFn: getDashboardStats,
    enabled: !!currentUser,
  });

  const { data: recent, isLoading: recentLoading } = useQuery({
    queryKey: ['recent-analyses', currentUser?.id],
    queryFn: () => listAnalyses(1, 5),
    enabled: !!currentUser,
  });

  if (authLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-slate-400">Verifying session...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center backdrop-blur shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/10 border border-blue-500/20 text-blue-400 mb-5">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-100">Sign in to Access Dashboard</h2>
          <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">
            Your review analytics dashboard is private. Please authenticate with GitHub to inspect your pull request review health, risk trends, and vulnerability metrics.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href={`${API_BASE}/auth/github`}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition"
            >
              <Github className="h-4 w-4" />
              <span>Sign in with GitHub</span>
            </a>
            <Link
              href="/"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition"
            >
              <span>Analyze Public PR</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (statsLoading || recentLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-slate-400">Loading dashboard metrics...</p>
      </div>
    );
  }

  const s = stats || {
    totalAnalyses: 0,
    totalCompleted: 0,
    totalFindings: 0,
    avgRiskScore: 0,
    severityCounts: { critical: 0, high: 0, medium: 0, low: 0, informational: 0 },
    categoryCounts: {},
  };

  const analysesList = recent?.analyses || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Review Analytics Dashboard</h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time quality metrics, risk distribution, and historical pull request review health.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition shadow"
        >
          <GitPullRequest className="h-4 w-4" />
          <span>New Review</span>
        </Link>
      </div>

      {/* Top 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-xs font-medium text-slate-400">Total Analyses Run</p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-extrabold text-slate-100">{s.totalAnalyses}</span>
            <span className="text-xs text-emerald-400 font-medium">Real-time</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">{s.totalCompleted} completed runs</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-xs font-medium text-slate-400">Total Findings Caught</p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-extrabold text-blue-400">{s.totalFindings}</span>
            <span className="text-xs text-blue-400/80 font-mono">AST + Rules</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Across analyzed JavaScript & TypeScript PRs</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-xs font-medium text-slate-400">Average Risk Score</p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-extrabold text-amber-400">{s.avgRiskScore}</span>
            <span className="text-xs text-slate-500 font-mono">/ 100</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Evaluated via churn & issue weights</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-xs font-medium text-slate-400">Critical Issues Intercepted</p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-extrabold text-rose-400">{s.severityCounts.critical || 0}</span>
            <span className="text-xs text-rose-400/80 font-mono">Security/Crash</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Prevented merge hazards</p>
        </div>
      </div>

      {/* Severity Breakdown Bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-200">Severity Breakdown Across Analyses</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
            <span className="text-xs text-rose-400 font-medium">Critical</span>
            <p className="text-xl font-bold text-rose-300 mt-1">{s.severityCounts.critical || 0}</p>
          </div>
          <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
            <span className="text-xs text-orange-400 font-medium">High</span>
            <p className="text-xl font-bold text-orange-300 mt-1">{s.severityCounts.high || 0}</p>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <span className="text-xs text-amber-400 font-medium">Medium</span>
            <p className="text-xl font-bold text-amber-300 mt-1">{s.severityCounts.medium || 0}</p>
          </div>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
            <span className="text-xs text-blue-400 font-medium">Low</span>
            <p className="text-xl font-bold text-blue-300 mt-1">{s.severityCounts.low || 0}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <span className="text-xs text-slate-400 font-medium">Informational</span>
            <p className="text-xl font-bold text-slate-300 mt-1">{s.severityCounts.informational || 0}</p>
          </div>
        </div>
      </div>

      {/* Recent Analyses Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Recent Pull Request Analyses</h3>
          <Link href="/history" className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1">
            <span>View All</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {analysesList.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No analyses recorded yet. Paste a GitHub PR URL on the homepage to run your first review.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2 font-medium">Repository / PR</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Risk Level</th>
                  <th className="pb-2 font-medium">Findings</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {analysesList.map((item: any) => (
                  <tr key={item.id} className="hover:bg-slate-900/50">
                    <td className="py-3">
                      <div className="font-medium text-slate-200">
                        {item.repository?.fullName || 'Repository'} #{item.pullRequest?.number}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate max-w-xs">
                        {item.pullRequest?.title}
                      </div>
                    </td>
                    <td className="py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] uppercase font-semibold ${
                          item.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : item.status === 'in_progress'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3">
                      {item.riskAssessment ? (
                        <RiskBadge
                          level={item.riskAssessment.riskLevel}
                          score={item.riskAssessment.overallScore}
                          size="sm"
                        />
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-3 text-slate-300 font-mono">
                      {item.findingsCount?.total ?? '—'}
                    </td>
                    <td className="py-3 text-slate-400">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/analysis/${item.id}`}
                        className="rounded bg-slate-800 px-2.5 py-1 text-slate-200 hover:bg-slate-700 hover:text-white transition"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
