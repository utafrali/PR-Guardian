import { describe, it, expect, vi } from 'vitest';

// We test the pure logic extracted from template-check
// The actual reviewer needs a Probot context which is harder to mock

describe('Template Check Logic', () => {
  describe('section detection', () => {
    function extractSections(template: string): string[] {
      const sectionRegex = /^##\s+(.+)$/gm;
      const sections: string[] = [];
      let match;
      while ((match = sectionRegex.exec(template)) !== null) {
        sections.push(match[1].trim());
      }
      return sections;
    }

    it('should extract sections from template', () => {
      const template = `# PR Template
## Description
Describe your changes

## Testing
How was this tested?

## Screenshots
If applicable`;

      const sections = extractSections(template);
      expect(sections).toEqual(['Description', 'Testing', 'Screenshots']);
    });

    it('should handle template with no sections', () => {
      const template = 'Just a plain text template';
      const sections = extractSections(template);
      expect(sections).toEqual([]);
    });

    it('should handle empty template', () => {
      const sections = extractSections('');
      expect(sections).toEqual([]);
    });
  });

  describe('section filled check', () => {
    function checkSectionFilled(prBody: string, sectionName: string): boolean {
      const regex = new RegExp(`##\\s+${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      const match = regex.exec(prBody);
      if (!match) return false;

      const startIndex = match.index + match[0].length;
      const nextSectionRegex = /##\s+/g;
      nextSectionRegex.lastIndex = startIndex;
      const nextMatch = nextSectionRegex.exec(prBody);

      const sectionContent = nextMatch
        ? prBody.slice(startIndex, nextMatch.index)
        : prBody.slice(startIndex);

      const cleaned = sectionContent
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\[.*?\]/g, '')
        .trim();

      return cleaned.length > 0;
    }

    it('should detect filled section', () => {
      const body = `## Description
This PR adds authentication support.

## Testing
Unit tests added.`;

      expect(checkSectionFilled(body, 'Description')).toBe(true);
      expect(checkSectionFilled(body, 'Testing')).toBe(true);
    });

    it('should detect empty section', () => {
      const body = `## Description

## Testing
Tests added`;

      expect(checkSectionFilled(body, 'Description')).toBe(false);
      expect(checkSectionFilled(body, 'Testing')).toBe(true);
    });

    it('should ignore HTML comments in sections', () => {
      const body = `## Description
<!-- Please describe your changes -->

## Testing
Tests added`;

      expect(checkSectionFilled(body, 'Description')).toBe(false);
    });

    it('should return false for missing section', () => {
      const body = `## Description
Some text`;

      expect(checkSectionFilled(body, 'Testing')).toBe(false);
    });
  });
});
