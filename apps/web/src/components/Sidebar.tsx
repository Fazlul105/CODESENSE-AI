'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, History, GitPullRequest, Activity, ShieldCheck, FolderGit2 } from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { label: 'Analyze PR', href: '/', icon: GitPullRequest },
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Analysis History', href: '/history', icon: History },
    { label: 'Repositories', href: '/repositories', icon: FolderGit2 },
    { label: 'System Status', href: '/settings', icon: Activity },
  ];

  return (
    <aside className="hidden md:flex w-56 flex-col border-r border-slate-800 bg-slate-950/60 p-4">
      <div className="space-y-1">
        <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Navigation
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium transition ${
                isActive
                  ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-auto pt-4 border-t border-slate-900">
        <div className="rounded-lg bg-slate-900/40 border border-slate-800/80 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>MongoDB Atlas</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Engine active & connected.
          </p>
        </div>
      </div>
    </aside>
  );
}
