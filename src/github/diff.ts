import { Context } from 'probot';
import { minimatch } from 'minimatch';
import { logger } from '../utils/logger.js';

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

export interface FileDiff {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed';
  additions: number;
  deletions: number;
  patch?: string;
  hunks: DiffHunk[];
}

export interface PRDiff {
  files: FileDiff[];
  totalAdditions: number;
  totalDeletions: number;
}

/** Safely normalize file status from GitHub API */
export function normalizeFileStatus(status: string): FileDiff['status'] {
  switch (status) {
    case 'added':
    case 'modified':
    case 'removed':
    case 'renamed':
    case 'copied':
    case 'changed':
      return status;
    default:
      return 'modified';
  }
}

export function parseHunks(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const hunkHeaderRegex = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/;
  const lines = patch.split('\n');

  let currentHunk: DiffHunk | null = null;

  for (const line of lines) {
    const match = hunkHeaderRegex.exec(line);
    if (match) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = {
        oldStart: parseInt(match[1], 10),
        oldLines: parseInt(match[2] || '1', 10),
        newStart: parseInt(match[3], 10),
        newLines: parseInt(match[4] || '1', 10),
        content: line + '\n',
      };
    } else if (currentHunk) {
      currentHunk.content += line + '\n';
    }
  }

  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}

export async function fetchPRDiff(
  context: Context<'pull_request'>,
  ignorePatterns: string[] = [],
): Promise<PRDiff> {
  const { owner, repo } = context.repo();
  const pullNumber = context.payload.pull_request.number;

  // Use pagination to handle PRs with 100+ files
  const allFiles = await context.octokit.paginate(
    context.octokit.pulls.listFiles,
    {
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    },
  );

  let totalAdditions = 0;
  let totalDeletions = 0;
  const files: FileDiff[] = [];

  for (const file of allFiles) {
    const shouldIgnore = ignorePatterns.some((pattern) => minimatch(file.filename, pattern));
    if (shouldIgnore) {
      logger.debug({ filename: file.filename }, 'Ignoring file per config');
      continue;
    }

    const fileDiff: FileDiff = {
      filename: file.filename,
      status: normalizeFileStatus(file.status ?? 'modified'),
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch,
      hunks: file.patch ? parseHunks(file.patch) : [],
    };

    files.push(fileDiff);
    totalAdditions += file.additions;
    totalDeletions += file.deletions;
  }

  logger.info(
    { fileCount: files.length, totalAdditions, totalDeletions },
    'Fetched PR diff',
  );

  return { files, totalAdditions, totalDeletions };
}

const MAX_FORMAT_CHARS = 100_000;

export function formatDiffForReview(diff: PRDiff): string {
  const parts: string[] = [];
  let charCount = 0;

  for (const file of diff.files) {
    const header = `## ${file.filename} (${file.status})\n+${file.additions} -${file.deletions}\n`;
    charCount += header.length;
    if (charCount > MAX_FORMAT_CHARS) {
      parts.push(`\n... (${diff.files.length - parts.length} more files truncated)`);
      break;
    }
    parts.push(header);
    if (file.patch) {
      const patchBlock = '```diff\n' + file.patch + '\n```\n';
      charCount += patchBlock.length;
      if (charCount > MAX_FORMAT_CHARS) {
        parts.push('(patch truncated)\n');
        break;
      }
      parts.push(patchBlock);
    }
    parts.push('');
  }

  return parts.join('\n');
}
