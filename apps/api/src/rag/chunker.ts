import crypto from 'crypto';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { parseSourceCode } from '../analysis/astParser';
import { redactSensitiveData } from '../utils/redact';
import { ChunkType } from './types';

export interface RawChunk {
  startLine: number;
  endLine: number;
  symbolName?: string;
  chunkType: ChunkType;
  content: string;
}

export interface ChunkOptions {
  maxChunkLines?: number; // default: 50
  overlapLines?: number;  // default: 10
}

export interface ChunkExtractionInput {
  sourceCode: string;
  filePath: string;
  analysisId: string;
  repository: string;
  commitSha: string;
  pullNumber: number;
  isPrivate: boolean;
  isChangedInPr?: boolean;
  options?: ChunkOptions;
}

export interface ProcessedChunk {
  analysisId: string;
  repository: string;
  commitSha: string;
  pullNumber: number;
  filePath: string;
  startLine: number;
  endLine: number;
  symbolName?: string;
  chunkType: ChunkType;
  language: string;
  content: string;
  contentHash: string;
  isPrivate: boolean;
  isChangedInPr: boolean;
}

function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

function detectLanguage(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.ts')) return 'typescript';
  if (lower.endsWith('.tsx')) return 'typescript-react';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript';
  if (lower.endsWith('.jsx')) return 'javascript-react';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'markdown';
  return 'plaintext';
}

/**
 * Splits a large line range into smaller overlapping chunks while preserving original line numbers.
 */
function splitLargeRange(
  lines: string[],
  startLine: number,
  endLine: number,
  symbolName: string | undefined,
  chunkType: ChunkType,
  maxChunkLines: number,
  overlapLines: number
): RawChunk[] {
  const chunks: RawChunk[] = [];
  let currentStart = startLine;

  while (currentStart <= endLine) {
    const currentEnd = Math.min(currentStart + maxChunkLines - 1, endLine);
    const slice = lines.slice(currentStart - 1, currentEnd);
    const content = slice.join('\n');

    if (content.trim().length > 0) {
      chunks.push({
        startLine: currentStart,
        endLine: currentEnd,
        symbolName: symbolName ? `${symbolName} (lines ${currentStart}-${currentEnd})` : undefined,
        chunkType,
        content,
      });
    }

    if (currentEnd >= endLine) break;
    currentStart = currentEnd - overlapLines + 1;
    if (currentStart <= startLine) {
      currentStart = currentEnd + 1;
    }
  }

  return chunks;
}

/**
 * Safe line-based sliding window chunker used as fallback when AST parsing fails or for JSON/text files.
 */
export function lineBasedFallbackChunk(
  sourceCode: string,
  maxLines: number = 40,
  overlap: number = 8
): RawChunk[] {
  const lines = sourceCode.split('\n');
  if (lines.length === 0 || sourceCode.trim().length === 0) return [];

  if (lines.length <= maxLines) {
    return [
      {
        startLine: 1,
        endLine: lines.length,
        chunkType: 'fallback',
        content: sourceCode,
      },
    ];
  }

  const chunks: RawChunk[] = [];
  let start = 1;

  while (start <= lines.length) {
    const end = Math.min(start + maxLines - 1, lines.length);
    const content = lines.slice(start - 1, end).join('\n');

    if (content.trim().length > 0) {
      chunks.push({
        startLine: start,
        endLine: end,
        chunkType: 'fallback',
        content,
      });
    }

    if (end >= lines.length) break;
    start = end - overlap + 1;
    if (start <= 1) start = end + 1;
  }

  return chunks;
}

/**
 * Parses source code and generates semantic, AST-aware chunks (functions, classes, methods, modules).
 */
export function extractCodeChunks(input: ChunkExtractionInput): ProcessedChunk[] {
  const {
    sourceCode,
    filePath,
    analysisId,
    repository,
    commitSha,
    pullNumber,
    isPrivate,
    isChangedInPr = false,
    options = {},
  } = input;

  const maxChunkLines = options.maxChunkLines ?? 50;
  const overlapLines = options.overlapLines ?? 10;
  const language = detectLanguage(filePath);

  if (!sourceCode || sourceCode.trim().length === 0) {
    return [];
  }

  const lines = sourceCode.split('\n');
  const rawChunks: RawChunk[] = [];
  const coveredRanges: Array<{ start: number; end: number }> = [];

  // Attempt AST parsing to extract semantic symbols
  const ast = parseSourceCode(sourceCode, filePath);

  if (ast) {
      try {
        const traverseFn = (traverse as any).default || traverse;
        traverseFn(ast, {
          // 1. Functions & Arrow Functions
          FunctionDeclaration(path: any) {
            if (path.node.loc) {
              const start = path.node.loc.start.line;
              const end = path.node.loc.end.line;
              const name = path.node.id?.name;
              coveredRanges.push({ start, end });

              if (end - start + 1 > maxChunkLines) {
                rawChunks.push(
                  ...splitLargeRange(lines, start, end, name, 'function', maxChunkLines, overlapLines)
                );
              } else {
                rawChunks.push({
                  startLine: start,
                  endLine: end,
                  symbolName: name,
                  chunkType: 'function',
                  content: lines.slice(start - 1, end).join('\n'),
                });
              }
            }
          },

          // 2. Classes
          ClassDeclaration(path: any) {
            if (path.node.loc) {
              const start = path.node.loc.start.line;
              const end = path.node.loc.end.line;
              const name = path.node.id?.name;
              coveredRanges.push({ start, end });

              if (end - start + 1 > maxChunkLines) {
                rawChunks.push(
                  ...splitLargeRange(lines, start, end, name, 'class', maxChunkLines, overlapLines)
                );
              } else {
                rawChunks.push({
                  startLine: start,
                  endLine: end,
                  symbolName: name,
                  chunkType: 'class',
                  content: lines.slice(start - 1, end).join('\n'),
                });
              }
            }
          },

          // 3. Class Methods
          ClassMethod(path: any) {
            if (path.node.loc) {
              const start = path.node.loc.start.line;
              const end = path.node.loc.end.line;
              const name = t.isIdentifier(path.node.key) ? path.node.key.name : undefined;

              // Only chunk method separately if parent class is large
              const parentClass = path.findParent((p: any) => p.isClassDeclaration());
              const isParentLarge = parentClass?.node?.loc && parentClass.node.loc.end.line - parentClass.node.loc.start.line > 30;

              if (isParentLarge) {
                coveredRanges.push({ start, end });
                if (end - start + 1 > maxChunkLines) {
                  rawChunks.push(
                    ...splitLargeRange(lines, start, end, name, 'method', maxChunkLines, overlapLines)
                  );
                } else {
                  rawChunks.push({
                    startLine: start,
                    endLine: end,
                    symbolName: name,
                    chunkType: 'method',
                    content: lines.slice(start - 1, end).join('\n'),
                  });
                }
              }
            }
          },

          // 4. Variable-assigned Functions / Handlers / Middleware (e.g. const auth = (req, res) => { ... })
          VariableDeclarator(path: any) {
            if (
              path.node.init &&
              (t.isArrowFunctionExpression(path.node.init) || t.isFunctionExpression(path.node.init)) &&
              path.node.loc
            ) {
              const start = path.node.loc.start.line;
              const end = path.node.loc.end.line;
              const name = t.isIdentifier(path.node.id) ? path.node.id.name : undefined;
              coveredRanges.push({ start, end });

              if (end - start + 1 > maxChunkLines) {
                rawChunks.push(
                  ...splitLargeRange(lines, start, end, name, 'function', maxChunkLines, overlapLines)
                );
              } else {
                rawChunks.push({
                  startLine: start,
                  endLine: end,
                  symbolName: name,
                  chunkType: 'function',
                  content: lines.slice(start - 1, end).join('\n'),
                });
              }
            }
          },
        });

        // Capture top-level preamble / module imports (lines 1 to 25 if not already covered)
        if (lines.length > 5) {
          const preambleEnd = Math.min(25, lines.length);
          const hasCoveredStart = coveredRanges.some((r) => r.start <= 5);
          if (!hasCoveredStart) {
            rawChunks.push({
              startLine: 1,
              endLine: preambleEnd,
              symbolName: 'Module imports & declarations',
              chunkType: 'module',
              content: lines.slice(0, preambleEnd).join('\n'),
            });
          }
        }
      } catch {
        // Fallback if AST traversal errors
        rawChunks.push(...lineBasedFallbackChunk(sourceCode, maxChunkLines, overlapLines));
      }

      // If AST produced no chunks (e.g. non-functional script), use fallback
      if (rawChunks.length === 0) {
        if (lines.length <= 40) {
          rawChunks.push({
            startLine: 1,
            endLine: lines.length,
            symbolName: filePath.split('/').pop(),
            chunkType: 'module',
            content: sourceCode,
          });
        } else {
          rawChunks.push(...lineBasedFallbackChunk(sourceCode, maxChunkLines, overlapLines));
        }
      }
    } else {
      // If AST cannot parse, use line-based fallback
      if (lines.length <= 40) {
        rawChunks.push({
          startLine: 1,
          endLine: lines.length,
          symbolName: filePath.split('/').pop(),
          chunkType: 'module',
          content: sourceCode,
        });
      } else {
        rawChunks.push(...lineBasedFallbackChunk(sourceCode, maxChunkLines, overlapLines));
      }
    }

  // Deduplicate and process chunks with secret redaction and SHA-256 hash
  const seenHashes = new Set<string>();
  const processed: ProcessedChunk[] = [];

  for (const rc of rawChunks) {
    const sanitizedContent = redactSensitiveData(rc.content.trim());
    if (!sanitizedContent) continue;

    const hash = computeContentHash(sanitizedContent);
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);

    processed.push({
      analysisId,
      repository,
      commitSha,
      pullNumber,
      filePath,
      startLine: rc.startLine,
      endLine: rc.endLine,
      symbolName: rc.symbolName,
      chunkType: rc.chunkType,
      language,
      content: sanitizedContent,
      contentHash: hash,
      isPrivate,
      isChangedInPr,
    });
  }

  return processed;
}
