import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import comparisonData from '@/app/seo/data/comparison.json';
import freeData from '@/app/seo/data/free.json';
import toolsData from '@/app/seo/data/tools.json';
import commonEn from '@/locales/en/common.json';
import comparisonEn from '@/locales/en/comparison.json';
import freeEn from '@/locales/en/free.json';
import toolsEn from '@/locales/en/tools.json';
import { CREDIT_COSTS } from '@shared/config/credits.config';
import { MODEL_COSTS } from '@shared/config/model-costs.config';
import {
  PRODUCT_CAPABILITIES,
  welcomeCreditsFor,
  welcomeCreditsForTier,
} from '@shared/config/product-capabilities';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';

type TextClaim = { source: string; path: string; text: string };

function textClaims(value: unknown, source: string, path = '$'): TextClaim[] {
  if (typeof value === 'string') return [{ source, path, text: value }];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => textClaims(entry, source, `${path}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) =>
      textClaims(entry, source, `${path}.${key}`)
    );
  }
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

const hardcodedWelcomeCreditClaim = /\b(?:3|5|10)\s+(?:free\s+)?credits\b/i;
const guestUpscaleClaim =
  /\b(?:no\s+(?:sign[ -]?up|account)(?:\s+needed|required)?|without\s+(?:an\s+)?account|without\s+signing\s+up)\b/i;
const accountBackedToolSlugs = new Set([
  'ai-image-upscaler',
  'ai-photo-enhancer',
  'photo-quality-enhancer',
]);

function ownUpscalerStaticClaims(): TextClaim[] {
  const freeSourcePages = freeData.pages.filter(page => page.slug !== 'free-background-remover');
  const freeLocalePages = freeEn.pages.filter(page => page.slug !== 'free-background-remover');
  const toolSourcePages = toolsData.pages.filter(page => accountBackedToolSlugs.has(page.slug));
  const toolLocalePages = toolsEn.pages.filter(page => accountBackedToolSlugs.has(page.slug));

  return [
    ...textClaims(freeSourcePages, 'app/seo/data/free.json'),
    ...textClaims(freeLocalePages, 'locales/en/free.json'),
    ...textClaims(toolSourcePages, 'app/seo/data/tools.json'),
    ...textClaims(toolLocalePages, 'locales/en/tools.json'),
    ...namedMyImageUpscaler(comparisonData).flatMap(value =>
      textClaims(value, 'app/seo/data/comparison.json')
    ),
    ...namedMyImageUpscaler(comparisonEn).flatMap(value =>
      textClaims(value, 'locales/en/comparison.json')
    ),
    ...textClaims(commonEn.homepage, 'locales/en/common.json'),
  ];
}

function expectNoMatchingClaim(pattern: RegExp, label: string): void {
  const offender = ownUpscalerStaticClaims().find(claim => pattern.test(claim.text));
  if (offender) {
    throw new Error(`${label}: ${offender.source}:${offender.path} => ${JSON.stringify(offender.text)}`);
  }
}

describe('product capability claims', () => {
  it('derives welcome credits from the regional grant policy', () => {
    expect(welcomeCreditsForTier('standard')).toBe(CREDIT_COSTS.DEFAULT_FREE_CREDITS);
    expect(welcomeCreditsForTier('restricted')).toBe(CREDIT_COSTS.RESTRICTED_FREE_CREDITS);
    expect(welcomeCreditsForTier('paywalled')).toBe(CREDIT_COSTS.PAYWALLED_FREE_CREDITS);

    expect(welcomeCreditsFor('US')).toBe(CREDIT_COSTS.DEFAULT_FREE_CREDITS);
    expect(welcomeCreditsFor('BR')).toBe(CREDIT_COSTS.RESTRICTED_FREE_CREDITS);
    expect(welcomeCreditsFor('IN')).toBe(CREDIT_COSTS.PAYWALLED_FREE_CREDITS);
  });

  it('derives direct-upload formats and scale from the shipped processing contract', () => {
    expect(PRODUCT_CAPABILITIES.directUploadMimeTypes).toEqual(IMAGE_VALIDATION.ALLOWED_TYPES);
    expect(PRODUCT_CAPABILITIES.maxScalePerPass).toBe(MODEL_COSTS.MAX_SCALE_PREMIUM);
    expect(PRODUCT_CAPABILITIES.directUploadFormats).toEqual(['JPEG', 'PNG', 'WebP', 'HEIC']);

    const sourceTool = toolsData.pages.find(page => page.slug === 'ai-image-upscaler');
    const localeTool = toolsEn.pages.find(page => page.slug === 'ai-image-upscaler');
    expect(sourceTool?.technicalSpecs?.supportedFormats).toEqual(
      PRODUCT_CAPABILITIES.directUploadFormats
    );
    expect(localeTool?.technicalSpecs?.supportedFormats).toEqual(
      PRODUCT_CAPABILITIES.directUploadFormats
    );
  });

  it('does not advertise guest upscaling or native animated GIF processing', () => {
    expect(PRODUCT_CAPABILITIES.guestAccess).toBe(false);
    expect(PRODUCT_CAPABILITIES.animatedGifSupported).toBe(false);
    expectNoMatchingClaim(guestUpscaleClaim, 'guest access contradicts PRODUCT_CAPABILITIES');
  });

  it('keeps static owned copy tier-safe instead of hardcoding one regional grant', () => {
    expectNoMatchingClaim(
      hardcodedWelcomeCreditClaim,
      'regional welcome credit copy must not hardcode one tier'
    );
  });

  it('wires the capability source into live landing and pSEO callers', () => {
    const hero = readFileSync('client/components/landing/HeroSection.tsx', 'utf8');
    const signupCta = readFileSync('client/components/landing/SectionSignupCTA.tsx', 'utf8');
    const freeHub = readFileSync('app/(pseo)/free/page.tsx', 'utf8');
    const pseoCta = readFileSync(
      'app/(pseo)/_components/pseo/sections/CTASection.tsx',
      'utf8'
    );

    expect(hero).toContain('welcomeCreditsFor(country)');
    expect(signupCta).toContain('welcomeCreditsForTier');
    expect(freeHub).not.toContain('DEFAULT_FREE_CREDITS');
    expect(pseoCta).toContain('PRODUCT_CAPABILITIES.guestAccess');
  });
});
