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
      cropRequired: false,
      croppedFraction: 0,
      cropAxis: null,
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

  it('reports the crop a mismatched aspect ratio will cost', () => {
    // A 4:3 camera frame onto a 2:3 24x36 poster. The scale figure alone is not the
    // whole story: covering the poster crops half the width away, and the poster
    // article's copy promises to say so.
    const mismatched = calculatePrintReadiness({
      pixelWidth: 4000,
      pixelHeight: 3000,
      printWidthInches: 24,
      printHeightInches: 36,
      targetPpi: 300,
    });

    expect(mismatched.cropRequired).toBe(true);
    expect(mismatched.croppedFraction).toBeCloseTo(0.5, 2);
    expect(mismatched.cropAxis).toBe('width');

    // Matching aspect ratios cost nothing.
    const matched = calculatePrintReadiness({
      pixelWidth: 2400,
      pixelHeight: 3000,
      printWidthInches: 8,
      printHeightInches: 10,
      targetPpi: 300,
    });

    expect(matched.cropRequired).toBe(false);
    expect(matched.croppedFraction).toBe(0);
    expect(matched.cropAxis).toBeNull();
  });

  it('does not contradict itself when the rounded PPI lands on the target', () => {
    // effectivePpi displays rounded; `ready` must agree with what is shown rather
    // than reporting "about 300 PPI" beside a not-ready warning.
    // 2399.98 / 8 = 299.9975, which displays as 300 after rounding.
    const justUnder = calculatePrintReadiness({
      pixelWidth: 2399.98,
      pixelHeight: 2999.98,
      printWidthInches: 8,
      printHeightInches: 10,
      targetPpi: 300,
    });

    expect(justUnder.effectivePpi).toBe(300);
    expect(justUnder.ready).toBe(true);
  });

  it('renders the checker without emitting missing-translation errors', () => {
    const cta = readFileSync('client/components/blog/BlogCTA.tsx', 'utf8');
    const earlyReturn = cta.indexOf("if (type === 'printReadiness')");
    const titleLookup = cta.indexOf('t(`${type}.title`)');

    expect(earlyReturn).toBeGreaterThan(-1);
    expect(titleLookup).toBeGreaterThan(-1);
    // blog.cta.printReadiness has no translations - it is a tool, not a banner - so
    // the branch must return before any t() lookup for that type.
    expect(earlyReturn).toBeLessThan(titleLookup);
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
