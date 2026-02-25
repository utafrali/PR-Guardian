import { Context } from 'probot';
import type { ReviewResult } from '../config.js';
import { logger } from '../utils/logger.js';

export async function createCheckRun(
  context: Context<'pull_request'>,
  owner: string,
  repo: string,
  headSha: string,
  results: ReviewResult[],
): Promise<void> {
  const hasFailure = results.some((r) => r.status === 'failure');
  const conclusion = hasFailure ? 'failure' : 'success';

  const summaryParts = results.map((r) => {
    const icon = r.status === 'success' ? ':white_check_mark:' : r.status === 'failure' ? ':x:' : ':heavy_minus_sign:';
    return `${icon} **${r.reviewer}**: ${r.summary}`;
  });

  const totalComments = results.reduce((sum, r) => sum + r.comments.length, 0);

  const summary = [
    '## PR Guardian Review Summary',
    '',
    ...summaryParts,
    '',
    `**Total issues found:** ${totalComments}`,
  ].join('\n');

  // Truncate summary to stay within GitHub API limits (65535 chars)
  const MAX_SUMMARY_LENGTH = 65000;
  const finalSummary = summary.length > MAX_SUMMARY_LENGTH
    ? summary.slice(0, MAX_SUMMARY_LENGTH) + '\n\n... (truncated)'
    : summary;

  try {
    await context.octokit.checks.create({
      owner,
      repo,
      name: 'PR Guardian',
      head_sha: headSha,
      status: 'completed',
      conclusion,
      output: {
        title: hasFailure ? 'Issues found' : 'All checks passed',
        summary: finalSummary,
      },
    });
    logger.info({ conclusion, totalComments }, 'Created check run');
  } catch (error) {
    logger.error({ error, conclusion }, 'Failed to create check run. Ensure the app has checks:write permission.');
  }
}
