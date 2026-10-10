'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderGit2, Search, ExternalLink, GitPullRequest, ArrowRight, Loader2 } from 'lucide-react';

export default function RepositoriesPage() {
  const router = useRouter();
  const [repoInput, setRepoInput] = useState('');
  const [ownerRepo, setOwnerRepo] = useState({ owner: 'facebook', repo: 'react' });
  const [pulls, setPulls] = useState<any[]>([]);
  const [isLoadingPulls, setIsLoadingPulls] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchRepoPulls(owner: string, repo: string) {
    setIsLoadingPulls(true);
    setError(null);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';
      const res = await fetch(`${apiBase}/repositories/${owner}/${repo}/pulls?state=open`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch pull requests');
      }
      setPulls(data.data || []);
      setOwnerRepo({ owner, repo });
    } catch (err: any) {
      setError(err.message);
      setPulls([]);
    } finally {
      setIsLoadingPulls(false);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = repoInput.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/, '');
    const parts = clean.split('/');
    if (parts.length >= 2) {
      fetchRepoPulls(parts[0], parts[1]);
    } else {
      setError('Please provide a repository in "owner/repo" or "https://github.com/owner/repo" format.');
    }
  }

  const popularRepos = [
    { owner: 'facebook', repo: 'react' },
    { owner: 'vercel', repo: 'next.js' },
    { owner: 'expressjs', repo: 'express' },
    { owner: 'tailwindlabs', repo: 'tailwindcss' },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Repository & Pull Request Browser</h1>
        <p className="text-xs text-slate-400 mt-1">
          Explore public GitHub repositories and inspect their open pull requests directly.
        </p>
      </div>

      {/* Repository Search Bar */}
      <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2 max-w-2xl">
        <div className="relative flex-1">
          <FolderGit2 className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="Search repository e.g. facebook/react or vercel/next.js"
            className="w-full rounded-lg border border-slate-800 bg-slate-900/80 py-2.5 pl-10 pr-4 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={isLoadingPulls}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition"
        >
          {isLoadingPulls ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span>Browse Pull Requests</span>
        </button>
      </form>

      {/* Quick Repository Badges */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Popular open-source:</span>
        {popularRepos.map((r) => (
          <button
            key={`${r.owner}/${r.repo}`}
            onClick={() => {
              setRepoInput(`${r.owner}/${r.repo}`);
              fetchRepoPulls(r.owner, r.repo);
            }}
            className="rounded-md border border-slate-800 bg-slate-900/50 px-2.5 py-1 text-slate-300 hover:text-white hover:border-slate-700 transition"
          >
            {r.owner}/{r.repo}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Pull Requests List */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">
            Open Pull Requests for {ownerRepo.owner}/{ownerRepo.repo} ({pulls.length})
          </h3>
          <a
            href={`https://github.com/${ownerRepo.owner}/${ownerRepo.repo}/pulls`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            <span>View on GitHub</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {isLoadingPulls ? (
          <div className="py-12 text-center flex flex-col items-center gap-2 text-slate-400 text-xs">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <span>Fetching pull requests from GitHub API...</span>
          </div>
        ) : pulls.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            Click &quot;Browse Pull Requests&quot; above or pick a popular repo to view its active PRs.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {pulls.map((pr: any) => (
              <div
                key={pr.number}
                className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-900/40 px-2 rounded-lg transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-blue-400">#{pr.number}</span>
                    <span className="text-xs font-medium text-slate-200">{pr.title}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Opened by @{pr.author} • Updated {new Date(pr.updatedAt).toLocaleDateString()}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <a
                    href={pr.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                    title="Open on GitHub"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    onClick={() => {
                      router.push(`/?url=${encodeURIComponent(pr.htmlUrl)}`);
                    }}
                    className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition"
                  >
                    <GitPullRequest className="h-3.5 w-3.5" />
                    <span>Analyze</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
