import { Context } from 'probot';
import { logger } from '../utils/logger.js';

const BOT_SIGNATURE = '<!-- pr-guardian-bot -->';

export interface CommentOptions {
  owner: string;
  repo: string;
  pullNumber: number;
  section: string;
  body: string;
}

function makeCommentBody(section: string, body: string): string {
  return `${BOT_SIGNATURE}\n<!-- section:${section} -->\n${body}`;
}

export async function upsertComment(
  context: Context<'pull_request'>,
  options: CommentOptions,
): Promise<void> {
  const { owner, repo, pullNumber, section, body } = options;
  const marker = `<!-- section:${section} -->`;

  const { data: comments } = await context.octokit.issues.listComments({
    owner,
    repo,
    issue_number: pullNumber,
    per_page: 100,
  });

  const existing = comments.find(
    (c) => c.body?.includes(BOT_SIGNATURE) && c.body?.includes(marker),
  );

  const commentBody = makeCommentBody(section, body);

  if (existing) {
    await context.octokit.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body: commentBody,
    });
    logger.info({ section, commentId: existing.id }, 'Updated existing comment');
  } else {
    await context.octokit.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body: commentBody,
    });
    logger.info({ section }, 'Created new comment');
  }
}

export async function postReviewComments(
  context: Context<'pull_request'>,
  owner: string,
  repo: string,
  pullNumber: number,
  commitSha: string,
  comments: Array<{ path: string; line: number; body: string }>,
): Promise<void> {
  if (comments.length === 0) return;

  try {
    await context.octokit.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: commitSha,
      event: 'COMMENT',
      comments: comments.map((c) => ({
        path: c.path,
        line: c.line,
        body: c.body,
      })),
    });
    logger.info({ count: comments.length }, 'Posted inline review comments');
  } catch (error) {
    logger.warn({ error }, 'Failed to post inline comments, falling back to issue comment');
    try {
      const MAX_COMMENT_LENGTH = 65000;
      let body = comments
        .map((c) => `**${c.path}:${c.line}**\n${c.body}`)
        .join('\n\n---\n\n');
      if (body.length > MAX_COMMENT_LENGTH) {
        body = body.slice(0, MAX_COMMENT_LENGTH) + '\n\n... (truncated, too many comments)';
      }
      await upsertComment(context, {
        owner,
        repo,
        pullNumber,
        section: 'ai-review-inline',
        body,
      });
    } catch (fallbackError) {
      logger.error({ originalError: error, fallbackError }, 'Both inline and fallback comment posting failed');
    }
  }
}
