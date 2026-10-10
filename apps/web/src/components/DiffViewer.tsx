import React from 'react';

interface DiffViewerProps {
  snippet?: string;
  filePath: string;
  line: number;
}

export function DiffViewer({ snippet, filePath, line }: DiffViewerProps) {
  if (!snippet) {
    return (
      <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-400">
        No code snippet available for this finding.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-950 font-mono text-xs">
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-900/60 px-3 py-1.5 text-slate-400">
        <span className="truncate">{filePath}</span>
        <span className="text-[11px] text-slate-400 font-medium">Line {line}</span>
      </div>
      <div className="overflow-x-auto p-3 leading-relaxed">
        <pre className="text-slate-300">
          {snippet.split('\n').map((row, idx) => {
            const isTarget = row.startsWith('>');
            return (
              <div
                key={idx}
                className={`py-0.5 px-1 rounded ${
                  isTarget
                    ? 'bg-rose-500/10 text-rose-200 border-l-2 border-rose-500 font-semibold'
                    : 'text-slate-400'
                }`}
              >
                {row}
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}
