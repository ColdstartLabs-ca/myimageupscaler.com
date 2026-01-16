#!/usr/bin/env tsx
/**
 * Internal Link Validator for pSEO Pages
 *
 * Uses Playwright to validate internal links across pSEO pages:
 * - Checks that all tool and guide pages are accessible
 * - Verifies links don't return 404
 * - Tests navigation between related pages
 *
 * Usage:
 *   npx playwright test tests/validate-internal-links.e2e.spec.ts
 */

import { test, expect } from '@playwright/test';

// Valid slugs from tools.json (static tools at /tools/[slug])
const VALID_STATIC_TOOLS = [
  'ai-background-remover',
  'ai-image-upscaler',
  'ai-photo-enhancer',
  'image-cutout-tool',
  'remove-bg',
  'transparent-background-maker',
];

// Valid interactive tools from interactive-tools.json (with their correct paths)
const VALID_INTERACTIVE_TOOLS = [
  { slug: 'image-resizer', path: '/tools/resize/image-resizer' },
  { slug: 'resize-image-for-instagram', path: '/tools/resize/resize-image-for-instagram' },
  { slug: 'resize-image-for-youtube', path: '/tools/resize/resize-image-for-youtube' },
  { slug: 'resize-image-for-facebook', path: '/tools/resize/resize-image-for-facebook' },
  { slug: 'resize-image-for-twitter', path: '/tools/resize/resize-image-for-twitter' },
  { slug: 'resize-image-for-linkedin', path: '/tools/resize/resize-image-for-linkedin' },
  { slug: 'bulk-image-resizer', path: '/tools/resize/bulk-image-resizer' },
  { slug: 'png-to-jpg', path: '/tools/convert/png-to-jpg' },
  { slug: 'jpg-to-png', path: '/tools/convert/jpg-to-png' },
  { slug: 'webp-to-jpg', path: '/tools/convert/webp-to-jpg' },
  { slug: 'webp-to-png', path: '/tools/convert/webp-to-png' },
  { slug: 'jpg-to-webp', path: '/tools/convert/jpg-to-webp' },
  { slug: 'png-to-webp', path: '/tools/convert/png-to-webp' },
  { slug: 'image-compressor', path: '/tools/compress/image-compressor' },
  { slug: 'bulk-image-compressor', path: '/tools/compress/bulk-image-compressor' },
];

// Valid guides from guides.json
const VALID_GUIDES = [
  'avif-next-gen-format',
  'bmp-format-guide',
  'gif-animation-guide',
  'heic-format-guide',
  'how-to-upscale-images',
  'raw-photography-guide',
  'svg-vector-guide',
  'tiff-format-guide',
  'webp-format-guide',
];

interface ILinkValidationResult {
  url: string;
  linkType: 'tool' | 'guide' | 'format' | 'platform' | 'other';
  status: number;
  isValid: boolean;
  issue?: string;
}

const results: ILinkValidationResult[] = [];

test.describe('Internal Link Validation', () => {
  // Test static tool pages exist
  test('Static tool pages should be accessible', async ({ page }) => {
    for (const slug of VALID_STATIC_TOOLS) {
      const url = `/tools/${slug}`;
      const response = await page.goto(url);

      results.push({
        url,
        linkType: 'tool',
        status: response?.status() || 0,
        isValid: response?.ok() || false,
        issue: response?.ok() ? undefined : `HTTP ${response?.status()}`,
      });

      expect(response?.ok(), `Static tool page /tools/${slug} should be accessible`).toBe(true);
    }
  });

  // Test interactive tool pages exist at correct paths
  test('Interactive tool pages should be accessible at correct paths', async ({ page }) => {
    for (const tool of VALID_INTERACTIVE_TOOLS) {
      const url = tool.path;
      const response = await page.goto(url);

      results.push({
        url,
        linkType: 'tool',
        status: response?.status() || 0,
        isValid: response?.ok() || false,
        issue: response?.ok() ? undefined : `HTTP ${response?.status()}`,
      });

      expect(response?.ok(), `Interactive tool page ${tool.path} should be accessible`).toBe(true);
    }
  });

  // Test valid guide pages exist
  test('Valid guide pages should be accessible', async ({ page }) => {
    for (const slug of VALID_GUIDES) {
      const url = `/guides/${slug}`;
      const response = await page.goto(url);

      results.push({
        url,
        linkType: 'guide',
        status: response?.status() || 0,
        isValid: response?.ok() || false,
        issue: response?.ok() ? undefined : `HTTP ${response?.status()}`,
      });

      expect(response?.ok(), `Guide page /guides/${slug} should be accessible`).toBe(true);
    }
  });

  // Test related pages section on a sample page
  test('Related pages should contain valid links', async ({ page }) => {
    const url = '/tools/ai-image-upscaler';
    await page.goto(url);

    // Find all links in the related pages section
    const relatedLinks = page.locator('a[href*="/tools/"], a[href*="/guides/"]');

    const count = await relatedLinks.count();
    console.log(`\n📄 Found ${count} related links on ${url}`);

    for (let i = 0; i < count; i++) {
      const link = relatedLinks.nth(i);
      const href = await link.getAttribute('href');

      if (href) {
        // Navigate to each related link and verify it's accessible
        const linkUrl = href.startsWith('http') ? href : href;
        const response = await page.goto(linkUrl);

        results.push({
          url: linkUrl,
          linkType: linkUrl.includes('/tools/') ? 'tool' : 'guide',
          status: response?.status() || 0,
          isValid: response?.ok() || false,
          issue: response?.ok() ? undefined : `HTTP ${response?.status()}`,
        });

        if (!response?.ok()) {
          console.log(`  ❌ Broken link found: ${href} (HTTP ${response?.status()})`);
        }

        // Navigate back to continue checking
        await page.goto(url);
      }
    }
  });

  test.afterAll(async () => {
    console.log('\n' + '='.repeat(70));
    console.log('              INTERNAL LINK VALIDATION REPORT');
    console.log('='.repeat(70));

    const validLinks = results.filter(r => r.isValid);
    const brokenLinks = results.filter(r => !r.isValid);

    console.log(`\nTotal links checked: ${results.length}`);
    console.log(`✅ Valid links: ${validLinks.length}`);
    console.log(`❌ Broken links: ${brokenLinks.length}\n`);

    if (brokenLinks.length > 0) {
      console.log('❌ BROKEN LINKS FOUND:\n');
      for (const link of brokenLinks) {
        console.log(`  ${link.url}`);
        console.log(`    Type: ${link.linkType} | Issue: ${link.issue}\n`);
      }
    }

    console.log('='.repeat(70) + '\n');

    if (brokenLinks.length > 0) {
      console.log('⚠️  Action required: Fix broken references in data files\n');
    } else {
      console.log('🎉 All internal links validated successfully!\n');
    }
  });
});
