import type { PRGuardianConfig } from '../../src/config.js';

export const fullConfig: PRGuardianConfig = {
  review: {
    enabled: true,
    provider: 'claude-code',
    mode: 'multi-agent',
    model: 'claude-sonnet',
    focus: ['security', 'bugs', 'performance'],
    ignore: ['**/*.test.ts', 'docs/**'],
    severity_threshold: 'warning',
    max_agents: 3,
  },
  template: {
    enabled: true,
    required_sections: ['Description', 'Testing'],
    block_merge: false,
  },
  tests: {
    enabled: true,
    warn_no_tests: true,
    coverage_diff: true,
  },
  labels: {
    enabled: true,
  },
  welcome: {
    enabled: true,
    message: 'Thanks for contributing! Please check our CONTRIBUTING.md',
  },
};

export const singleAgentConfig: PRGuardianConfig = {
  ...fullConfig,
  review: { ...fullConfig.review, mode: 'single' },
};

export const apiConfig: PRGuardianConfig = {
  ...fullConfig,
  review: { ...fullConfig.review, provider: 'api' },
};

export const disabledConfig: PRGuardianConfig = {
  review: { ...fullConfig.review, enabled: false },
  template: { ...fullConfig.template, enabled: false },
  tests: { ...fullConfig.tests, enabled: false },
  labels: { ...fullConfig.labels, enabled: false },
  welcome: { ...fullConfig.welcome, enabled: false },
};

export const strictConfig: PRGuardianConfig = {
  ...fullConfig,
  review: { ...fullConfig.review, severity_threshold: 'nit' },
  template: { ...fullConfig.template, block_merge: true },
};
