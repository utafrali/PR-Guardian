import { Probot } from 'probot';
import { handlePullRequest } from './handlers/pull-request.js';
import { handleInstallation } from './handlers/installation.js';
import { handleReviewComment } from './handlers/review-comment.js';
import { logger } from './utils/logger.js';

export default (app: Probot): void => {
  logger.info('PR Guardian is starting up');

  app.on(
    ['pull_request.opened', 'pull_request.synchronize', 'pull_request.reopened'],
    handlePullRequest,
  );

  app.on(
    ['installation.created', 'installation.deleted'],
    handleInstallation,
  );

  app.on('pull_request_review_comment.created', handleReviewComment);

  logger.info('PR Guardian is ready');
};
