import mongoose from 'mongoose';
import { CodeChunk } from './models/CodeChunk';
import { RetrievedChunk } from './types';

export interface KeywordSearchParams {
  question: string;
  analysisId: string;
  limit?: number;
}

const COMMON_STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'in', 'for', 'to', 'of', 'with', 'by',
  'does', 'this', 'that', 'these', 'those', 'have', 'has', 'had', 'what', 'how', 'why', 'can',
  'could', 'should', 'would', 'pr', 'pull', 'request', 'code',
]);

/**
 * Extracts searchable keywords, symbol candidates, and file paths from a user question.
 */
export function extractQueryKeywords(question: string): {
  terms: string[];
  exactPhrases: string[];
  filePathCandidates: string[];
} {
  const terms: string[] = [];
  const exactPhrases: string[] = [];
  const filePathCandidates: string[] = [];

  // Match quoted phrases
  const quotedMatches = question.match(/"([^"]+)"|'([^']+)'/g);
  if (quotedMatches) {
    for (const m of quotedMatches) {
      const clean = m.replace(/['"]/g, '').trim().toLowerCase();
      if (clean.length > 2) exactPhrases.push(clean);
    }
  }

  // Tokenize question
  const rawTokens = question
    .toLowerCase()
    .replace(/[^a-z0-9_\-\.\/]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !COMMON_STOP_WORDS.has(t));

  for (const token of rawTokens) {
    if (token.includes('/') || token.endsWith('.ts') || token.endsWith('.js') || token.endsWith('.json')) {
      filePathCandidates.push(token);
    }
    terms.push(token);
  }

  return { terms, exactPhrases, filePathCandidates };
}

/**
 * Searches code chunks using keyword and lexical scoring within the authorized analysis scope.
 */
export async function searchKeywordChunks(params: KeywordSearchParams): Promise<RetrievedChunk[]> {
  const { question, analysisId, limit = 6 } = params;
  const { terms, exactPhrases, filePathCandidates } = extractQueryKeywords(question);

  if (terms.length === 0 && exactPhrases.length === 0 && filePathCandidates.length === 0) {
    return [];
  }

  const chunks = await CodeChunk.find({
    analysisId: new mongoose.Types.ObjectId(analysisId),
    isPrivate: false,
  }).select('_id filePath startLine endLine symbolName chunkType content isChangedInPr');

  const scored: Array<{ doc: any; score: number }> = [];

  for (const doc of chunks) {
    let score = 0;
    const lowerContent = doc.content.toLowerCase();
    const lowerPath = doc.filePath.toLowerCase();
    const lowerSymbol = (doc.symbolName || '').toLowerCase();

    // 1. File path match boost
    for (const f of filePathCandidates) {
      if (lowerPath.includes(f)) {
        score += 15;
      }
    }

    // 2. Symbol name match boost
    for (const term of terms) {
      if (lowerSymbol && lowerSymbol.includes(term)) {
        score += 8;
      }
    }

    // 3. Exact quoted phrases match boost
    for (const phrase of exactPhrases) {
      if (lowerContent.includes(phrase)) {
        score += 10;
      }
    }

    // 4. Token matches in content
    for (const term of terms) {
      if (lowerContent.includes(term)) {
        score += 2;
      }
    }

    // 5. PR changed file prioritization
    if (doc.isChangedInPr) {
      score += 2;
    }

    if (score > 0) {
      scored.push({ doc, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ doc, score }) => ({
    chunkId: doc._id.toString(),
    filePath: doc.filePath,
    startLine: doc.startLine,
    endLine: doc.endLine,
    symbolName: doc.symbolName,
    chunkType: doc.chunkType,
    content: doc.content,
    score,
    matchSource: 'keyword' as const,
    isChangedInPr: doc.isChangedInPr,
  }));
}
