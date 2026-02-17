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

// Import the exported constant directly — avoids React rendering complexity
// while still verifying the actual runtime data used by the component.
import { POPULAR_TOOLS } from '../../../client/components/pages/HomePageClient';

const componentPath = path.resolve(
  __dirname,
  '../../../client/components/pages/HomePageClient.tsx'
);
const componentSource = fs.readFileSync(componentPath, 'utf-8');

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
    expect(componentSource).toMatch(/export const POPULAR_TOOLS/);
  });

  it('component renders a section with the Popular Tools heading', () => {
    expect(componentSource).toContain('Pick a Tool');
  });

  it('component maps POPULAR_TOOLS to Link elements', () => {
    // The section must use POPULAR_TOOLS in a map call
    expect(componentSource).toMatch(/POPULAR_TOOLS\.map/);
  });

  it('no hardcoded hex or rgb colors are used in the new section', () => {
    // Scan only the popular tools section between the section comment and the next section comment
    const popularSection = componentSource.slice(
      componentSource.indexOf('Popular Tools Section'),
      componentSource.indexOf('Landing Page Sections')
    );
    expect(popularSection).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(popularSection).not.toMatch(/rgb\(/);
    expect(popularSection).not.toMatch(/rgba\(/);
  });
});
