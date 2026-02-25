import type { AgentTask } from './types.js';
import type { ReviewContext } from '../config.js';
import type { PRDiff } from '../github/diff.js';
import { formatDiffForReview } from '../github/diff.js';
import { AgentPool } from './agent-pool.js';

const TEST_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
];

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'];

function buildTesterPrompt(context: ReviewContext, diff: PRDiff, sourceFiles: string[], testFiles: string[]): string {
  const parts = [
    `## Pull Request: ${context.prTitle}`,
    `**Author:** ${context.prAuthor}`,
    '',
    '## Your Task',
    'Analyze the changed source files and identify test coverage gaps.',
    '',
    `**Source files changed (${sourceFiles.length}):**`,
    ...sourceFiles.map((f) => `- \`${f}\``),
    '',
    `**Test files changed (${testFiles.length}):**`,
    ...testFiles.map((f) => `- \`${f}\``),
    '',
  ];

  if (testFiles.length === 0 && sourceFiles.length > 0) {
    parts.push(
      '**WARNING:** Source files were changed but NO test files were modified.',
      'Identify the critical code paths that need tests.',
      '',
    );
  }

  parts.push(
    'For each test gap, provide:',
    '- Which file/function needs testing',
    '- What kind of test (unit, integration, edge case)',
    '- A concrete test code suggestion in suggestedFix',
    '',
    'If you think the developer agent should refactor code to make it more testable, add a suggestion.',
    '',
    '## Diff',
    formatDiffForReview(diff),
  );

  return parts.join('\n');
}

/** Create tester agent task */
export function createTesterTask(
  pool: AgentPool,
  context: ReviewContext,
  diff: PRDiff,
): AgentTask {
  const sourceFiles = diff.files
    .filter((f) => SOURCE_EXTENSIONS.some((ext) => f.filename.endsWith(ext)))
    .filter((f) => !TEST_PATTERNS.some((p) => p.test(f.filename)))
    .map((f) => f.filename);

  const testFiles = diff.files
    .filter((f) => TEST_PATTERNS.some((p) => p.test(f.filename)))
    .map((f) => f.filename);

  return pool.createTask({
    role: 'tester',
    priority: sourceFiles.length > 0 && testFiles.length === 0 ? 'high' : 'normal',
    description: `Test analysis for PR #${context.pullNumber}`,
    prompt: buildTesterPrompt(context, diff, sourceFiles, testFiles),
    context: { model: context.config.review.model, sourceFiles, testFiles },
    dependsOn: [],
    timeoutMs: 120_000,
  });
}
