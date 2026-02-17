/**
 * Tests for the FAQ schema extraction logic in the blog post page.
 *
 * The `extractFaqSchema` function parses H3 headings under any H2 section whose
 * title contains "faq", "fragen", "questions", or "häufig". It generates a
 * FAQPage JSON-LD schema for search engine rich results.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Mirror of the extractFaqSchema function from the blog post page.
// We duplicate it here to avoid importing a Next.js server component in Vitest.
// If the implementation in page.tsx changes, this must be updated to match.
// ---------------------------------------------------------------------------
function extractFaqSchema(
  content: string
): { '@context': string; '@type': string; mainEntity: object[] } | null {
  const lines = content.split('\n');
  const faqs: { question: string; answer: string }[] = [];

  let inFaqSection = false;
  let currentQuestion: string | null = null;
  let currentAnswerLines: string[] = [];

  const FAQ_SECTION_RE = /^##\s+.*(faq|fragen|questions|häufig|frequently)/i;
  const H2_RE = /^##\s+/;
  const H3_RE = /^###\s+(.+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (H2_RE.test(line)) {
      if (inFaqSection && currentQuestion && currentAnswerLines.length > 0) {
        faqs.push({ question: currentQuestion, answer: currentAnswerLines.join(' ').trim() });
        currentQuestion = null;
        currentAnswerLines = [];
      }
      inFaqSection = FAQ_SECTION_RE.test(line);
      continue;
    }

    if (!inFaqSection) continue;

    const h3Match = line.match(H3_RE);
    if (h3Match) {
      if (currentQuestion && currentAnswerLines.length > 0) {
        faqs.push({ question: currentQuestion, answer: currentAnswerLines.join(' ').trim() });
      }
      currentQuestion = h3Match[1].trim();
      currentAnswerLines = [];
      continue;
    }

    if (currentQuestion && line.trim()) {
      const cleanLine = line
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .trim();
      if (cleanLine) currentAnswerLines.push(cleanLine);
    }
  }

  if (inFaqSection && currentQuestion && currentAnswerLines.length > 0) {
    faqs.push({ question: currentQuestion, answer: currentAnswerLines.join(' ').trim() });
  }

  if (faqs.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const CONTENT_WITH_FAQ = `
# How to Enhance Image Quality with AI

Introduction paragraph.

## Why AI Helps

Some content here.

## Frequently Asked Questions

### Can AI really improve image quality?

Yes. Modern AI tools reconstruct fine detail and reduce noise.

### Is there a free AI image quality enhancer?

Yes. The [AI Photo Enhancer](/tools/ai-photo-enhancer) is completely free.

### What formats are supported?

JPEG, PNG, WebP, AVIF, BMP, and TIFF.

## Conclusion

Final thoughts.
`;

const CONTENT_WITHOUT_FAQ = `
# Just a Blog Post

## Introduction

No FAQ section here.

## Conclusion

The end.
`;

const CONTENT_WITH_FAQ_GERMAN_KEYWORD = `
# Bildqualität verbessern

## Häufig gestellte Fragen

### Wie funktioniert das?

KI analysiert das Bild und verbessert Details.

### Ist es kostenlos?

Ja, die Basis-Funktion ist kostenlos.
`;

const CONTENT_WITH_FAQ_EXACT_HEADER = `
# Guide

## FAQ

### What is upscaling?

Upscaling increases image dimensions using AI.
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractFaqSchema', () => {
  describe('when content has a Frequently Asked Questions section', () => {
    it('returns a FAQPage schema', () => {
      const schema = extractFaqSchema(CONTENT_WITH_FAQ);
      expect(schema).not.toBeNull();
      expect(schema?.['@type']).toBe('FAQPage');
      expect(schema?.['@context']).toBe('https://schema.org');
    });

    it('extracts all Q&A pairs', () => {
      const schema = extractFaqSchema(CONTENT_WITH_FAQ);
      expect(schema?.mainEntity).toHaveLength(3);
    });

    it('sets correct question names', () => {
      const schema = extractFaqSchema(CONTENT_WITH_FAQ);
      const entities = schema?.mainEntity as Array<{ name: string; '@type': string }>;
      expect(entities[0].name).toBe('Can AI really improve image quality?');
      expect(entities[1].name).toBe('Is there a free AI image quality enhancer?');
      expect(entities[2].name).toBe('What formats are supported?');
    });

    it('sets @type Question on each entity', () => {
      const schema = extractFaqSchema(CONTENT_WITH_FAQ);
      const entities = schema?.mainEntity as Array<{ '@type': string }>;
      entities.forEach(entity => {
        expect(entity['@type']).toBe('Question');
      });
    });

    it('strips markdown links from answer text', () => {
      const schema = extractFaqSchema(CONTENT_WITH_FAQ);
      const entities = schema?.mainEntity as Array<{
        acceptedAnswer: { text: string; '@type': string };
      }>;
      // The second Q&A has a markdown link [AI Photo Enhancer](/tools/ai-photo-enhancer)
      expect(entities[1].acceptedAnswer.text).not.toContain('[');
      expect(entities[1].acceptedAnswer.text).toContain('AI Photo Enhancer');
    });

    it('sets @type Answer on acceptedAnswer', () => {
      const schema = extractFaqSchema(CONTENT_WITH_FAQ);
      const entities = schema?.mainEntity as Array<{
        acceptedAnswer: { '@type': string };
      }>;
      entities.forEach(entity => {
        expect(entity.acceptedAnswer['@type']).toBe('Answer');
      });
    });
  });

  describe('when content has no FAQ section', () => {
    it('returns null', () => {
      const schema = extractFaqSchema(CONTENT_WITHOUT_FAQ);
      expect(schema).toBeNull();
    });
  });

  describe('when FAQ section uses German keyword "Häufig"', () => {
    it('detects the FAQ section', () => {
      const schema = extractFaqSchema(CONTENT_WITH_FAQ_GERMAN_KEYWORD);
      expect(schema).not.toBeNull();
      expect(schema?.mainEntity).toHaveLength(2);
    });
  });

  describe('when FAQ section header is exactly "## FAQ"', () => {
    it('detects the FAQ section', () => {
      const schema = extractFaqSchema(CONTENT_WITH_FAQ_EXACT_HEADER);
      expect(schema).not.toBeNull();
      expect(schema?.mainEntity).toHaveLength(1);
    });

    it('extracts question and answer correctly', () => {
      const schema = extractFaqSchema(CONTENT_WITH_FAQ_EXACT_HEADER);
      const entities = schema?.mainEntity as Array<{
        name: string;
        acceptedAnswer: { text: string };
      }>;
      expect(entities[0].name).toBe('What is upscaling?');
      expect(entities[0].acceptedAnswer.text).toContain('Upscaling increases image dimensions');
    });
  });

  describe('with empty content', () => {
    it('returns null', () => {
      expect(extractFaqSchema('')).toBeNull();
    });
  });

  describe('with FAQ section but no H3 questions', () => {
    it('returns null when FAQ section is empty', () => {
      const content = `
## Frequently Asked Questions

Just a paragraph, no questions here.

## Next Section
`;
      expect(extractFaqSchema(content)).toBeNull();
    });
  });

  describe('schema validity for search engines', () => {
    it('produced schema matches FAQPage structure for the enhance image quality post', () => {
      const schema = extractFaqSchema(CONTENT_WITH_FAQ);
      // Validate structure matches Google's FAQPage requirements
      expect(schema).toMatchObject({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: expect.arrayContaining([
          expect.objectContaining({
            '@type': 'Question',
            name: expect.any(String),
            acceptedAnswer: expect.objectContaining({
              '@type': 'Answer',
              text: expect.any(String),
            }),
          }),
        ]),
      });
    });
  });
});
