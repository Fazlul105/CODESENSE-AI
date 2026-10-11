'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { exchangeOAuthCode } from '@/lib/api';
import { Loader2, AlertCircle } from 'lucide-react';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state') || undefined;

    if (!code) {
      setError('No authorization code received from GitHub.');
      return;
    }

    exchangeOAuthCode(code, state)
      .then((data: any) => {
        if (typeof window !== 'undefined') {
          if (data?.user) {
            localStorage.setItem('codesense_user', JSON.stringify(data.user));
          }
          if (data?.token) {
            localStorage.setItem('codesense_token', data.token);
          }
        }
        window.location.href = '/dashboard';
      })
      .catch((err) => {
        setError(err.message || 'Failed to complete authentication with GitHub.');
      });
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="max-w-md rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center text-rose-300">
        <AlertCircle className="mx-auto h-8 w-8 text-rose-400 mb-2" />
        <h2 className="text-base font-semibold text-rose-200">Authentication Failed</h2>
        <p className="text-xs text-rose-300/80 mt-2">{error}</p>
        <button
          onClick={() => router.push('/')}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
        >
          Return Home
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      <p className="text-sm font-medium text-slate-300">Completing GitHub authentication...</p>
      <p className="text-xs text-slate-500">Exchanging secure authorization code with backend session</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <div className="flex h-[80vh] items-center justify-center flex-col gap-4 p-4">
      <Suspense
        fallback={
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm font-medium text-slate-300">Loading authentication status...</p>
          </div>
        }
      >
        <AuthCallbackContent />
      </Suspense>
    </div>
  );
}
