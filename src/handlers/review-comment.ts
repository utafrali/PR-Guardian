import { Context } from 'probot';
import { logger } from '../utils/logger.js';

export async function handleReviewComment(
  context: Context<'pull_request_review_comment'>,
): Promise<void> {
  const comment = context.payload.comment;
  const action = context.payload.action;

  logger.debug(
    {
      action,
      commentId: comment.id,
      author: comment.user.login,
    },
    'Review comment event received',
  );

  // Future: Handle reply interactions with PR Guardian comments
  // e.g., "@pr-guardian explain" to get a deeper explanation
  // e.g., "@pr-guardian ignore" to suppress a specific warning
}
