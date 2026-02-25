import type { AgentTask, AgentFinding } from './types.js';
import type { ReviewContext } from '../config.js';
import type { PRDiff } from '../github/diff.js';
import { formatDiffForReview } from '../github/diff.js';
import { AgentPool } from './agent-pool.js';

function buildDeveloperPrompt(
  context: ReviewContext,
  diff: PRDiff,
  reviewerFindings: AgentFinding[],
  testerFindings: AgentFinding[],
): string {
  const parts = [
    `## Pull Request: ${context.prTitle}`,
    `**Author:** ${context.prAuthor}`,
    '',
    '## Your Task',
    'Based on findings from the reviewer and tester agents, provide concrete improvement suggestions.',
    'Focus on actionable code changes — not vague advice.',
    '',
  ];

  if (reviewerFindings.length > 0) {
    parts.push('## Reviewer Findings');
    for (const f of reviewerFindings) {
      parts.push(`- **[${f.severity}]** ${f.file || 'general'}:${f.line || ''} — ${f.title}`);
      parts.push(`  ${f.description}`);
    }
    parts.push('');
  }

  if (testerFindings.length > 0) {
    parts.push('## Tester Findings');
    for (const f of testerFindings) {
      parts.push(`- **[${f.severity}]** ${f.file || 'general'}:${f.line || ''} — ${f.title}`);
      parts.push(`  ${f.description}`);
    }
    parts.push('');
  }

  parts.push(
    'For each improvement:',
    '- Provide the exact file and line',
    '- Include complete, copy-pasteable code in suggestedFix',
    '- Explain why the change is needed',
    '',
    '## Diff',
    formatDiffForReview(diff),
  );

  return parts.join('\n');
}

/**
 * Create developer agent task.
 * This task depends on reviewer and tester results — it runs AFTER them.
 */
export function createDeveloperTask(
  pool: AgentPool,
  context: ReviewContext,
  diff: PRDiff,
  reviewerFindings: AgentFinding[],
  testerFindings: AgentFinding[],
  dependsOn: string[],
): AgentTask {
  const allFindings = [...reviewerFindings, ...testerFindings];
  const hasCritical = allFindings.some((f) => f.severity === 'critical');

  return pool.createTask({
    role: 'developer',
    priority: hasCritical ? 'critical' : 'normal',
    description: `Development suggestions for PR #${context.pullNumber}`,
    prompt: buildDeveloperPrompt(context, diff, reviewerFindings, testerFindings),
    context: {
      model: context.config.review.model,
      findingsCount: allFindings.length,
    },
    dependsOn,
    timeoutMs: 120_000,
  });
}
