import type { ReviewContext, ReviewResult } from '../config.js';
import type { PRDiff } from '../github/diff.js';

const TEST_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
  /\.stories\.[jt]sx?$/,
  /test\//,
  /tests\//,
];

const SOURCE_FILE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx',
  '.py', '.rb', '.go', '.rs',
  '.java', '.kt', '.swift',
  '.c', '.cpp', '.h',
];

function isTestFile(filename: string): boolean {
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(filename));
}

function isSourceFile(filename: string): boolean {
  return SOURCE_FILE_EXTENSIONS.some((ext) => filename.endsWith(ext)) && !isTestFile(filename);
}

export async function runTestCoverageCheck(
  context: ReviewContext,
  diff: PRDiff,
): Promise<ReviewResult> {
  if (!context.config.tests.enabled) {
    return { reviewer: 'Test Coverage', summary: 'Disabled', comments: [], status: 'neutral' };
  }

  const sourceFiles = diff.files.filter((f) => isSourceFile(f.filename));
  const testFiles = diff.files.filter((f) => isTestFile(f.filename));

  if (sourceFiles.length === 0) {
    return {
      reviewer: 'Test Coverage',
      summary: 'No source files changed',
      comments: [],
      status: 'success',
    };
  }

  const hasTestChanges = testFiles.length > 0;

  const summaryParts = [
    '## Test Coverage Check',
    '',
    `**Source files changed:** ${sourceFiles.length}`,
    ...sourceFiles.map((f) => `  - \`${f.filename}\``),
    '',
    `**Test files changed:** ${testFiles.length}`,
    ...testFiles.map((f) => `  - \`${f.filename}\``),
  ];

  if (!hasTestChanges && context.config.tests.warn_no_tests) {
    summaryParts.push(
      '',
      ':warning: **This PR modifies source code but includes no test changes.** Consider adding tests for the modified code.',
    );

    return {
      reviewer: 'Test Coverage',
      summary: summaryParts.join('\n'),
      comments: [],
      status: 'neutral',
    };
  }

  summaryParts.push('', ':white_check_mark: Test files are included in this PR.');

  return {
    reviewer: 'Test Coverage',
    summary: summaryParts.join('\n'),
    comments: [],
    status: 'success',
  };
}
