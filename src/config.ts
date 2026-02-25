import { z } from 'zod';

const reviewConfigSchema = z.object({
  enabled: z.boolean().default(true),
  provider: z.enum(['claude-code', 'api']).default('claude-code'),
  mode: z.enum(['single', 'multi-agent']).default('multi-agent'),
  model: z.enum(['claude-sonnet', 'claude-haiku']).default('claude-sonnet'),
  focus: z.array(z.string()).default(['security', 'bugs', 'performance']),
  ignore: z.array(z.string()).default([]),
  severity_threshold: z.enum(['critical', 'warning', 'nit']).default('warning'),
  max_agents: z.number().min(1).max(10).default(3),
});

const templateConfigSchema = z.object({
  enabled: z.boolean().default(true),
  required_sections: z.array(z.string()).default(['Description', 'Testing']),
  block_merge: z.boolean().default(false),
});

const testsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  warn_no_tests: z.boolean().default(true),
  coverage_diff: z.boolean().default(true),
});

const labelsConfigSchema = z.object({
  enabled: z.boolean().default(true),
});

const welcomeConfigSchema = z.object({
  enabled: z.boolean().default(true),
  message: z
    .string()
    .default('Thanks for contributing! Please check our CONTRIBUTING.md'),
});

export const prGuardianConfigSchema = z.object({
  review: reviewConfigSchema.default({}),
  template: templateConfigSchema.default({}),
  tests: testsConfigSchema.default({}),
  labels: labelsConfigSchema.default({}),
  welcome: welcomeConfigSchema.default({}),
});

export type PRGuardianConfig = z.infer<typeof prGuardianConfigSchema>;
export type ReviewConfig = z.infer<typeof reviewConfigSchema>;
export type TemplateConfig = z.infer<typeof templateConfigSchema>;
export type TestsConfig = z.infer<typeof testsConfigSchema>;
export type LabelsConfig = z.infer<typeof labelsConfigSchema>;
export type WelcomeConfig = z.infer<typeof welcomeConfigSchema>;

export const DEFAULT_CONFIG: PRGuardianConfig = prGuardianConfigSchema.parse({});

export type Severity = 'critical' | 'warning' | 'nit';

export interface ReviewComment {
  path: string;
  line: number;
  body: string;
  severity: Severity;
}

export interface ReviewResult {
  reviewer: string;
  summary: string;
  comments: ReviewComment[];
  labels?: string[];
  status: 'success' | 'failure' | 'neutral';
}

export interface ReviewContext {
  owner: string;
  repo: string;
  pullNumber: number;
  prTitle: string;
  prBody: string;
  prAuthor: string;
  baseBranch: string;
  headBranch: string;
  config: PRGuardianConfig;
}
