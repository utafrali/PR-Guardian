import { Context } from 'probot';
import { ZodError } from 'zod';
import { parse } from 'yaml';
import { prGuardianConfigSchema, DEFAULT_CONFIG, type PRGuardianConfig } from '../config.js';
import { logger } from './logger.js';

const CONFIG_FILENAME = '.pr-guardian.yml';

/**
 * Load config from the BASE branch (not head) to prevent PR authors
 * from weakening their own review by modifying .pr-guardian.yml.
 */
export async function loadConfig(context: Context<'pull_request'>): Promise<PRGuardianConfig> {
  const { owner, repo } = context.repo();

  try {
    // SECURITY: Load from base branch, not PR head — prevents PR authors
    // from disabling checks by modifying the config in their PR.
    const ref = context.payload.pull_request.base.ref;

    const response = await context.octokit.repos.getContent({
      owner,
      repo,
      path: CONFIG_FILENAME,
      ref,
    });

    if ('content' in response.data && response.data.type === 'file') {
      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      const rawConfig = parse(content);

      try {
        const config = prGuardianConfigSchema.parse(rawConfig || {});
        logger.info({ owner, repo }, 'Loaded .pr-guardian.yml config');
        return config;
      } catch (validationError) {
        if (validationError instanceof ZodError) {
          logger.warn(
            { issues: validationError.issues.map((i) => i.message) },
            'Invalid .pr-guardian.yml config, using defaults',
          );
          return DEFAULT_CONFIG;
        }
        throw validationError;
      }
    }
  } catch (error: unknown) {
    // Distinguish 404 (no config file) from real errors
    const isNotFound =
      error instanceof Error && 'status' in error && (error as { status: number }).status === 404;

    if (isNotFound) {
      logger.info({ owner, repo }, 'No .pr-guardian.yml found, using defaults');
    } else if (error instanceof ZodError) {
      // Already handled above, but guard against re-throw
      return DEFAULT_CONFIG;
    } else {
      logger.error({ owner, repo, error }, 'Failed to load .pr-guardian.yml');
      throw error; // Re-throw network/auth/rate-limit errors
    }
  }

  return DEFAULT_CONFIG;
}
