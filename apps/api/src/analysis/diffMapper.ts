export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  addedLines: Set<number>; // Line numbers in the new file that were added/modified
}

export function parseGitPatch(patch?: string): { addedLines: Set<number>; hunks: DiffHunk[] } {
  const addedLines = new Set<number>();
  const hunks: DiffHunk[] = [];

  if (!patch) {
    return { addedLines, hunks };
  }

  const lines = patch.split('\n');
  let currentHunk: DiffHunk | null = null;
  let currentNewLine = 0;

  for (const line of lines) {
    const hunkHeader = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkHeader) {
      const oldStart = parseInt(hunkHeader[1], 10);
      const oldLines = hunkHeader[2] !== undefined ? parseInt(hunkHeader[2], 10) : 1;
      const newStart = parseInt(hunkHeader[3], 10);
      const newLines = hunkHeader[4] !== undefined ? parseInt(hunkHeader[4], 10) : 1;

      currentHunk = {
        oldStart,
        oldLines,
        newStart,
        newLines,
        addedLines: new Set<number>(),
      };
      hunks.push(currentHunk);
      currentNewLine = newStart;
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines.add(currentNewLine);
      currentHunk.addedLines.add(currentNewLine);
      currentNewLine++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // Deleted line, does not advance currentNewLine
    } else {
      // Unchanged context line
      currentNewLine++;
    }
  }

  return { addedLines, hunks };
}

/**
 * Extracts relevant code snippet around a specific line number
 */
export function extractCodeSnippet(content: string, targetLine: number, contextLines = 2): string {
  const lines = content.split('\n');
  const start = Math.max(0, targetLine - 1 - contextLines);
  const end = Math.min(lines.length, targetLine + contextLines);
  
  return lines
    .slice(start, end)
    .map((line, idx) => {
      const lineNum = start + idx + 1;
      const prefix = lineNum === targetLine ? '> ' : '  ';
      return `${prefix}${lineNum.toString().padStart(4, ' ')} | ${line}`;
    })
    .join('\n');
}
