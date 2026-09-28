/**
 * pSEO final-CTA contract.
 *
 * Audit 2026-09-28: InteractiveToolPageTemplate hardcoded an upscaler signup pitch and
 * CTASection always appended "Start upscaling today" + credit trust copy, so free
 * in-browser tools (/tools/remove-bg) ended on an unrelated signup CTA. The Generic
 * template used the page description as the CTA heading and repeated it underneath.
 *
 * Contract: a page may define ctaTitle / ctaHighlightText / ctaDescription /
 * ctaTrustItems (with ctaText + ctaUrl) and only templates that honor them may carry
 * them. Pages without them keep the template's default upscaler CTA.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import aiFeaturesData from '@/app/seo/data/ai-features.json';
import interactiveToolsData from '@/app/seo/data/interactive-tools.json';
import toolsData from '@/app/seo/data/tools.json';
import enPseoMessages from '@/locales/en/pseo.json';
import type { IToolPage, PSEOPage } from '@/lib/seo/pseo-types';
import { CTASection } from '@/app/(pseo)/_components/pseo/sections/CTASection';
import { GenericPSEOPageTemplate } from '@/app/(pseo)/_components/pseo/templates/GenericPSEOPageTemplate';
import { InteractiveToolPageTemplate } from '@/app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
// Page trackers call other analytics methods; only `track` is asserted.
vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: new Proxy(
    { track },
    { get: (target, key) => (key === 'track' ? target.track : vi.fn()) }
  ),
}));
vi.mock('@client/hooks/useRegionTier', () => ({ useRegionTier: () => ({ tier: null }) }));
vi.mock('@client/components/landing/AmbientBackground', () => ({ AmbientBackground: () => null }));
vi.mock('@/app/(pseo)/_components/tools/BackgroundRemover', () => ({
  BackgroundRemover: () => <div data-testid="background-remover-widget" />,
}));
vi.mock('@/app/(pseo)/_components/tools/FormatConverter', () => ({
  FormatConverter: () => <div data-testid="format-converter-widget" />,
}));

// framer-motion whileInView needs IntersectionObserver, which jsdom lacks.
class IntersectionObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);

function withIntl(ui: React.ReactElement): React.ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={{ pseo: enPseoMessages }}>
      {ui}
    </NextIntlClientProvider>
  );
}

function finalCta(): HTMLElement {
  const sections = document.querySelectorAll('section');
  return sections[sections.length - 1] as HTMLElement;
}

beforeEach(() => track.mockClear());

describe('CTASection', () => {
  it('keeps the upscaler defaults and free-offer trust row when a page has no overrides', () => {
    render(<CTASection title="Ready?" description="Desc" ctaText="Try Free" ctaUrl="/" />);

    expect(screen.getByText('Start upscaling today')).toBeInTheDocument();
    expect(screen.getByText('No credit card required')).toBeInTheDocument();
    expect(screen.getByText('No watermarks')).toBeInTheDocument();
  });

  it('lets a page replace the highlighted line and trust row', () => {
    render(
      <CTASection
        title="Ready for a clean cutout?"
        highlightText="Remove your background free"
        description="Desc"
        ctaText="Remove Background Free"
        ctaUrl="#tool"
        trustItems={['Free to use', 'No account required']}
      />
    );

    expect(screen.getByText('Remove your background free')).toBeInTheDocument();
    expect(screen.queryByText('Start upscaling today')).not.toBeInTheDocument();
    expect(screen.getByText('No account required')).toBeInTheDocument();
    expect(screen.queryByText('No credit card required')).not.toBeInTheDocument();
    expect(screen.queryByText('No watermarks')).not.toBeInTheDocument();
  });

  it('tracks pseo_cta_clicked with page type, slug and element id', () => {
    render(
      <CTASection
        title="t"
        description="d"
        ctaText="Go"
        ctaUrl="#tool"
        pageType="tool"
        slug="remove-bg"
      />
    );

    fireEvent.click(screen.getByRole('link', { name: /Go/ }));

    expect(track).toHaveBeenCalledWith('pseo_cta_clicked', {
      pageType: 'tool',
      slug: 'remove-bg',
      elementType: 'cta',
      elementId: 'bottom-cta',
    });
  });
});

describe('InteractiveToolPageTemplate final CTA', () => {
  it('uses the page CTA on /tools/remove-bg and returns to the widget anchor', () => {
    const page = toolsData.pages.find(p => p.slug === 'remove-bg') as unknown as IToolPage;
    render(withIntl(<InteractiveToolPageTemplate data={page} />));

    const cta = within(finalCta());
    const link = cta.getByRole('link', { name: /Remove Background Free/ });
    const target = document.getElementById(link.getAttribute('href')!.replace(/^#/, ''));

    expect(link.getAttribute('href')).toMatch(/^#/);
    expect(target).not.toBeNull();
    expect(within(target!).getByTestId('background-remover-widget')).toBeInTheDocument();
    expect(cta.getByRole('heading', { level: 2 })).toHaveTextContent('Ready for a clean cutout?');
    expect(cta.getByText('Remove your background free')).toBeInTheDocument();
    expect(cta.getByText('Processed in your browser')).toBeInTheDocument();
    expect(cta.queryByText('Start upscaling today')).not.toBeInTheDocument();
  });

  it('keeps the upscaler signup CTA for interactive pages without a page CTA', () => {
    const page = interactiveToolsData.pages.find(
      p => p.slug === 'png-to-jpg'
    ) as unknown as IToolPage;
    render(withIntl(<InteractiveToolPageTemplate data={page} />));

    const link = within(finalCta()).getByRole('link', { name: /Try AI Image Upscaler/ });
    expect(link).toHaveAttribute('href', '/?signup=1');
    expect(document.getElementById('tool')).not.toBeNull();
  });
});

describe('GenericPSEOPageTemplate final CTA', () => {
  it('does not reuse the description paragraph as the CTA heading', () => {
    const page = {
      ...aiFeaturesData.pages[0],
      category: 'ai-features',
    } as unknown as PSEOPage;
    render(<GenericPSEOPageTemplate data={page} />);

    const heading = within(finalCta()).getByRole('heading', { level: 2 });
    expect(heading.textContent).not.toContain(aiFeaturesData.pages[0].description);
    expect(heading).toHaveTextContent(aiFeaturesData.pages[0].title);
  });
});

// ---------------------------------------------------------------------------
// Data validation: every English + localized pSEO data file
// ---------------------------------------------------------------------------

const EXTENDED_CTA_FIELDS = ['ctaTitle', 'ctaHighlightText', 'ctaDescription', 'ctaTrustItems'];
// Data files whose templates honor the extended CTA fields.
const TOOL_FILES = ['tools', 'interactive-tools', 'social-media-resize', 'format-conversion'];
const GENERIC_FILES = [
  'ai-features',
  'bulk-tools',
  'camera-raw',
  'comparisons-expanded',
  'content',
  'device-optimization',
  'industry-insights',
  'personas-expanded',
  'photo-restoration',
  'technical-guides',
  'use-cases-expanded',
];

interface IDataPage {
  slug: string;
  isInteractive?: boolean;
  toolComponent?: string;
  ctaText?: unknown;
  ctaUrl?: unknown;
  ctaTitle?: unknown;
  ctaHighlightText?: unknown;
  ctaDescription?: unknown;
  ctaTrustItems?: unknown;
}

const dataFiles = [
  ...readdirSync('app/seo/data').map(name => `app/seo/data/${name}`),
  // Generic categories are English-only; their locale copies are never loaded.
  ...readdirSync('locales').flatMap(locale =>
    readdirSync(`locales/${locale}`)
      .filter(name => !GENERIC_FILES.includes(name.replace(/\.json$/, '')))
      .map(name => `locales/${locale}/${name}`)
  ),
].filter(file => file.endsWith('.json'));

const pagesByFile = dataFiles.flatMap(file => {
  const pages = (JSON.parse(readFileSync(file, 'utf8')) as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) return [];
  const name = file
    .split('/')
    .pop()!
    .replace(/\.json$/, '');
  return pages.map(page => ({ file, name, page: page as IDataPage }));
});

const pathOf = (url: unknown): string => String(url).split(/[?#]/)[0];

describe('pSEO CTA data', () => {
  it('only defines extended CTA fields where the template renders them, and completely', () => {
    const errors: string[] = [];
    for (const { file, name, page } of pagesByFile) {
      const extended = EXTENDED_CTA_FIELDS.filter(field => field in page);
      if (extended.length === 0) continue;
      const where = `${file}#${page.slug}`;

      if (!TOOL_FILES.includes(name) && !GENERIC_FILES.includes(name)) {
        errors.push(`${where}: ${extended.join(', ')} ignored by this template`);
      }
      for (const field of ['ctaTitle', 'ctaText', 'ctaUrl'] as const) {
        if (typeof page[field] !== 'string' || !(page[field] as string).trim()) {
          errors.push(`${where}: ${field} required with a page CTA`);
        }
      }
      for (const field of ['ctaHighlightText', 'ctaDescription'] as const) {
        if (field in page && (typeof page[field] !== 'string' || !(page[field] as string).trim())) {
          errors.push(`${where}: ${field} must be non-empty`);
        }
      }
      if ('ctaTrustItems' in page) {
        const items = page.ctaTrustItems;
        const valid =
          Array.isArray(items) &&
          items.length >= 1 &&
          items.length <= 3 &&
          items.every(item => typeof item === 'string' && item.trim()) &&
          new Set(items).size === items.length;
        if (!valid) errors.push(`${where}: ctaTrustItems must be 1-3 unique non-empty strings`);
      }
      // A tool page CTA must never reload the page it sits on (any route variant).
      if (TOOL_FILES.includes(name) && pathOf(page.ctaUrl).endsWith(`/${page.slug}`)) {
        errors.push(`${where}: ctaUrl ${String(page.ctaUrl)} reloads the page`);
      }
    }
    expect(errors).toEqual([]);
  });

  it('points rendered CTAs at a real destination, never the page itself', () => {
    const errors: string[] = [];
    for (const { file, name, page } of pagesByFile) {
      if (page.ctaUrl === undefined) continue;
      const url = String(page.ctaUrl);
      const where = `${file}#${page.slug}`;

      if (url.startsWith('#')) {
        if (url !== '#tool' || !page.isInteractive || !page.toolComponent) {
          errors.push(`${where}: ${url} is not the interactive tool anchor`);
        }
      } else if (!url.startsWith('/')) {
        errors.push(`${where}: ${url} must be a site path or #tool`);
      }
      if (GENERIC_FILES.includes(name) && pathOf(url) === `/${name}/${page.slug}`) {
        errors.push(`${where}: ${url} reloads the page`);
      }
    }
    expect(errors).toEqual([]);
  });
});
