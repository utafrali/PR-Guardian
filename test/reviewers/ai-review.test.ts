import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAIReview } from '../../src/reviewers/ai-review.js';
import { sampleDiff, emptyDiff } from '../fixtures/sample-diff.js';
import { fullConfig, apiConfig, disabledConfig } from '../fixtures/sample-config.js';
import type { ReviewContext } from '../../src/config.js';

vi.mock('../../src/utils/ai-client.js', () => ({
  createReview: vi.fn(),
  resolveModel: vi.fn((m: string) => m),
  resetClient: vi.fn(),
}));

import { createReview } from '../../src/utils/ai-client.js';
const mockCreateReview = vi.mocked(createReview);

function makeContext(overrides: Partial<ReviewContext> = {}): ReviewContext {
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
    ...overrides,
  };
}

describe('AI Review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return neutral when disabled', async () => {
    const result = await runAIReview(
      makeContext({ config: disabledConfig }),
      sampleDiff,
    );
    expect(result.status).toBe('neutral');
    expect(result.reviewer).toBe('AI Review');
    expect(mockCreateReview).not.toHaveBeenCalled();
  });

  it('should return success for empty diff', async () => {
    const result = await runAIReview(makeContext(), emptyDiff);
    expect(result.status).toBe('success');
    expect(result.summary).toBe('No files to review');
    expect(mockCreateReview).not.toHaveBeenCalled();
  });

  it('should pass claude-code provider by default', async () => {
    mockCreateReview.mockResolvedValueOnce({
      content: JSON.stringify({ summary: 'Looks good', comments: [] }),
      model: 'claude-sonnet',
      inputTokens: 100,
      outputTokens: 50,
    });

    await runAIReview(makeContext(), sampleDiff);
    expect(mockCreateReview).toHaveBeenCalledWith(
      expect.any(Object),
      'claude-code',
    );
  });

  it('should pass api provider when configured', async () => {
    mockCreateReview.mockResolvedValueOnce({
      content: JSON.stringify({ summary: 'Looks good', comments: [] }),
      model: 'claude-sonnet',
      inputTokens: 100,
      outputTokens: 50,
    });

    await runAIReview(makeContext({ config: apiConfig }), sampleDiff);
    expect(mockCreateReview).toHaveBeenCalledWith(
      expect.any(Object),
      'api',
    );
  });

  it('should parse AI response and return comments', async () => {
    mockCreateReview.mockResolvedValueOnce({
      content: JSON.stringify({
        summary: 'Found a potential security issue',
        comments: [
          {
            path: 'src/utils/auth.ts',
            line: 15,
            body: 'Consider using a constant-time comparison for token verification',
            severity: 'warning',
          },
        ],
      }),
      model: 'claude-sonnet',
      inputTokens: 100,
      outputTokens: 50,
    });

    const result = await runAIReview(makeContext(), sampleDiff);
    expect(result.status).toBe('success');
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].severity).toBe('warning');
    expect(result.comments[0].path).toBe('src/utils/auth.ts');
  });

  it('should filter comments by severity threshold', async () => {
    mockCreateReview.mockResolvedValueOnce({
      content: JSON.stringify({
        summary: 'Found some issues',
        comments: [
          { path: 'a.ts', line: 1, body: 'Critical bug', severity: 'critical' },
          { path: 'b.ts', line: 2, body: 'Minor style', severity: 'nit' },
          { path: 'c.ts', line: 3, body: 'Should fix', severity: 'warning' },
        ],
      }),
      model: 'claude-sonnet',
      inputTokens: 100,
      outputTokens: 50,
    });

    // Default threshold is 'warning' — should include critical and warning, not nit
    const result = await runAIReview(makeContext(), sampleDiff);
    expect(result.comments).toHaveLength(2);
    expect(result.comments.map((c) => c.severity)).toEqual(['critical', 'warning']);
  });

  it('should mark as failure when critical issues found', async () => {
    mockCreateReview.mockResolvedValueOnce({
      content: JSON.stringify({
        summary: 'Critical security vulnerability',
        comments: [
          { path: 'a.ts', line: 1, body: 'SQL injection', severity: 'critical' },
        ],
      }),
      model: 'claude-sonnet',
      inputTokens: 100,
      outputTokens: 50,
    });

    const result = await runAIReview(makeContext(), sampleDiff);
    expect(result.status).toBe('failure');
  });

  it('should handle AI errors gracefully', async () => {
    mockCreateReview.mockRejectedValueOnce(new Error('API rate limit'));

    const result = await runAIReview(makeContext(), sampleDiff);
    expect(result.status).toBe('neutral');
    expect(result.summary).toContain('failed');
  });

  it('should handle malformed AI response', async () => {
    mockCreateReview.mockResolvedValueOnce({
      content: 'not valid json at all',
      model: 'claude-sonnet',
      inputTokens: 100,
      outputTokens: 50,
    });

    const result = await runAIReview(makeContext(), sampleDiff);
    expect(result.status).toBe('neutral');
  });
});
