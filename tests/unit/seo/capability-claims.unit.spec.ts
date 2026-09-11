import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
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

// Spelled-out grants are the same twin constant in word form, so both forms are caught.
const hardcodedWelcomeCreditClaim =
  /\b(?:3|5|10|three|five|ten)\s+(?:free\s+)?(?:welcome\s+)?credits\b/i;
const guestUpscaleClaim =
  /\b(?:no\s+(?:sign[ -]?up|account)(?:\s+(?:needed|required))?|without\s+(?:an\s+)?account|without\s+signing\s+up)\b/i;
const accountBackedToolSlugs = new Set([
  'ai-image-upscaler',
  'ai-photo-enhancer',
  'photo-quality-enhancer',
]);

/** The "can I upscale animated GIFs?" FAQ entry, in every language we publish. */
const animatedGifQuestion = /animated|animierte|animad|animé|アニメ/i;

/**
 * An affirmative opener on that answer. The shipped answer redirects to a
 * frame-aware editor, so a locale opening with "yes" has drifted back to the
 * false promise the source data already retired.
 */
const animatedGifPromise = /^\s*¡?\s*(?:yes|ja|s[ií]|sim|oui|はい)\s*[!,.！]/i;

/**
 * Pages whose copy describes a browser-side tool and therefore may honestly say
 * "no signup". Every other page is account-backed: upscaling requires an account.
 *
 * A page declaring `toolComponent` is browser-side by construction (the component
 * runs in the visitor's browser). `free-background-remover` is the one page that
 * describes the browser background remover without embedding it, so it is listed here.
 */
const BROWSER_SIDE_SLUGS = new Set(['free-background-remover']);

/** Locale documents that are chrome for browser-side tools, not acquisition copy. */
const BROWSER_TOOL_UI_DOCS = new Set(['tools-ui.json']);

interface IPageRecord {
  slug?: string;
  toolComponent?: string;
  competitorName?: string;
  products?: { name?: string }[];
  [key: string]: unknown;
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function claimSourceFiles(): string[] {
  return [
    ...readdirSync('app/seo/data')
      .filter(name => name.endsWith('.json'))
      .map(name => path.join('app/seo/data', name)),
    ...readdirSync('locales/en')
      .filter(name => name.endsWith('.json') && !BROWSER_TOOL_UI_DOCS.has(name))
      .map(name => path.join('locales/en', name)),
  ].sort();
}

function isBrowserSide(page: IPageRecord): boolean {
  return Boolean(page.toolComponent) || BROWSER_SIDE_SLUGS.has(page.slug ?? '');
}

/** Competitor-owned subtrees state competitor facts, which are not our claims. */
function isCompetitorPath(claimPath: string): boolean {
  return (
    /^\$\.products\[(?!0\])\d+\]/.test(claimPath) ||
    /\.competitor(Pricing|Name)?(\[|\.|$)/.test(claimPath)
  );
}

function competitorNames(page: IPageRecord): string[] {
  return [
    page.competitorName,
    ...(page.products ?? []).slice(1).map(product => product?.name),
  ].filter((name): name is string => Boolean(name));
}

/** Competitor names stated by our own comparison data — never retyped by hand. */
function derivedCompetitorNames(): string[] {
  const alternatives = readJson('app/seo/data/alternatives.json') as { pages: IPageRecord[] };
  const head2head = readJson('app/seo/data/competitor-comparisons.json') as {
    pages: IPageRecord[];
  };

  return [
    ...alternatives.pages.flatMap(page => competitorNames(page)),
    ...head2head.pages.flatMap(page => competitorNames(page)),
  ];
}

/**
 * A segment is ours unless it names a competitor, so a competitor's own terms stay
 * their fact while our copy is held to the shipped policy.
 *
 * Granularity matters. A credit count needs comma-clause scope to separate
 * "MyImageUpscaler offers … , while VanceAI only provides 3 credits per month".
 * A guest-access claim needs line scope, because a markdown comparison row
 * ("| Free option | waifu2x | Free, no account needed |") puts the competitor's
 * name and their claim in separate comma-clauses of the same row.
 */
function statesOurClaim(
  text: string,
  pattern: RegExp,
  competitors: string[],
  scope: 'clause' | 'line'
): boolean {
  const segments =
    scope === 'clause'
      ? text.split(/(?:[,;.!?]|\n|\s+—\s+|\bwhile\b|\bwhereas\b|\bbut\b)/i)
      : text.split(/\n+/);

  return segments.some(
    segment =>
      pattern.test(segment) &&
      !competitors.some(name => segment.toLowerCase().includes(name.toLowerCase()))
  );
}

/**
 * A credit count belongs to a competitor when the clause stating it names that
 * competitor ("…while VanceAI only provides 3 credits per month").
 */
function statesOurCreditCount(text: string, competitors: string[]): boolean {
  return statesOurClaim(text, hardcodedWelcomeCreditClaim, competitors, 'clause');
}

/** Published blog bodies served by blog.service.ts when Supabase has no row. */
function sweepPublishedBlogBodies(): IViolation[] {
  const competitors = derivedCompetitorNames();
  const { posts } = readJson('content/blog-data.json') as {
    posts: { slug: string; [key: string]: unknown }[];
  };

  return posts.flatMap(post =>
    textClaims(post, 'content/blog-data.json')
      .filter(
        claim =>
          statesOurClaim(claim.text, hardcodedWelcomeCreditClaim, competitors, 'clause') ||
          statesOurClaim(claim.text, guestUpscaleClaim, competitors, 'line')
      )
      .map(claim => ({ ...claim, slug: post.slug }))
  );
}

interface IViolation extends TextClaim {
  slug: string;
}

function sweepAllOwnedCopy(): { guest: IViolation[]; credits: IViolation[] } {
  const guest: IViolation[] = [];
  const credits: IViolation[] = [];

  for (const file of claimSourceFiles()) {
    const parsed = readJson(file) as { pages?: unknown };
    const pages = Array.isArray(parsed?.pages) ? (parsed.pages as IPageRecord[]) : null;
    const units: IPageRecord[] = pages ?? [parsed as IPageRecord];

    for (const page of units) {
      if (!page || typeof page !== 'object') continue;
      const slug = page.slug ?? '(document)';
      const competitors = competitorNames(page);

      for (const claim of textClaims(page, file)) {
        if (isCompetitorPath(claim.path)) continue;

        if (!isBrowserSide(page) && guestUpscaleClaim.test(claim.text)) {
          guest.push({ ...claim, slug });
        }
        if (
          hardcodedWelcomeCreditClaim.test(claim.text) &&
          statesOurCreditCount(claim.text, competitors)
        ) {
          credits.push({ ...claim, slug });
        }
      }
    }
  }

  return { guest, credits };
}

function report(label: string, violations: IViolation[]): string {
  return [
    `${label} (${violations.length}):`,
    ...violations
      .slice(0, 12)
      .map(v => `  ${v.source} [${v.slug}] ${v.path} => ${JSON.stringify(v.text)}`),
  ].join('\n');
}

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
    throw new Error(
      `${label}: ${offender.source}:${offender.path} => ${JSON.stringify(offender.text)}`
    );
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
    const pseoCta = readFileSync('app/(pseo)/_components/pseo/sections/CTASection.tsx', 'utf8');

    expect(hero).toContain('welcomeCreditsFor(country)');
    expect(signupCta).toContain('welcomeCreditsForTier');
    expect(freeHub).not.toContain('DEFAULT_FREE_CREDITS');
    expect(pseoCta).toContain('PRODUCT_CAPABILITIES.guestAccess');
  });

  describe('every pSEO surface, not just the audited slice', () => {
    it('sweeps every pSEO data file and English locale document', () => {
      const files = claimSourceFiles();
      expect(files).toContain('app/seo/data/alternatives.json');
      expect(files).toContain('app/seo/data/competitor-comparisons.json');
      expect(files).toContain('app/seo/data/scale.json');
      expect(files).toContain('locales/en/terms.json');
      expect(files.length).toBeGreaterThan(30);
    });

    it('never tells a visitor they can upscale without an account', () => {
      const { guest } = sweepAllOwnedCopy();
      expect(guest, report('account-backed pages advertising guest access', guest)).toEqual([]);
    });

    it('never hardcodes one region’s welcome credit grant in our own copy', () => {
      const { credits } = sweepAllOwnedCopy();
      expect(credits, report('copy hardcoding a regional grant', credits)).toEqual([]);
    });

    it('holds published blog bodies to the same shipped policy', () => {
      const violations = sweepPublishedBlogBodies();
      expect(
        violations,
        report('published blog bodies contradicting the product', violations)
      ).toEqual([]);
    });

    it('never promises animated GIF processing, in any locale', () => {
      expect(PRODUCT_CAPABILITIES.animatedGifSupported).toBe(false);

      const gifFiles = [
        'app/seo/data/formats.json',
        ...readdirSync('locales').map(locale => path.join('locales', locale, 'formats.json')),
      ].filter(existsSync);

      const offenders = gifFiles.flatMap(file => {
        const { pages } = readJson(file) as { pages?: IPageRecord[] };
        return (pages ?? [])
          .filter(page => page.slug === 'upscale-gif-images')
          .flatMap((page, pageIndex) =>
            ((page.faq as { question?: string; answer?: string }[] | undefined) ?? [])
              .map((entry, faqIndex) => ({ entry, faqIndex, pageIndex }))
              .filter(({ entry }) => animatedGifQuestion.test(entry.question ?? ''))
              .filter(({ entry }) => animatedGifPromise.test(entry.answer ?? ''))
              .map(({ entry, faqIndex, pageIndex: index }) => ({
                source: file,
                path: `$.pages[${index}].faq[${faqIndex}].answer`,
                text: entry.answer ?? '',
                slug: 'upscale-gif-images',
              }))
          );
      });

      expect(offenders, report('locales promising animated GIF processing', offenders)).toEqual([]);
    });

    it('still reads competitor credit facts as theirs, not ours', () => {
      const competitorPage = (
        readJson('app/seo/data/competitor-comparisons.json') as { pages: IPageRecord[] }
      ).pages.find(page => page.slug?.includes('vanceai'));

      expect(competitorPage).toBeDefined();
      expect(competitorNames(competitorPage as IPageRecord).length).toBeGreaterThan(0);
      expect(
        statesOurCreditCount(
          'MyImageUpscaler offers welcome credits after signup, while VanceAI only provides 3 credits per month.',
          ['VanceAI']
        )
      ).toBe(false);
      expect(statesOurCreditCount('Premium AI upscaling with 5 free credits', ['VanceAI'])).toBe(
        true
      );
    });
  });
});
