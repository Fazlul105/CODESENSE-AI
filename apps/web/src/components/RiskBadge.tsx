import React from 'react';
import { RiskLevel } from '@codesense/shared';

interface RiskBadgeProps {
  level: RiskLevel;
  score?: number;
  showScore?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function RiskBadge({ level, score, showScore = true, size = 'md' }: RiskBadgeProps) {
  const styles: Record<RiskLevel, { bg: string; text: string; border: string; label: string }> = {
    low: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      border: 'border-emerald-500/20',
      label: 'Low Risk',
    },
    medium: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/20',
      label: 'Medium Risk',
    },
    high: {
      bg: 'bg-orange-500/10',
      text: 'text-orange-400',
      border: 'border-orange-500/20',
      label: 'High Risk',
    },
    critical: {
      bg: 'bg-rose-500/10',
      text: 'text-rose-400',
      border: 'border-rose-500/20',
      label: 'Critical Risk',
    },
  };

  const current = styles[level] || styles.low;
  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-xs'
      : size === 'lg'
      ? 'px-3.5 py-1.5 text-sm font-semibold'
      : 'px-2.5 py-1 text-xs font-medium';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${current.bg} ${current.text} ${current.border} ${sizeClasses}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      <span>{current.label}</span>
      {showScore && score !== undefined && (
        <span className="opacity-80 font-mono">({score}/100)</span>
      )}
    </span>
  );
}
