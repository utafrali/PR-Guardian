import { describe, it, expect, vi } from 'vitest';
import { AgentPool } from '../../src/agents/agent-pool.js';
import { createReviewerTasks } from '../../src/agents/reviewer-agent.js';
import { createTesterTask } from '../../src/agents/tester-agent.js';
import { createDeveloperTask } from '../../src/agents/developer-agent.js';
import { sampleDiff, emptyDiff, sourceOnlyDiff } from '../fixtures/sample-diff.js';
import { fullConfig } from '../fixtures/sample-config.js';
import type { ReviewContext } from '../../src/config.js';
import type { PRDiff } from '../../src/github/diff.js';

vi.mock('../../src/utils/ai-client.js', () => ({
  createReview: vi.fn().mockResolvedValue({
    content: '{}',
    model: 'claude-sonnet',
    inputTokens: 50,
    outputTokens: 30,
  }),
  resolveModel: vi.fn((m: string) => m),
  resetClient: vi.fn(),
}));

function makeContext(): ReviewContext {
  return {
    owner: 'test-owner',
    repo: 'test-repo',
    pullNumber: 1,
    prTitle: 'feat: add authentication',
    prBody: 'Adds JWT authentication',
    prAuthor: 'contributor',
    baseBranch: 'main',
    headBranch: 'feat/auth',
    config: fullConfig,
  };
}

describe('Reviewer Agent', () => {
  it('should create a single task for small PRs', () => {
    const pool = new AgentPool({ provider: 'claude-code', maxConcurrent: 3 });
    const tasks = createReviewerTasks(pool, makeContext(), sampleDiff);

    expect(tasks.length).toBe(1);
    expect(tasks[0].role).toBe('reviewer');
    expect(tasks[0].dependsOn).toEqual([]);
  });

  it('should create a task even for empty diffs', () => {
    const pool = new AgentPool({ provider: 'claude-code', maxConcurrent: 3 });
    const tasks = createReviewerTasks(pool, makeContext(), emptyDiff);

    expect(tasks.length).toBe(1);
  });

  it('should split large PRs into multiple reviewer tasks', () => {
    const pool = new AgentPool({ provider: 'claude-code', maxConcurrent: 3 });
    // Create a diff with 20 files
    const largeDiff: PRDiff = {
      files: Array.from({ length: 20 }, (_, i) => ({
        filename: `src/file${i}.ts`,
        status: 'modified' as const,
        additions: 10,
        deletions: 2,
        patch: '@@ -1,5 +1,13 @@\n code',
        hunks: [],
      })),
      totalAdditions: 200,
      totalDeletions: 40,
    };

    const tasks = createReviewerTasks(pool, makeContext(), largeDiff);
    expect(tasks.length).toBe(2); // 20 files / 15 per chunk = 2 tasks
    expect(tasks.every((t) => t.role === 'reviewer')).toBe(true);
  });

  it('should set critical priority for security-related files', () => {
    const pool = new AgentPool({ provider: 'claude-code', maxConcurrent: 3 });
    const securityDiff: PRDiff = {
      files: [
        { filename: 'src/auth/credentials.ts', status: 'modified', additions: 5, deletions: 2, hunks: [] },
      ],
      totalAdditions: 5,
      totalDeletions: 2,
    };

    const tasks = createReviewerTasks(pool, makeContext(), securityDiff);
    expect(tasks[0].priority).toBe('critical');
  });
});

describe('Tester Agent', () => {
  it('should create a tester task', () => {
    const pool = new AgentPool({ provider: 'claude-code', maxConcurrent: 3 });
    const task = createTesterTask(pool, makeContext(), sampleDiff);

    expect(task.role).toBe('tester');
    expect(task.dependsOn).toEqual([]);
  });

  it('should set high priority when source files change without tests', () => {
    const pool = new AgentPool({ provider: 'claude-code', maxConcurrent: 3 });
    const task = createTesterTask(pool, makeContext(), sourceOnlyDiff);

    expect(task.priority).toBe('high');
  });
});

describe('Developer Agent', () => {
  it('should create a developer task with dependencies', () => {
    const pool = new AgentPool({ provider: 'claude-code', maxConcurrent: 3 });
    const reviewerFindings = [
      { type: 'bug' as const, severity: 'warning' as const, file: 'a.ts', line: 1, title: 'Bug', description: 'Fix it' },
    ];

    const task = createDeveloperTask(
      pool,
      makeContext(),
      sampleDiff,
      reviewerFindings,
      [],
      ['dep-1', 'dep-2'],
    );

    expect(task.role).toBe('developer');
    expect(task.dependsOn).toEqual(['dep-1', 'dep-2']);
  });

  it('should set critical priority when critical findings exist', () => {
    const pool = new AgentPool({ provider: 'claude-code', maxConcurrent: 3 });
    const criticalFindings = [
      { type: 'security' as const, severity: 'critical' as const, file: 'a.ts', line: 1, title: 'SQL Injection', description: 'Fix now' },
    ];

    const task = createDeveloperTask(pool, makeContext(), sampleDiff, criticalFindings, [], []);
    expect(task.priority).toBe('critical');
  });
});
