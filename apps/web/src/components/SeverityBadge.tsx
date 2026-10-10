import React from 'react';
import { Severity } from '@codesense/shared';

export function SeverityBadge({ severity }: { severity: Severity }) {
  const styles: Record<Severity, { bg: string; text: string; border: string }> = {
    critical: {
      bg: 'bg-rose-500/15',
      text: 'text-rose-400',
      border: 'border-rose-500/30',
    },
    high: {
      bg: 'bg-orange-500/15',
      text: 'text-orange-400',
      border: 'border-orange-500/30',
    },
    medium: {
      bg: 'bg-amber-500/15',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
    },
    low: {
      bg: 'bg-blue-500/15',
      text: 'text-blue-400',
      border: 'border-blue-500/30',
    },
    informational: {
      bg: 'bg-slate-500/15',
      text: 'text-slate-400',
      border: 'border-slate-500/30',
    },
  };

  const current = styles[severity] || styles.informational;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wider border ${current.bg} ${current.text} ${current.border}`}
    >
      {severity}
    </span>
  );
}
