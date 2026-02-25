import { Context } from 'probot';
import { logger } from '../utils/logger.js';

export async function handleInstallation(
  context: Context<'installation'>,
): Promise<void> {
  const action = context.payload.action;
  const installation = context.payload.installation;
  const sender = context.payload.sender;

  logger.info(
    {
      action,
      installationId: installation.id,
      account: installation.account.login,
      sender: sender.login,
      repositorySelection: installation.repository_selection,
    },
    `App ${action}`,
  );
}
