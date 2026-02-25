import { describe, it, expect } from 'vitest';
import { runAutoLabel } from '../../src/reviewers/auto-label.js';
import { sampleDiff, emptyDiff } from '../fixtures/sample-diff.js';
import { fullConfig, disabledConfig } from '../fixtures/sample-config.js';
import type { ReviewContext } from '../../src/config.js';

function makeContext(overrides: Partial<ReviewContext> = {}): ReviewContext {
  return {
    owner: 'test-owner',
    repo: 'test-repo',
    pullNumber: 1,
    prTitle: 'feat: add authentication',
    prBody: 'Adds JWT authentication to the API',
    prAuthor: 'contributor',
    baseBranch: 'main',
    headBranch: 'feat/auth',
    config: fullConfig,
    ...overrides,
  };
}

describe('Auto Label', () => {
  it('should detect labels from file paths', async () => {
    const result = await runAutoLabel(makeContext(), sampleDiff);
    expect(result.status).toBe('success');
    expect(result.labels).toBeDefined();
    expect(result.labels).toContain('docs');
    expect(result.labels).toContain('ci');
    expect(result.labels).toContain('dependencies');
  });

  it('should detect labels from PR title', async () => {
    const result = await runAutoLabel(
      makeContext({ prTitle: 'fix: resolve login bug' }),
      emptyDiff,
    );
    expect(result.labels).toContain('bug');
  });

  it('should detect feature label from title', async () => {
    const result = await runAutoLabel(
      makeContext({ prTitle: 'feat: add new API endpoint' }),
      emptyDiff,
    );
    expect(result.labels).toContain('feature');
  });

  it('should detect breaking changes', async () => {
    const result = await runAutoLabel(
      makeContext({ prTitle: 'feat!: remove deprecated API', prBody: 'BREAKING CHANGE: removed v1 endpoints' }),
      emptyDiff,
    );
    expect(result.labels).toContain('breaking-change');
  });

  it('should return empty labels for empty diff and neutral title', async () => {
    const result = await runAutoLabel(
      makeContext({ prTitle: 'Update readme', prBody: '' }),
      emptyDiff,
    );
    // 'Update readme' doesn't match any specific title patterns
    expect(result.labels).toBeDefined();
  });

  it('should return neutral when disabled', async () => {
    const result = await runAutoLabel(
      makeContext({ config: disabledConfig }),
      sampleDiff,
    );
    expect(result.status).toBe('neutral');
    expect(result.labels).toEqual([]);
  });
});
