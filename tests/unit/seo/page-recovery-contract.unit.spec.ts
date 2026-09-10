import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import scaleData from '@/app/seo/data/scale.json';
import scaleEn from '@/locales/en/scale.json';
import { calculatePrintReadiness } from '@client/utils/print-readiness';

function pageText(data: typeof scaleData, slug: string): string {
  const page = data.pages.find(candidate => candidate.slug === slug);
  expect(page, `missing ${slug}`).toBeTruthy();
  return JSON.stringify(page).toLowerCase();
}

describe('SEO page recovery contract', () => {
  it('calculates print readiness entirely from client-side dimensions', () => {
    expect(
      calculatePrintReadiness({
        pixelWidth: 2400,
        pixelHeight: 3000,
        printWidthInches: 8,
        printHeightInches: 10,
        targetPpi: 300,
      })
    ).toEqual({
      horizontalPpi: 300,
      verticalPpi: 300,
      effectivePpi: 300,
      requiredScale: 1,
      ready: true,
    });

    const lowRes = calculatePrintReadiness({
      pixelWidth: 1200,
      pixelHeight: 1500,
      printWidthInches: 8,
      printHeightInches: 10,
      targetPpi: 300,
    });
    expect(lowRes.ready).toBe(false);
    expect(lowRes.requiredScale).toBe(2);
  });

  it('keeps the 16x workflow honest in source and English locale copy', () => {
    for (const data of [scaleData, scaleEn]) {
      const text = pageText(data, 'upscale-16x');
      expect(text).toMatch(/4x/);
      expect(text).not.toMatch(/seamless|artifact[- ]free/);
      expect(text).toMatch(/inspect|inspection/);
    }
  });

  it('wires print readiness into the poster article CTA surface', () => {
    const cta = readFileSync('client/components/blog/BlogCTA.tsx', 'utf8');
    expect(cta).toContain('PrintReadinessChecker');
    expect(cta).toContain('CTA_PRINT_READINESS');
  });

  it('records dated homepage and comparison recovery baselines before changing them', () => {
    expect(existsSync('seo-reports/homepage-change-log-2026-09.md')).toBe(true);
    expect(existsSync('seo-reports/comparison-ctr-diagnosis-2026-09.md')).toBe(true);

    const homepage = readFileSync('seo-reports/homepage-change-log-2026-09.md', 'utf8');
    const comparison = readFileSync('seo-reports/comparison-ctr-diagnosis-2026-09.md', 'utf8');
    expect(homepage).toContain('2026-09-10');
    expect(homepage).toMatch(/non-brand/i);
    expect(comparison).toContain('2026-09-10');
    expect(comparison).toMatch(/ctr/i);
  });
});
