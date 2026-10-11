'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { listAnalyses, getCurrentUser, API_BASE } from '@/lib/api';
import { RiskBadge } from '@/components/RiskBadge';
import { History, ChevronLeft, ChevronRight, Loader2, GitPullRequest, Calendar, Lock, Github } from 'lucide-react';

export default function HistoryPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState(1);
  const limit = 10;

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

  const { data, isLoading, error } = useQuery({
    queryKey: ['analyses-history', currentUser?.id, page],
    queryFn: () => listAnalyses(page, limit),
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
          <h2 className="text-xl font-bold text-slate-100">Sign in to View History</h2>
          <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">
            Pull request review history is private to your GitHub account. Please authenticate with GitHub to access your past review records.
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

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-slate-400">Loading analysis history...</p>
      </div>
    );
  }

  const analyses = data?.analyses || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Analysis History</h1>
          <p className="text-xs text-slate-400 mt-1">
            Persisted pull request code reviews stored in MongoDB.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition shadow"
        >
          <GitPullRequest className="h-4 w-4" />
          <span>New Analysis</span>
        </Link>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        {analyses.length === 0 ? (
          <div className="py-12 text-center">
            <History className="mx-auto h-8 w-8 text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-300">No review records yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Start by pasting a public GitHub pull request on the home screen.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-3 font-medium">Repository & Pull Request</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Risk Assessment</th>
                  <th className="pb-3 font-medium">Findings Breakdown</th>
                  <th className="pb-3 font-medium">Analysis Date</th>
                  <th className="pb-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {analyses.map((item: any) => (
                  <tr key={item.id} className="hover:bg-slate-900/40">
                    <td className="py-3.5">
                      <div className="font-medium text-slate-200">
                        {item.repository?.fullName || 'Repository'} #{item.pullRequest?.number}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate max-w-sm">
                        {item.pullRequest?.title}
                      </div>
                    </td>
                    <td className="py-3.5">
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
                    <td className="py-3.5">
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
                    <td className="py-3.5">
                      {item.findingsCount ? (
                        <div className="flex items-center gap-1.5 text-[11px] font-mono">
                          <span className="text-rose-400">{item.findingsCount.critical}C</span>
                          <span className="text-orange-400">{item.findingsCount.high}H</span>
                          <span className="text-amber-400">{item.findingsCount.medium}M</span>
                          <span className="text-blue-400">{item.findingsCount.low}L</span>
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-3.5 text-slate-400">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3.5 text-right">
                      <Link
                        href={`/analysis/${item.id}`}
                        className="rounded-lg bg-blue-600/10 border border-blue-500/20 px-3 py-1.5 text-blue-400 hover:bg-blue-600 hover:text-white transition"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs text-slate-400">
            <span>
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 disabled:opacity-40 hover:bg-slate-800"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 disabled:opacity-40 hover:bg-slate-800"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
