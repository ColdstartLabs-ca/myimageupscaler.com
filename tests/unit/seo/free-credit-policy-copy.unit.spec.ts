import { describe, expect, test } from 'vitest';

import comparisonData from '@/app/seo/data/comparison.json';
import freeData from '@/app/seo/data/free.json';
import toolsData from '@/app/seo/data/tools.json';
import localeComparisonData from '@/locales/en/comparison.json';
import localeCompareData from '@/locales/en/compare.json';
import localeFreeData from '@/locales/en/free.json';
import localeToolsData from '@/locales/en/tools.json';

const renewalClaim =
  /\b10 (?:free )?(?:credits|enhancements|upscales|images)\b|free (?:credits|enhancements|upscales|images).*?(?:monthly|per month|every month)|credits renew monthly|wait until next month/i;

function relevantFreePages(data: typeof freeData): string {
  return JSON.stringify(data.pages.filter(page => page.slug !== 'free-background-remover'));
}

function upscalerTool(data: typeof toolsData): string {
  return JSON.stringify(data.pages.find(page => page.slug === 'ai-image-upscaler'));
}

function textValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(textValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(textValues);
  return [];
}

function namedMyImageUpscaler(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(namedMyImageUpscaler);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [
    ...(record.name === 'MyImageUpscaler' ? [record] : []),
    ...Object.values(record).flatMap(namedMyImageUpscaler),
  ];
}

describe('free-credit policy copy', () => {
  test('free and upscaler pages describe five one-time credits without renewal claims', () => {
    const surfaces = [
      relevantFreePages(freeData),
      relevantFreePages(localeFreeData),
      upscalerTool(toolsData),
      upscalerTool(localeToolsData),
    ];

    for (const surface of surfaces) {
      expect(surface).toContain('5 one-time');
      for (const text of textValues(JSON.parse(surface) as unknown)) {
        expect(text).not.toMatch(renewalClaim);
      }
    }
  });

  test('comparison pages do not advertise recurring MyImageUpscaler free credits', () => {
    for (const data of [comparisonData, localeComparisonData, localeCompareData]) {
      const products = namedMyImageUpscaler(data);
      expect(products.length).toBeGreaterThan(0);
      for (const text of products.flatMap(textValues)) {
        expect(text).not.toMatch(/free \(10\/mo\)|10 credits\/month|free credits monthly/i);
      }
    }
  });
});
