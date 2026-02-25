import { Context } from 'probot';
import type { ReviewContext, ReviewResult } from '../config.js';
import { logger } from '../utils/logger.js';

async function isFirstTimeContributor(
  context: Context<'pull_request'>,
  owner: string,
  repo: string,
  author: string,
): Promise<boolean> {
  try {
    // Use search API to filter by author server-side (more reliable than per_page:2)
    const { data } = await context.octokit.search.issuesAndPullRequests({
      q: `repo:${owner}/${repo} type:pr author:${author}`,
      per_page: 2,
    });

    const otherPRs = data.items.filter(
      (item) => item.number !== context.payload.pull_request.number,
    );

    return otherPRs.length === 0;
  } catch (error) {
    logger.warn({ error }, 'Failed to check contributor history');
    return false;
  }
}

export async function runWelcome(
  probotContext: Context<'pull_request'>,
  reviewContext: ReviewContext,
): Promise<ReviewResult> {
  if (!reviewContext.config.welcome.enabled) {
    return { reviewer: 'Welcome', summary: 'Disabled', comments: [], status: 'neutral' };
  }

  const { owner, repo, prAuthor } = reviewContext;
  const isFirstTime = await isFirstTimeContributor(probotContext, owner, repo, prAuthor);

  if (!isFirstTime) {
    return {
      reviewer: 'Welcome',
      summary: 'Returning contributor',
      comments: [],
      status: 'success',
    };
  }

  const welcomeMessage = [
    `## :wave: Welcome, @${prAuthor}!`,
    '',
    reviewContext.config.welcome.message,
    '',
    'Here are some helpful links:',
    '- [Contributing Guidelines](CONTRIBUTING.md)',
    '- [Code of Conduct](CODE_OF_CONDUCT.md)',
    '',
    "Thank you for your first contribution! A maintainer will review your PR shortly.",
  ].join('\n');

  return {
    reviewer: 'Welcome',
    summary: welcomeMessage,
    comments: [],
    status: 'success',
  };
}
