'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, GitPullRequest, Github, PlusCircle } from 'lucide-react';

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 font-semibold text-slate-100 hover:text-white transition">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-base tracking-tight font-bold">
              CodeSense<span className="text-blue-500">.AI</span>
            </span>
          </Link>
          <span className="hidden sm:inline-block rounded-full bg-slate-800/80 px-2 py-0.5 text-[11px] font-medium text-slate-400 border border-slate-700/50">
            v1.0 MVP
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-500 transition"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>New Analysis</span>
          </Link>

          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-slate-800 bg-slate-900/60 p-2 text-slate-400 hover:text-slate-100 hover:border-slate-700 transition"
            title="GitHub Integration"
          >
            <Github className="h-4 w-4" />
          </a>
        </div>
      </div>
    </header>
  );
}
