import { describe, it, expect } from 'vitest';
import { prGuardianConfigSchema, DEFAULT_CONFIG } from '../src/config.js';

describe('Config Schema', () => {
  it('should parse empty config with defaults', () => {
    const config = prGuardianConfigSchema.parse({});
    expect(config.review.enabled).toBe(true);
    expect(config.review.provider).toBe('claude-code');
    expect(config.review.model).toBe('claude-sonnet');
    expect(config.review.focus).toEqual(['security', 'bugs', 'performance']);
    expect(config.template.enabled).toBe(true);
    expect(config.template.required_sections).toEqual(['Description', 'Testing']);
    expect(config.tests.enabled).toBe(true);
    expect(config.labels.enabled).toBe(true);
    expect(config.welcome.enabled).toBe(true);
  });

  it('should parse partial config and merge with defaults', () => {
    const config = prGuardianConfigSchema.parse({
      review: { model: 'claude-haiku', focus: ['security'] },
      template: { block_merge: true },
    });
    expect(config.review.model).toBe('claude-haiku');
    expect(config.review.focus).toEqual(['security']);
    expect(config.review.enabled).toBe(true);
    expect(config.template.block_merge).toBe(true);
    expect(config.template.required_sections).toEqual(['Description', 'Testing']);
  });

  it('should reject invalid model', () => {
    expect(() =>
      prGuardianConfigSchema.parse({ review: { model: 'gpt-4' } }),
    ).toThrow();
  });

  it('should reject invalid severity threshold', () => {
    expect(() =>
      prGuardianConfigSchema.parse({ review: { severity_threshold: 'info' } }),
    ).toThrow();
  });

  it('should parse full config', () => {
    const input = {
      review: {
        enabled: false,
        model: 'claude-haiku',
        focus: ['bugs'],
        ignore: ['vendor/**'],
        severity_threshold: 'critical',
      },
      template: {
        enabled: false,
        required_sections: ['Summary'],
        block_merge: true,
      },
      tests: {
        enabled: false,
        warn_no_tests: false,
        coverage_diff: false,
      },
      labels: { enabled: false },
      welcome: { enabled: false, message: 'Hello!' },
    };

    const config = prGuardianConfigSchema.parse(input);
    expect(config.review.enabled).toBe(false);
    expect(config.review.ignore).toEqual(['vendor/**']);
    expect(config.template.required_sections).toEqual(['Summary']);
    expect(config.welcome.message).toBe('Hello!');
  });

  it('DEFAULT_CONFIG should have all defaults', () => {
    expect(DEFAULT_CONFIG.review.enabled).toBe(true);
    expect(DEFAULT_CONFIG.review.provider).toBe('claude-code');
    expect(DEFAULT_CONFIG.review.model).toBe('claude-sonnet');
    expect(DEFAULT_CONFIG.template.block_merge).toBe(false);
    expect(DEFAULT_CONFIG.tests.warn_no_tests).toBe(true);
  });

  it('should accept api provider', () => {
    const config = prGuardianConfigSchema.parse({
      review: { provider: 'api' },
    });
    expect(config.review.provider).toBe('api');
  });

  it('should reject invalid provider', () => {
    expect(() =>
      prGuardianConfigSchema.parse({ review: { provider: 'openai' } }),
    ).toThrow();
  });
});
