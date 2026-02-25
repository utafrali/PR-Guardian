import { Context } from 'probot';
import { logger } from '../utils/logger.js';

const LABEL_COLORS: Record<string, string> = {
  bug: 'd73a4a',
  feature: '0075ca',
  docs: '0e8a16',
  refactor: 'e4e669',
  test: 'fbca04',
  ci: 'bfdadc',
  dependencies: '0366d6',
  'breaking-change': 'b60205',
};

async function ensureLabelExists(
  context: Context<'pull_request'>,
  owner: string,
  repo: string,
  label: string,
): Promise<void> {
  try {
    await context.octokit.issues.getLabel({ owner, repo, name: label });
  } catch (error: unknown) {
    const isNotFound =
      error instanceof Error && 'status' in error && (error as { status: number }).status === 404;

    if (isNotFound) {
      try {
        const color = LABEL_COLORS[label] || 'ededed';
        await context.octokit.issues.createLabel({
          owner,
          repo,
          name: label,
          color,
        });
        logger.info({ label }, 'Created label');
      } catch (createError) {
        // Label might have been created by another concurrent run
        logger.debug({ label, error: createError }, 'Label creation failed, may already exist');
      }
    } else {
      logger.error({ label, error }, 'Failed to check label');
    }
  }
}

export async function addLabels(
  context: Context<'pull_request'>,
  owner: string,
  repo: string,
  pullNumber: number,
  labels: string[],
): Promise<void> {
  if (labels.length === 0) return;

  // Ensure labels in parallel
  await Promise.all(
    labels.map((label) => ensureLabelExists(context, owner, repo, label)),
  );

  await context.octokit.issues.addLabels({
    owner,
    repo,
    issue_number: pullNumber,
    labels,
  });

  logger.info({ labels }, 'Added labels to PR');
}
