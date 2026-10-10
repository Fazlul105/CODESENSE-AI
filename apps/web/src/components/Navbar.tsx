'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, GitPullRequest, Github, PlusCircle, LogIn, LogOut, User } from 'lucide-react';
import { getCurrentUser, logoutUser, API_BASE } from '@/lib/api';

export function Navbar() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then((res) => {
        if (res?.isAuthenticated && res?.user) {
          setCurrentUser(res.user);
        } else {
          setCurrentUser(null);
        }
      })
      .catch(() => setCurrentUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleLogout() {
    try {
      await logoutUser();
      setCurrentUser(null);
      window.location.reload();
    } catch (err) {
      console.error('Logout error:', err);
    }
  }

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
            v1.0 Production Ready
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

          {currentUser ? (
            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-800">
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.username}
                  className="h-6 w-6 rounded-full border border-slate-700"
                />
              ) : (
                <div className="h-6 w-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-slate-300">
                  <User className="h-3.5 w-3.5" />
                </div>
              )}
              <span className="text-xs text-slate-200 font-medium hidden sm:inline-block">
                @{currentUser.username}
              </span>
              <button
                onClick={handleLogout}
                className="text-slate-400 hover:text-rose-400 p-1 text-xs transition"
                title="Log out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <a
              href={`${API_BASE}/auth/github`}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition"
              title="Sign in with GitHub for private repository access"
            >
              <Github className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign In</span>
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
