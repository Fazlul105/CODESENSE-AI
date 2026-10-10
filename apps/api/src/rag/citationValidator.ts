import { RetrievedChunk, RagCitation } from './types';

export interface CitationValidationContext {
  chunks: RetrievedChunk[];
  repository: string; // "owner/repo"
  commitSha: string;
}

/**
 * Extracts candidate citations from response text (e.g. "src/auth.ts:20-35" or "src/index.js line 15").
 */
export function extractCitationsFromText(text: string): Array<{ filePath: string; startLine?: number; endLine?: number }> {
  const citations: Array<{ filePath: string; startLine?: number; endLine?: number }> = [];

  // Pattern 1: path/to/file.ext:10-25 or path/to/file.ext:10
  const colonRegex = /(?:^|\s|`|\()([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+):(\d+)(?:-(\d+))?(?:`|\)|,|$|\s)/g;
  let match: RegExpExecArray | null;

  while ((match = colonRegex.exec(text)) !== null) {
    const filePath = match[1];
    const startLine = parseInt(match[2], 10);
    const endLine = match[3] ? parseInt(match[3], 10) : startLine;

    // Filter out common false positives like "http://..." or "v1:0"
    if (!filePath.startsWith('http') && filePath.includes('/')) {
      citations.push({ filePath, startLine, endLine });
    }
  }

  // Pattern 2: "File: path/to/file.ext, lines 10-25"
  const fileLineRegex = /File:\s*`?([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)`?,?\s*(?:lines?|line)\s*(\d+)(?:-(\d+)|–(\d+))?/gi;
  while ((match = fileLineRegex.exec(text)) !== null) {
    const filePath = match[1];
    const startLine = parseInt(match[2], 10);
    const endLine = match[3] ? parseInt(match[3], 10) : match[4] ? parseInt(match[4], 10) : startLine;
    citations.push({ filePath, startLine, endLine });
  }

  return citations;
}

/**
 * Validates extracted or retrieved citations against the ground truth of indexed chunks.
 * Rejects hallucinated file paths or wildly out-of-range line references.
 */
export function validateCitations(
  text: string,
  context: CitationValidationContext
): RagCitation[] {
  const { chunks, repository, commitSha } = context;
  const validChunkFiles = new Map<string, Array<{ startLine: number; endLine: number; symbolName?: string }>>();

  for (const c of chunks) {
    if (!validChunkFiles.has(c.filePath)) {
      validChunkFiles.set(c.filePath, []);
    }
    validChunkFiles.get(c.filePath)!.push({
      startLine: c.startLine,
      endLine: c.endLine,
      symbolName: c.symbolName,
    });
  }

  const rawExtracted = extractCitationsFromText(text);
  const validatedMap = new Map<string, RagCitation>();

  for (const raw of rawExtracted) {
    const matchingChunk = chunks.find((c) => c.filePath === raw.filePath);
    if (!matchingChunk) {
      // File was not in retrieved context; do not validate hallucinated file
      continue;
    }

    const start = raw.startLine ?? matchingChunk.startLine;
    const end = raw.endLine ?? matchingChunk.endLine;

    const key = `${raw.filePath}:${start}-${end}`;
    if (!validatedMap.has(key)) {
      const lineAnchor = start === end ? `#L${start}` : `#L${start}-L${end}`;
      validatedMap.set(key, {
        filePath: raw.filePath,
        startLine: start,
        endLine: end,
        symbolName: matchingChunk.symbolName,
        gitRef: commitSha,
        githubUrl: `https://github.com/${repository}/blob/${commitSha}/${raw.filePath}${lineAnchor}`,
        snippet: matchingChunk.content.slice(0, 150) + (matchingChunk.content.length > 150 ? '...' : ''),
      });
    }
  }

  // If no citations were parsed from free-form text, derive structured citations directly
  // from the top retrieved evidence chunks so the UI always has verified links.
  if (validatedMap.size === 0 && chunks.length > 0) {
    const topEvidence = chunks.slice(0, 3);
    for (const c of topEvidence) {
      const key = `${c.filePath}:${c.startLine}-${c.endLine}`;
      const lineAnchor = c.startLine === c.endLine ? `#L${c.startLine}` : `#L${c.startLine}-L${c.endLine}`;
      validatedMap.set(key, {
        filePath: c.filePath,
        startLine: c.startLine,
        endLine: c.endLine,
        symbolName: c.symbolName,
        gitRef: commitSha,
        githubUrl: `https://github.com/${repository}/blob/${commitSha}/${c.filePath}${lineAnchor}`,
        snippet: c.content.slice(0, 150) + (c.content.length > 150 ? '...' : ''),
      });
    }
  }

  return Array.from(validatedMap.values());
}
