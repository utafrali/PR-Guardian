import { Context } from 'probot';
import type { ReviewContext, ReviewResult } from '../config.js';
import { loadConfig } from '../utils/config-loader.js';
import { fetchPRDiff } from '../github/diff.js';
import { upsertComment, postReviewComments } from '../github/comments.js';
import { addLabels } from '../github/labels.js';
import { createCheckRun } from '../github/checks.js';
import { runAIReview } from '../reviewers/ai-review.js';
import { runTemplateCheck } from '../reviewers/template-check.js';
import { runTestCoverageCheck } from '../reviewers/test-coverage.js';
import { runAutoLabel } from '../reviewers/auto-label.js';
import { runWelcome } from '../reviewers/welcome.js';
import { Orchestrator } from '../agents/orchestrator.js';
import { logger } from '../utils/logger.js';

export async function handlePullRequest(context: Context<'pull_request'>): Promise<void> {
  const { owner, repo } = context.repo();
  const pr = context.payload.pull_request;
  const pullNumber = pr.number;

  try {
    logger.info(
      { owner, repo, pullNumber, action: context.payload.action },
      'Processing pull request',
    );

    const config = await loadConfig(context);

    const reviewContext: ReviewContext = {
      owner,
      repo,
      pullNumber,
      prTitle: pr.title,
      prBody: pr.body || '',
      prAuthor: pr.user?.login ?? 'unknown',
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      config,
    };

    const diff = await fetchPRDiff(context, config.review.ignore);

    // ── Choose review strategy (wrapped so other reviewers still run on failure) ──
    let aiResult: ReviewResult;

    try {
      if (config.review.mode === 'multi-agent') {
        logger.info({ mode: 'multi-agent', maxAgents: config.review.max_agents }, 'Using multi-agent orchestrator');
        const orchestrator = new Orchestrator({
          maxConcurrent: config.review.max_agents,
          enableDeveloperAgent: true,
          crossValidate: true,
        });
        aiResult = await orchestrator.review(reviewContext, diff);
      } else {
        logger.info({ mode: 'single' }, 'Using single-agent review');
        aiResult = await runAIReview(reviewContext, diff);
      }
    } catch (aiError) {
      logger.error({ error: aiError }, 'AI review failed, continuing with other reviewers');
      aiResult = {
        reviewer: 'AI Review',
        summary: 'AI review failed due to an internal error.',
        comments: [],
        status: 'neutral',
      };
    }

    // ── Run non-AI reviewers in parallel ──
    const otherReviewers = await Promise.allSettled([
      runTemplateCheck(context, reviewContext),
      runTestCoverageCheck(reviewContext, diff),
      runAutoLabel(reviewContext, diff),
      runWelcome(context, reviewContext),
    ]);

    const results: ReviewResult[] = [aiResult];

    for (const result of otherReviewers) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        logger.error({ error: result.reason }, 'Reviewer failed');
      }
    }

    // Post AI review inline comments
    if (aiResult.comments.length > 0) {
      await postReviewComments(
        context,
        owner,
        repo,
        pullNumber,
        pr.head.sha,
        aiResult.comments,
      );
    }

    // Post summary comments (parallelized, fault-tolerant)
    const commentPromises = results
      .filter((r) => r.summary && r.reviewer !== 'Welcome' && r.status !== 'neutral')
      .map((result) =>
        upsertComment(context, {
          owner,
          repo,
          pullNumber,
          section: result.reviewer.toLowerCase().replace(/\s+/g, '-'),
          body: result.summary,
        }).catch((err) => logger.error({ error: err, reviewer: result.reviewer }, 'Failed to post comment')),
      );
    await Promise.allSettled(commentPromises);

    // Post welcome message
    const welcomeResult = results.find((r) => r.reviewer === 'Welcome');
    if (welcomeResult && welcomeResult.summary !== 'Returning contributor' && welcomeResult.summary !== 'Disabled') {
      await upsertComment(context, {
        owner,
        repo,
        pullNumber,
        section: 'welcome',
        body: welcomeResult.summary,
      }).catch((err) => logger.error({ error: err }, 'Failed to post welcome comment'));
    }

    // Apply labels
    const allLabels = results.flatMap((r) => r.labels || []);
    if (allLabels.length > 0) {
      await addLabels(context, owner, repo, pullNumber, allLabels)
        .catch((err) => logger.error({ error: err }, 'Failed to add labels'));
    }

    // Create check run (non-blocking — missing permission shouldn't crash review)
    await createCheckRun(context, owner, repo, pr.head.sha, results)
      .catch((err) => logger.error({ error: err }, 'Failed to create check run'));

    logger.info(
      { pullNumber, resultsCount: results.length, mode: config.review.mode },
      'Pull request review complete',
    );
  } catch (error) {
    logger.error({ error, owner, repo, pullNumber }, 'Pull request review failed');
    // Post a visible error comment so the PR author knows something went wrong
    try {
      await upsertComment(context, {
        owner,
        repo,
        pullNumber,
        section: 'error',
        body: `## :x: PR Guardian Error\n\nAn unexpected error occurred while reviewing this PR. Please check the app logs.\n\n<details><summary>Error</summary>\n\n\`\`\`\n${error instanceof Error ? error.message : String(error)}\n\`\`\`\n</details>`,
      });
    } catch (commentError) {
      logger.error({ commentError }, 'Failed to post error comment');
    }
  }
}
