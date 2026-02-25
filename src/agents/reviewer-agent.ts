import type { AgentTask, TaskPriority } from './types.js';
import type { ReviewContext } from '../config.js';
import type { PRDiff } from '../github/diff.js';
import { formatDiffForReview } from '../github/diff.js';
import { AgentPool } from './agent-pool.js';

function buildReviewPrompt(context: ReviewContext, diff: PRDiff): string {
  const parts = [
    `## Pull Request: ${context.prTitle}`,
    `**Author:** ${context.prAuthor}`,
    `**Branch:** ${context.headBranch} → ${context.baseBranch}`,
    '',
  ];

  if (context.prBody) {
    parts.push('## PR Description', context.prBody, '');
  }

  const focus = context.config.review.focus;
  if (focus.length > 0) {
    parts.push(`## Focus Areas: ${focus.join(', ')}`, '');
  }

  parts.push(
    '## Your Task',
    'Review every file in this diff. For each issue found, include it in the findings array.',
    'If you think the tester agent should write tests for specific code, add a suggestion.',
    'If you think the developer agent should refactor something, add a suggestion.',
    '',
    '## Diff',
    formatDiffForReview(diff),
  );

  return parts.join('\n');
}

/** Determine priority based on diff size and file types */
function determinePriority(diff: PRDiff): TaskPriority {
  const hasSecurityFiles = diff.files.some((f) =>
    /auth|secret|token|password|credential|crypto|security/i.test(f.filename),
  );
  if (hasSecurityFiles) return 'critical';
  if (diff.totalAdditions > 500) return 'high';
  return 'normal';
}

/** Create reviewer agent task(s). May split into multiple tasks for large PRs. */
export function createReviewerTasks(
  pool: AgentPool,
  context: ReviewContext,
  diff: PRDiff,
): AgentTask[] {
  const MAX_FILES_PER_TASK = 15;
  const tasks: AgentTask[] = [];

  if (diff.files.length <= MAX_FILES_PER_TASK) {
    // Single reviewer for small PRs
    tasks.push(
      pool.createTask({
        role: 'reviewer',
        priority: determinePriority(diff),
        description: `Review PR #${context.pullNumber}: ${context.prTitle}`,
        prompt: buildReviewPrompt(context, diff),
        context: { model: context.config.review.model },
        dependsOn: [],
        timeoutMs: 120_000,
      }),
    );
  } else {
    // Split into chunks for large PRs — multiple reviewer agents in parallel
    for (let i = 0; i < diff.files.length; i += MAX_FILES_PER_TASK) {
      const chunk = diff.files.slice(i, i + MAX_FILES_PER_TASK);
      const chunkDiff: PRDiff = {
        files: chunk,
        totalAdditions: chunk.reduce((s, f) => s + f.additions, 0),
        totalDeletions: chunk.reduce((s, f) => s + f.deletions, 0),
      };
      const chunkIndex = Math.floor(i / MAX_FILES_PER_TASK) + 1;
      const totalChunks = Math.ceil(diff.files.length / MAX_FILES_PER_TASK);

      tasks.push(
        pool.createTask({
          role: 'reviewer',
          priority: determinePriority(chunkDiff),
          description: `Review PR #${context.pullNumber} chunk ${chunkIndex}/${totalChunks}`,
          prompt: buildReviewPrompt(context, chunkDiff),
          context: { model: context.config.review.model, chunk: chunkIndex, totalChunks },
          dependsOn: [],
          timeoutMs: 120_000,
        }),
      );
    }
  }

  return tasks;
}
