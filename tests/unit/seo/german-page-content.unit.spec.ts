/**
 * German Transparent Background Page Content Tests — Phase 5
 *
 * Validates that the German locale translation for transparent-background-maker
 * contains native German content targeting the "transparenter hintergrund" keyword cluster.
 *
 * These tests guard against regressions in locale-specific content that directly
 * affect the ranking signal for the /de/tools/transparent-background-maker page.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const DE_TOOLS_PATH = path.resolve(__dirname, '../../../locales/de/tools.json');

interface IToolEntry {
  slug: string;
  uniqueIntro?: string;
  expandedDescription?: string;
  primaryKeyword?: string;
  secondaryKeywords?: string[];
  [key: string]: unknown;
}

function loadDeTools(): IToolEntry[] {
  const raw = fs.readFileSync(DE_TOOLS_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  // The file has a top-level "pages" array
  return parsed.pages ?? [];
}

function findTool(tools: IToolEntry[], slug: string): IToolEntry | undefined {
  return tools.find(t => t.slug === slug);
}

describe('German transparent-background-maker page content', () => {
  const tools = loadDeTools();
  const dePage = findTool(tools, 'transparent-background-maker');

  it('transparent-background-maker entry exists in de/tools.json', () => {
    expect(dePage).toBeDefined();
  });

  describe('uniqueIntro', () => {
    it('German transparent-bg page has uniqueIntro', () => {
      expect(dePage?.uniqueIntro).toBeTruthy();
    });

    it('German uniqueIntro contains "transparenter hintergrund" keyword', () => {
      expect(dePage?.uniqueIntro).toMatch(/transparente[rn]?\s+hintergrund/i);
    });

    it('German uniqueIntro is min 100 chars', () => {
      expect((dePage?.uniqueIntro ?? '').length).toBeGreaterThan(100);
    });

    it('German uniqueIntro contains "transparentes PNG erstellen" or equivalent', () => {
      expect(dePage?.uniqueIntro).toMatch(/transparente[sm]?\s+png/i);
    });

    it('German uniqueIntro contains "kostenlos" (converting term)', () => {
      expect(dePage?.uniqueIntro).toMatch(/kostenlos/i);
    });
  });

  describe('expandedDescription', () => {
    it('German transparent-bg page has expandedDescription', () => {
      expect(dePage?.expandedDescription).toBeTruthy();
    });

    it('German expandedDescription is min 300 chars', () => {
      expect((dePage?.expandedDescription ?? '').length).toBeGreaterThan(300);
    });

    it('German expandedDescription contains "KI" or "KI-" (AI reference in German)', () => {
      expect(dePage?.expandedDescription).toMatch(/\bKI\b/);
    });

    it('German expandedDescription contains "PNG" keyword', () => {
      expect(dePage?.expandedDescription).toMatch(/\bPNG\b/);
    });

    it('German expandedDescription contains "kostenlos" (converting term)', () => {
      expect(dePage?.expandedDescription).toMatch(/kostenlos/i);
    });
  });

  describe('secondaryKeywords', () => {
    it('secondaryKeywords includes "png hintergrund transparent"', () => {
      const keywords = dePage?.secondaryKeywords ?? [];
      const hasPngHintergrundTransparent = keywords.some(k =>
        k.toLowerCase().includes('png hintergrund transparent')
      );
      expect(hasPngHintergrundTransparent).toBe(true);
    });

    it('secondaryKeywords includes "transparentes png erstellen"', () => {
      const keywords = dePage?.secondaryKeywords ?? [];
      const hasTransparentesPngErstellen = keywords.some(k =>
        k.toLowerCase().includes('transparentes png erstellen')
      );
      expect(hasTransparentesPngErstellen).toBe(true);
    });
  });
});
