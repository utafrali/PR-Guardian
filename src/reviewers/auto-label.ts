import type { ReviewContext, ReviewResult } from '../config.js';
import type { PRDiff } from '../github/diff.js';

interface LabelRule {
  label: string;
  patterns: RegExp[];
}

const LABEL_RULES: LabelRule[] = [
  { label: 'bug', patterns: [/fix/i, /bugfix/i, /hotfix/i] },
  { label: 'feature', patterns: [/feat/i, /feature/i] },
  { label: 'docs', patterns: [/\.md$/i, /docs\//i, /documentation/i, /README/i] },
  { label: 'refactor', patterns: [/refactor/i] },
  { label: 'test', patterns: [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /__tests__\//] },
  { label: 'ci', patterns: [/\.github\/workflows\//, /\.github\/actions\//, /Dockerfile/i, /docker-compose/i] },
  { label: 'dependencies', patterns: [/package\.json$/, /package-lock\.json$/, /yarn\.lock$/, /pnpm-lock\.yaml$/] },
];

function labelsFromFiles(files: PRDiff['files']): string[] {
  const labels = new Set<string>();

  for (const file of files) {
    for (const rule of LABEL_RULES) {
      if (rule.patterns.some((p) => p.test(file.filename))) {
        labels.add(rule.label);
      }
    }
  }

  return Array.from(labels);
}

function labelsFromTitle(title: string): string[] {
  const labels = new Set<string>();

  if (/\bfix(es|ed)?\b/i.test(title) || /\bbug\b/i.test(title)) labels.add('bug');
  if (/\bfeat(ure)?\b/i.test(title)) labels.add('feature');
  if (/\bdocs?\b/i.test(title)) labels.add('docs');
  if (/\brefactor\b/i.test(title)) labels.add('refactor');
  if (/\btest(s|ing)?\b/i.test(title)) labels.add('test');
  if (/\bci\b/i.test(title) || /\bcd\b/i.test(title)) labels.add('ci');

  return Array.from(labels);
}

function detectBreakingChange(title: string, body: string): boolean {
  const combined = `${title}\n${body || ''}`;
  return /BREAKING[\s-]CHANGE/i.test(combined) || /^[a-z]+(\(.+\))?!:/i.test(title);
}

export async function runAutoLabel(
  context: ReviewContext,
  diff: PRDiff,
): Promise<ReviewResult> {
  if (!context.config.labels.enabled) {
    return { reviewer: 'Auto Label', summary: 'Disabled', comments: [], labels: [], status: 'neutral' };
  }

  const fileLabels = labelsFromFiles(diff.files);
  const titleLabels = labelsFromTitle(context.prTitle);
  const isBreaking = detectBreakingChange(context.prTitle, context.prBody);

  const allLabels = new Set([...fileLabels, ...titleLabels]);
  if (isBreaking) allLabels.add('breaking-change');

  const labels = Array.from(allLabels);

  const summary = labels.length > 0
    ? `Applied labels: ${labels.map((l) => `\`${l}\``).join(', ')}`
    : 'No labels to apply';

  return {
    reviewer: 'Auto Label',
    summary,
    comments: [],
    labels,
    status: 'success',
  };
}
