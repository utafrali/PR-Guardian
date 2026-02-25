import { describe, it, expect } from 'vitest';
import { runTestCoverageCheck } from '../../src/reviewers/test-coverage.js';
import { sampleDiff, emptyDiff, testOnlyDiff, sourceOnlyDiff } from '../fixtures/sample-diff.js';
import { fullConfig, disabledConfig } from '../fixtures/sample-config.js';
import type { ReviewContext } from '../../src/config.js';

function makeContext(overrides: Partial<ReviewContext> = {}): ReviewContext {
  return {
    owner: 'test-owner',
    repo: 'test-repo',
    pullNumber: 1,
    prTitle: 'feat: add auth',
    prBody: '',
    prAuthor: 'contributor',
    baseBranch: 'main',
    headBranch: 'feat/auth',
    config: fullConfig,
    ...overrides,
  };
}

describe('Test Coverage Check', () => {
  it('should return neutral when disabled', async () => {
    const result = await runTestCoverageCheck(
      makeContext({ config: disabledConfig }),
      sampleDiff,
    );
    expect(result.status).toBe('neutral');
  });

  it('should return success when no source files changed', async () => {
    const result = await runTestCoverageCheck(makeContext(), testOnlyDiff);
    expect(result.status).toBe('success');
    expect(result.summary).toContain('No source files changed');
  });

  it('should warn when source files changed but no tests', async () => {
    const result = await runTestCoverageCheck(makeContext(), sourceOnlyDiff);
    expect(result.status).toBe('neutral');
    expect(result.summary).toContain('no test changes');
  });

  it('should return success when both source and test files changed', async () => {
    const mixedDiff = {
      files: [
        ...sourceOnlyDiff.files,
        ...testOnlyDiff.files,
      ],
      totalAdditions: 40,
      totalDeletions: 2,
    };

    const result = await runTestCoverageCheck(makeContext(), mixedDiff);
    expect(result.status).toBe('success');
    expect(result.summary).toContain('Test files are included');
  });

  it('should return success for empty diff', async () => {
    const result = await runTestCoverageCheck(makeContext(), emptyDiff);
    expect(result.status).toBe('success');
  });
});
