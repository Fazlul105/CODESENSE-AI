import { Octokit } from '@octokit/rest';
import { ChangedFile, PullRequestMetadata } from '@codesense/shared';
import { config } from '../config';

export interface ParsedPrUrl {
  owner: string;
  repo: string;
  pullNumber: number;
}

export function parsePullRequestUrl(input: string): ParsedPrUrl {
  const trimmed = input.trim();
  
  // Pattern 1: https://github.com/owner/repo/pull/123 (with optional query/hash/trailing slash)
  const fullUrlMatch = trimmed.match(
    /^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/(?:pull|pulls)\/(\d+)(?:[/?#].*)?$/i
  );
  if (fullUrlMatch) {
    return {
      owner: fullUrlMatch[1],
      repo: fullUrlMatch[2],
      pullNumber: parseInt(fullUrlMatch[3], 10),
    };
  }

  // Pattern 2: owner/repo#123
  const shortHashMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)#(\d+)$/);
  if (shortHashMatch) {
    return {
      owner: shortHashMatch[1],
      repo: shortHashMatch[2],
      pullNumber: parseInt(shortHashMatch[3], 10),
    };
  }

  // Pattern 3: owner/repo/pull/123
  const pathMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/(?:pull|pulls)\/(\d+)$/i);
  if (pathMatch) {
    return {
      owner: pathMatch[1],
      repo: pathMatch[2],
      pullNumber: parseInt(pathMatch[3], 10),
    };
  }

  throw new Error(
    `Invalid GitHub Pull Request URL or format: "${input}". Expected format like: https://github.com/facebook/react/pull/12345 or owner/repo#123`
  );
}

export function getOctokitClient(userToken?: string): Octokit {
  const auth = userToken || config.github.token || undefined;
  return new Octokit({
    auth,
    userAgent: 'CodeSense-AI/1.0.0',
  });
}

const SUPPORTED_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);

export function isSupportedLanguageFile(filename: string): { isSupported: boolean; language: string; skipReason?: string } {
  const lower = filename.toLowerCase();
  
  // Skip lockfiles, minified files, test snapshots, and binaries
  if (lower.endsWith('.min.js') || lower.endsWith('.min.css')) {
    return { isSupported: false, language: 'unknown', skipReason: 'Minified file skipped' };
  }
  if (lower.endsWith('package-lock.json') || lower.endsWith('pnpm-lock.yaml') || lower.endsWith('yarn.lock')) {
    return { isSupported: false, language: 'lockfile', skipReason: 'Package lockfile skipped' };
  }

  const dotIdx = lower.lastIndexOf('.');
  if (dotIdx === -1) {
    return { isSupported: false, language: 'unknown', skipReason: 'File has no extension' };
  }

  const ext = lower.substring(dotIdx);
  if (SUPPORTED_EXTENSIONS.has(ext)) {
    const language = ext.includes('ts') ? 'TypeScript' : 'JavaScript';
    return { isSupported: true, language };
  }

  return {
    isSupported: false,
    language: ext.slice(1).toUpperCase(),
    skipReason: `Unsupported extension (${ext}) in MVP release. Currently supporting JavaScript & TypeScript.`,
  };
}

export async function fetchPullRequestMetadata(
  owner: string,
  repo: string,
  pullNumber: number,
  token?: string
): Promise<PullRequestMetadata> {
  const octokit = getOctokitClient(token);

  try {
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    return {
      owner,
      repo,
      pullNumber,
      title: pr.title || 'Untitled Pull Request',
      body: pr.body || '',
      author: pr.user?.login || 'unknown',
      authorAvatarUrl: pr.user?.avatar_url || '',
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      headSha: pr.head.sha,
      baseSha: pr.base.sha,
      changedFilesCount: pr.changed_files || 0,
      additions: pr.additions || 0,
      deletions: pr.deletions || 0,
      htmlUrl: pr.html_url,
      state: pr.merged ? 'merged' : (pr.state as 'open' | 'closed'),
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
    };
  } catch (err: any) {
    if (err.status === 404) {
      throw new Error(`Pull request ${owner}/${repo}#${pullNumber} not found or repository is private.`);
    }
    if (err.status === 403 && err.message?.includes('API rate limit')) {
      throw new Error(
        'GitHub API rate limit exceeded for unauthenticated requests. Please provide a GITHUB_TOKEN or authenticate via GitHub OAuth.'
      );
    }
    throw new Error(`GitHub API error: ${err.message || 'Failed to fetch pull request metadata'}`);
  }
}

export async function fetchPullRequestFiles(
  owner: string,
  repo: string,
  pullNumber: number,
  token?: string
): Promise<ChangedFile[]> {
  const octokit = getOctokitClient(token);
  const files: ChangedFile[] = [];
  let page = 1;
  const perPage = 50;

  try {
    while (true) {
      const { data: fileBatch } = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: perPage,
        page,
      });

      if (!fileBatch || fileBatch.length === 0) break;

      for (const item of fileBatch) {
        const { isSupported, language, skipReason } = isSupportedLanguageFile(item.filename);
        files.push({
          filename: item.filename,
          status: item.status as any,
          additions: item.additions,
          deletions: item.deletions,
          changes: item.changes,
          patch: item.patch || undefined,
          rawUrl: item.raw_url,
          language,
          isSupported,
          skipReason,
        });

        if (files.length >= config.limits.maxFilesPerPr) {
          break;
        }
      }

      if (fileBatch.length < perPage || files.length >= config.limits.maxFilesPerPr) {
        break;
      }
      page++;
    }

    return files;
  } catch (err: any) {
    if (err.status === 404) {
      throw new Error(`Could not fetch files for ${owner}/${repo}#${pullNumber}: Repository or PR not found.`);
    }
    if (err.status === 403 && err.message?.includes('API rate limit')) {
      throw new Error(
        'GitHub API rate limit exceeded while retrieving pull request files. Please add a GITHUB_TOKEN or authenticate.'
      );
    }
    throw new Error(`Failed to list pull request files: ${err.message}`);
  }
}

export async function fetchFileContentAtRef(
  owner: string,
  repo: string,
  filePath: string,
  ref: string,
  token?: string
): Promise<string | null> {
  const octokit = getOctokitClient(token);
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref,
    });

    if ('content' in data && data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch {
    return null;
  }
}
