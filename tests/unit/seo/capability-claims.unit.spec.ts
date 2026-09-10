import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import freeData from '@/app/seo/data/free.json';
import toolsData from '@/app/seo/data/tools.json';
import comparisonData from '@/app/seo/data/comparison.json';
import commonEn from '@/locales/en/common.json';
import { CREDIT_COSTS } from '@shared/config/credits.config';
import { MODEL_COSTS } from '@shared/config/model-costs.config';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';
import {
  PRODUCT_CAPABILITIES,
  welcomeCreditsFor,
  welcomeCreditsForTier,
} from '@shared/config/product-capabilities';

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

const hardcodedWelcomeCreditClaim = /\b(?:3|5|10)\s+(?:free\s+)?credits\b/i;
const guestUpscaleClaim = /\b(?:no\s+(?:sign[ -]?up|account)(?:\s+needed|required)?|without\s+(?:an\s+)?account|without\s+signing\s+up)\b/i;

function ownUpscalerStaticCopy(): string[] {
  const freeUpscalerPages = freeData.pages.filter(page => page.slug !== 'free-background-remover');
  const toolUpscaler = toolsData.pages.find(page => page.slug === 'ai-image-upscaler');
  const comparisonProductCopy = namedMyImageUpscaler(comparisonData);

  return [
    ...textValues(freeUpscalerPages),
    ...textValues(toolUpscaler),
    ...comparisonProductCopy.flatMap(textValues),
    ...textValues(commonEn.homepage),
  ];
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
  });

  it('does not advertise guest upscaling or native animated GIF processing', () => {
    expect(PRODUCT_CAPABILITIES.guestAccess).toBe(false);
    expect(PRODUCT_CAPABILITIES.animatedGifSupported).toBe(false);

    for (const text of ownUpscalerStaticCopy()) {
      expect(text).not.toMatch(guestUpscaleClaim);
    }
  });

  it('keeps static owned copy tier-safe instead of hardcoding one regional grant', () => {
    for (const text of ownUpscalerStaticCopy()) {
      expect(text).not.toMatch(hardcodedWelcomeCreditClaim);
    }
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
