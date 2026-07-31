import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

import comparisonData from '@/app/seo/data/comparison.json';
import freeData from '@/app/seo/data/free.json';
import toolsData from '@/app/seo/data/tools.json';
import localeComparisonData from '@/locales/en/comparison.json';
import localeCompareData from '@/locales/en/compare.json';
import localeFreeData from '@/locales/en/free.json';
import localeToolsData from '@/locales/en/tools.json';

const renewalClaim =
  /\b10 (?:free )?(?:credits|enhancements|upscales|images)\b|(?:5|10) credits\/(?:month|mo)|free (?:credits|enhancements|upscales|images).*?(?:monthly|per month|every month)|credits renew monthly|wait until next month/i;

const ownedPolicyCopy = [
  ...readdirSync('app/seo/data').map(file => `app/seo/data/${file}`),
  ...readdirSync('locales/en').map(file => `locales/en/${file}`),
  'server/services/email-providers/base-email-provider-adapter.ts',
  'emails/templates/LifecycleWelcomeEmail.tsx',
  'lib/seo/schema-generator.ts',
  'shared/config/subscription.config.ts',
]
  .filter(file => file.endsWith('.json') || file.endsWith('.ts') || file.endsWith('.tsx'))
  .map(file => readFileSync(file, 'utf8'))
  .join('\n');

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
  test('free and upscaler pages describe five credits without renewal claims', () => {
    const surfaces = [
      relevantFreePages(freeData),
      relevantFreePages(localeFreeData),
      upscalerTool(toolsData),
      upscalerTool(localeToolsData),
    ];

    for (const surface of surfaces) {
      expect(surface).toContain('5 free credits');
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

  test('owned English and SEO copy never promises obsolete or recurring welcome credits', () => {
    expect(ownedPolicyCopy).not.toMatch(/\b3 free images per day\b/i);
    expect(ownedPolicyCopy).not.toMatch(/\b10 free credits\b/i);
    expect(ownedPolicyCopy).not.toMatch(/\b10 credits\/(?:month|mo)\b/i);
    expect(ownedPolicyCopy).not.toMatch(/MyImageUpscaler.{0,160}\b10 free images\b/i);
    expect(ownedPolicyCopy).not.toMatch(/MyImageUpscaler.{0,160}\bunlimited free\b/i);
    expect(ownedPolicyCopy).not.toContain('Your first 10 credits are ready');
    expect(ownedPolicyCopy).not.toContain('Free tier with 10 credits');
    expect(ownedPolicyCopy).not.toMatch(/5 one-time (?:free )?credits/i);
    expect(ownedPolicyCopy).not.toContain(
      '`${CREDIT_COSTS.DEFAULT_FREE_CREDITS} credits per month`'
    );
  });
});
