'use client';

import React, { useState } from 'react';
import { ReviewFinding } from '@codesense/shared';
import { SeverityBadge } from './SeverityBadge';
import { DiffViewer } from './DiffViewer';
import { ChevronDown, ChevronUp, AlertCircle, ShieldAlert, Sparkles, Code2, Wrench } from 'lucide-react';

export function FindingCard({ finding }: { finding: ReviewFinding }) {
  const [isExpanded, setIsExpanded] = useState(true);

  const categoryIcons: Record<string, React.ReactNode> = {
    potential_bug: <AlertCircle className="h-4 w-4 text-amber-400" />,
    security: <ShieldAlert className="h-4 w-4 text-rose-400" />,
    code_quality: <Code2 className="h-4 w-4 text-blue-400" />,
    performance: <Sparkles className="h-4 w-4 text-purple-400" />,
    maintainability: <Wrench className="h-4 w-4 text-emerald-400" />,
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 shadow-sm transition hover:border-slate-700">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{categoryIcons[finding.category] || <AlertCircle className="h-4 w-4" />}</div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={finding.severity} />
              <span className="text-xs font-mono text-slate-400">{finding.ruleId}</span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                {finding.isDeterministic ? 'Deterministic Rule' : 'AI Analysis'}
              </span>
            </div>
            <h4 className="mt-1 text-sm font-medium text-slate-100">{finding.title}</h4>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {finding.filePath}:{finding.line}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="self-end sm:self-start inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition"
        >
          {isExpanded ? 'Collapse' : 'Details'}
          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-3 pt-3 border-t border-slate-800/80">
          <div>
            <p className="text-xs font-medium text-slate-300 mb-1">Issue Explanation</p>
            <p className="text-xs text-slate-400 leading-relaxed">{finding.explanation}</p>
          </div>

          {finding.suggestion && (
            <div className="rounded-md bg-blue-950/20 border border-blue-900/30 p-2.5">
              <p className="text-xs font-semibold text-blue-300 mb-0.5">Recommended Action</p>
              <p className="text-xs text-blue-200/80">{finding.suggestion}</p>
            </div>
          )}

          {finding.codeSnippet && (
            <DiffViewer snippet={finding.codeSnippet} filePath={finding.filePath} line={finding.line} />
          )}
        </div>
      )}
    </div>
  );
}
