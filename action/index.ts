import * as core from '@actions/core';
import * as github from '@actions/github';
import { prGuardianConfigSchema, type ReviewContext } from '../src/config.js';
import { runAIReview } from '../src/reviewers/ai-review.js';
import { runAutoLabel } from '../src/reviewers/auto-label.js';
import { runTestCoverageCheck } from '../src/reviewers/test-coverage.js';
import { parseHunks, normalizeFileStatus } from '../src/github/diff.js';
import { logger } from '../src/utils/logger.js';
import { parse } from 'yaml';
import { minimatch } from 'minimatch';
import type { PRDiff } from '../src/github/diff.js';

async function run(): Promise<void> {
  try {
    const anthropicApiKey = core.getInput('anthropic_api_key');
    if (anthropicApiKey) {
      process.env.ANTHROPIC_API_KEY = anthropicApiKey;
    }

    const token = core.getInput('github_token') || process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GitHub token is required');
    }

    const octokit = github.getOctokit(token);
    const context = github.context;

    if (!context.payload.pull_request) {
      core.info('Not a pull request event, skipping');
      return;
    }

    const pr = context.payload.pull_request;
    const owner = context.repo.owner;
    const repo = context.repo.repo;

    // Load config from base branch (SECURITY: prevents PR authors from disabling checks)
    let config = prGuardianConfigSchema.parse({});
    try {
      const configPath = core.getInput('config_path') || '.pr-guardian.yml';
      if (!configPath.endsWith('.yml') && !configPath.endsWith('.yaml')) {
        core.warning(`Config path "${configPath}" does not appear to be a YAML file, using defaults`);
      } else {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: configPath,
          ref: pr.base.ref,
        });
        if ('content' in data && data.type === 'file') {
          const content = Buffer.from(data.content, 'base64').toString('utf-8');
          config = prGuardianConfigSchema.parse(parse(content) || {});
        }
      }
    } catch {
      core.info('No config found, using defaults');
    }

    // Fetch diff
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pr.number,
      per_page: 100,
    });

    const filteredFiles = files.filter((f) => !config.review.ignore.some((p) => minimatch(f.filename, p)));

    const diff: PRDiff = {
      files: filteredFiles.map((f) => ({
          filename: f.filename,
          status: normalizeFileStatus(f.status ?? 'modified'),
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch,
          hunks: f.patch ? parseHunks(f.patch) : [],
        })),
      totalAdditions: filteredFiles.reduce((sum, f) => sum + f.additions, 0),
      totalDeletions: filteredFiles.reduce((sum, f) => sum + f.deletions, 0),
    };

    const reviewContext: ReviewContext = {
      owner,
      repo,
      pullNumber: pr.number,
      prTitle: pr.title,
      prBody: pr.body || '',
      prAuthor: pr.user?.login ?? 'unknown',
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      config,
    };

    // Run reviewers
    const results = await Promise.allSettled([
      runAIReview(reviewContext, diff),
      runTestCoverageCheck(reviewContext, diff),
      runAutoLabel(reviewContext, diff),
    ]);

    // Post results as PR comment
    const summaries: string[] = ['## PR Guardian Review\n'];
    const allLabels: string[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const r = result.value;
        const icon = r.status === 'success' ? ':white_check_mark:' : r.status === 'failure' ? ':x:' : ':heavy_minus_sign:';
        summaries.push(`### ${icon} ${r.reviewer}\n${r.summary}\n`);
        if (r.labels) allLabels.push(...r.labels);

        if (r.comments.length > 0) {
          try {
            await octokit.rest.pulls.createReview({
              owner,
              repo,
              pull_number: pr.number,
              commit_id: pr.head.sha,
              event: 'COMMENT',
              comments: r.comments.map((c) => ({
                path: c.path,
                line: c.line,
                body: c.body,
              })),
            });
          } catch (error) {
            logger.warn({ error }, 'Failed to post inline comments');
          }
        }
      }
    }

    // Post summary comment
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pr.number,
      body: summaries.join('\n'),
    });

    // Apply labels
    if (allLabels.length > 0) {
      for (const label of allLabels) {
        try {
          await octokit.rest.issues.getLabel({ owner, repo, name: label });
        } catch {
          try {
            await octokit.rest.issues.createLabel({ owner, repo, name: label, color: 'ededed' });
          } catch {
            // Label may have been created by concurrent run
          }
        }
      }
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pr.number,
        labels: allLabels,
      });
    }

    // Set output
    const hasCritical = results.some(
      (r) => r.status === 'fulfilled' && r.value.status === 'failure',
    );
    core.setOutput('status', hasCritical ? 'failure' : 'success');

    if (hasCritical) {
      core.setFailed('PR Guardian found critical issues');
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(`Unknown error: ${String(error)}`);
    }
  }
}

run();
