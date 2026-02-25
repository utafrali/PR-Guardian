import { Context } from 'probot';
import type { ReviewContext, ReviewResult } from '../config.js';
import { logger } from '../utils/logger.js';

async function fetchPRTemplate(
  context: Context<'pull_request'>,
  owner: string,
  repo: string,
  ref: string,
): Promise<string | null> {
  const paths = [
    '.github/PULL_REQUEST_TEMPLATE.md',
    '.github/pull_request_template.md',
    'PULL_REQUEST_TEMPLATE.md',
    'pull_request_template.md',
  ];

  for (const path of paths) {
    try {
      const response = await context.octokit.repos.getContent({ owner, repo, path, ref });
      if ('content' in response.data && response.data.type === 'file') {
        return Buffer.from(response.data.content, 'base64').toString('utf-8');
      }
    } catch {
      continue;
    }
  }

  return null;
}

function extractSections(template: string): string[] {
  const sectionRegex = /^##\s+(.+)$/gm;
  const sections: string[] = [];
  let match;
  while ((match = sectionRegex.exec(template)) !== null) {
    sections.push(match[1].trim());
  }
  return sections;
}

function checkSectionFilled(prBody: string, sectionName: string): boolean {
  const regex = new RegExp(`##\\s+${escapeRegex(sectionName)}`, 'i');
  const match = regex.exec(prBody);
  if (!match) return false;

  const startIndex = match.index + match[0].length;
  const nextSectionMatch = /##\s+/g;
  nextSectionMatch.lastIndex = startIndex;
  const nextMatch = nextSectionMatch.exec(prBody);

  const sectionContent = nextMatch
    ? prBody.slice(startIndex, nextMatch.index)
    : prBody.slice(startIndex);

  const cleaned = sectionContent
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\[.*?\]/g, '')
    .trim();

  return cleaned.length > 0;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function runTemplateCheck(
  probotContext: Context<'pull_request'>,
  reviewContext: ReviewContext,
): Promise<ReviewResult> {
  if (!reviewContext.config.template.enabled) {
    return { reviewer: 'Template Check', summary: 'Disabled', comments: [], status: 'neutral' };
  }

  const { owner, repo } = reviewContext;
  const ref = probotContext.payload.pull_request.base.sha;

  const template = await fetchPRTemplate(probotContext, owner, repo, ref);
  if (!template) {
    logger.info('No PR template found, skipping template check');
    return { reviewer: 'Template Check', summary: 'No PR template found', comments: [], status: 'neutral' };
  }

  const templateSections = extractSections(template);
  const requiredSections = reviewContext.config.template.required_sections;
  const prBody = reviewContext.prBody || '';

  const results: Array<{ section: string; filled: boolean }> = [];

  for (const section of requiredSections) {
    if (templateSections.some((s) => s.toLowerCase() === section.toLowerCase())) {
      results.push({ section, filled: checkSectionFilled(prBody, section) });
    } else {
      results.push({ section, filled: prBody.toLowerCase().includes(section.toLowerCase()) });
    }
  }

  const missing = results.filter((r) => !r.filled);
  const checklist = results
    .map((r) => `- [${r.filled ? 'x' : ' '}] **${r.section}**`)
    .join('\n');

  const summary =
    missing.length === 0
      ? 'All required sections are filled'
      : `Missing ${missing.length} required section(s)`;

  const body = [
    '## PR Template Compliance',
    '',
    checklist,
    '',
    missing.length > 0
      ? `:warning: Please fill in the missing sections: ${missing.map((m) => `**${m.section}**`).join(', ')}`
      : ':white_check_mark: All required sections are filled!',
  ].join('\n');

  const blockMerge = reviewContext.config.template.block_merge && missing.length > 0;

  return {
    reviewer: 'Template Check',
    summary: `${summary}\n\n${body}`,
    comments: [],
    status: blockMerge ? 'failure' : missing.length > 0 ? 'neutral' : 'success',
  };
}
