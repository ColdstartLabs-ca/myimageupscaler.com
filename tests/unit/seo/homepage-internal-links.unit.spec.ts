/**
 * Homepage Internal Links Tests
 *
 * Guards against regressions in the "Popular Tools" section that distributes
 * link equity from the homepage to high-value pSEO pages.
 *
 * These links are critical for internal linking SEO: removing or changing them
 * silently kills link equity flow to the target pages. Tests are the safety net.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

// Import the exported constant directly — avoids React rendering complexity
// while still verifying the actual runtime data used by the component.
import { POPULAR_TOOLS } from '../../../client/components/landing/popularTools.data';

const componentPath = path.resolve(
  __dirname,
  '../../../client/components/landing/PopularToolsSection.tsx'
);
const dataPath = path.resolve(__dirname, '../../../client/components/landing/popularTools.data.ts');
const homePageClientPath = path.resolve(
  __dirname,
  '../../../client/components/pages/HomePageClient.tsx'
);
const componentSource = fs.readFileSync(componentPath, 'utf-8');
const dataSource = fs.readFileSync(dataPath, 'utf-8');
const homePageClientSource = fs.readFileSync(homePageClientPath, 'utf-8');

// ============================================================================
// A) POPULAR_TOOLS data integrity
// ============================================================================

describe('Homepage Internal Links — POPULAR_TOOLS data', () => {
  it('should contain exactly 6 tool entries', () => {
    expect(POPULAR_TOOLS).toHaveLength(6);
  });

  it('every entry must have a non-empty href, label, and desc', () => {
    for (const tool of POPULAR_TOOLS) {
      expect(tool.href).toBeTruthy();
      expect(tool.label).toBeTruthy();
      expect(tool.desc).toBeTruthy();
    }
  });

  it('every href must start with /', () => {
    for (const tool of POPULAR_TOOLS) {
      expect(tool.href).toMatch(/^\//);
    }
  });

  it('no duplicate hrefs', () => {
    const hrefs = POPULAR_TOOLS.map(t => t.href);
    const unique = new Set(hrefs);
    expect(unique.size).toBe(hrefs.length);
  });
});

// ============================================================================
// B) Required link targets — critical pSEO pages
// ============================================================================

describe('Homepage Internal Links — required destinations', () => {
  const hrefs = POPULAR_TOOLS.map(t => t.href);

  it('homepage contains link to ai-image-upscaler', () => {
    expect(hrefs).toContain('/tools/ai-image-upscaler');
  });

  it('homepage contains link to free hub', () => {
    expect(hrefs).toContain('/free');
  });

  it('homepage contains link to transparent-background-maker', () => {
    expect(hrefs).toContain('/tools/transparent-background-maker');
  });

  it('homepage contains link to ai-photo-enhancer', () => {
    expect(hrefs).toContain('/tools/ai-photo-enhancer');
  });

  it('homepage contains link to ai-background-remover', () => {
    expect(hrefs).toContain('/tools/ai-background-remover');
  });

  it('homepage contains link to AVIF upscaler format page', () => {
    expect(hrefs).toContain('/formats/upscale-avif-images');
  });
});

// ============================================================================
// C) Component structure — verify Next.js Link is used (not plain <a>)
// ============================================================================

describe('Homepage Internal Links — component structure', () => {
  it('component imports Link from next/link', () => {
    expect(componentSource).toMatch(/import Link from ['"]next\/link['"]/);
  });

  it('POPULAR_TOOLS is exported so tests can import it', () => {
    expect(dataSource).toMatch(/export const POPULAR_TOOLS/);
    expect(homePageClientSource).toMatch(/export \{ POPULAR_TOOLS \}/);
  });

  it('component renders a section with the Popular Tools heading', () => {
    expect(componentSource).toContain('pick a tool');
  });

  it('component maps POPULAR_TOOLS to Link elements', () => {
    // The section must use POPULAR_TOOLS in a map call
    expect(componentSource).toMatch(/POPULAR_TOOLS\.map/);
  });

  it('no hardcoded hex or rgb colors are used in the new section', () => {
    expect(componentSource).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(componentSource).not.toMatch(/rgb\(/);
    expect(componentSource).not.toMatch(/rgba\(/);
  });
});

// ============================================================================
// D) Homepage "From the Blog" section
// ============================================================================

describe('Homepage "From the Blog" section', () => {
  const homePagePath = path.resolve(ROOT, 'app/[locale]/page.tsx');
  const homePageSource = fs.readFileSync(homePagePath, 'utf-8');

  it('imports LandingBlogSection', () => {
    expect(homePageSource).toContain('LandingBlogSection');
    expect(homePageSource).toMatch(/import.*LandingBlogSection.*from/);
  });

  it('selects curated homepage posts through the SEO equity helper', () => {
    expect(homePageSource).toContain("import { getHomepageBlogPicks } from '@lib/seo/seo-equity'");
    expect(homePageSource).toContain('getHomepageBlogPicks(undefined, 4)');
  });

  it('renders LandingBlogSection with homepage blog slugs', () => {
    expect(homePageSource).toContain('<LandingBlogSection');
    expect(homePageSource).toContain('blogPostSlugs={homepageBlogSlugs}');
  });
});
