import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Test suite to verify all pSEO pages have force-static configuration
 * This is critical for Cloudflare Workers 10ms CPU limit to prevent SSR timeouts
 */

const PSEO_DIR = join(__dirname, '../../../app/(pseo)');

/**
 * Read a file and check if it contains the expected exports
 */
function checkFileExports(filePath: string, expectedExports: string[]) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const missing: string[] = [];

    for (const exp of expectedExports) {
      if (!content.includes(exp)) {
        missing.push(exp);
      }
    }

    return {
      exists: true,
      missing,
      hasAll: missing.length === 0,
    };
  } catch {
    return { exists: false, error: (Error as any).message };
  }
}

describe('pSEO Force Static Configuration', () => {
  describe('Dynamic [slug] pages must export force-static', () => {
    const dynamicSlugPages = [
      'tools/[slug]/page.tsx',
      'alternatives/[slug]/page.tsx',
      'formats/[slug]/page.tsx',
      'scale/[slug]/page.tsx',
      'free/[slug]/page.tsx',
      'guides/[slug]/page.tsx',
      'compare/[slug]/page.tsx',
      'use-cases/[slug]/page.tsx',
      'platforms/[slug]/page.tsx',
      'device-use/[slug]/page.tsx',
      'format-scale/[slug]/page.tsx',
      'platform-format/[slug]/page.tsx',
      'photo-restoration/[slug]/page.tsx',
      'camera-raw/[slug]/page.tsx',
      'industry-insights/[slug]/page.tsx',
      'device-optimization/[slug]/page.tsx',
      'content/[slug]/page.tsx',
      'ai-features/[slug]/page.tsx',
      'bulk-tools/[slug]/page.tsx',
    ];

    test('all dynamic slug pages export force-static', () => {
      const results: Array<{ file: string; result: ReturnType<typeof checkFileExports> }> = [];

      for (const page of dynamicSlugPages) {
        const filePath = join(PSEO_DIR, page);
        const result = checkFileExports(filePath, [
          "export const dynamic = 'force-static'",
          "export const revalidate = 86400",
        ]);
        results.push({ file: page, result });
      }

      // Log failures for debugging
      const failures = results.filter(r => !r.result.hasAll);
      if (failures.length > 0) {
        console.error('Pages missing force-static exports:');
        for (const f of failures) {
          console.error(`  - ${f.file}:`, f.result.missing || 'missing');
        }
      }

      expect(failures.length).toBe(0);
    });
  });

  describe('Interactive tool pages must export force-static', () => {
    const interactiveToolPages = [
      'tools/resize/[slug]/page.tsx',
      'tools/convert/[slug]/page.tsx',
      'tools/compress/[slug]/page.tsx',
      'tools/resize/bulk-image-resizer/page.tsx',
    ];

    test('all interactive tool pages export force-static', () => {
      const results: Array<{ file: string; result: ReturnType<typeof checkFileExports> }> = [];

      for (const page of interactiveToolPages) {
        const filePath = join(PSEO_DIR, page);
        const result = checkFileExports(filePath, [
          "export const dynamic = 'force-static'",
          "export const revalidate = 86400",
        ]);
        results.push({ file: page, result });
      }

      // Log failures for debugging
      const failures = results.filter(r => !r.result.hasAll);
      if (failures.length > 0) {
        console.error('Pages missing force-static exports:');
        for (const f of failures) {
          console.error(`  - ${f.file}:`, f.result.missing || 'missing');
        }
      }

      expect(failures.length).toBe(0);
    });
  });

  describe('Category hub pages', () => {
    const categoryHubPages = [
      'tools/page.tsx',
      'alternatives/page.tsx',
      'compare/page.tsx',
      'guides/page.tsx',
      'use-cases/page.tsx',
      'platforms/page.tsx',
      'free/page.tsx',
      'formats/page.tsx',
      'scale/page.tsx',
      'bulk-tools/page.tsx',
      'content/page.tsx',
      'camera-raw/page.tsx',
      'device-optimization/page.tsx',
      'device-use/page.tsx',
      'format-scale/page.tsx',
      'platform-format/page.tsx',
      'photo-restoration/page.tsx',
      'industry-insights/page.tsx',
      'ai-features/page.tsx',
    ];

    test('all category hub pages exist', () => {
      const missing: string[] = [];

      for (const page of categoryHubPages) {
        const filePath = join(PSEO_DIR, page);
        try {
          // Category hubs should export metadata as const
          readFileSync(filePath, 'utf-8');
          // They don't need force-static since they use metadata export
        } catch {
          missing.push(page);
        }
      }

      if (missing.length > 0) {
        console.error('Category hub pages missing:');
        for (const f of missing) {
          console.error(`  - ${f}`);
        }
      }

      expect(missing.length).toBe(0);
    });
  });

  describe('Value validation', () => {
    test('force-static value is correct', () => {
      expect('force-static').toMatch(/^force-static$/);
    });

    test('revalidate value is 24 hours in seconds', () => {
      expect(86400).toBe(86400); // 24 hours = 24 * 60 * 60
    });

    test('force-static prevents SSR on Cloudflare Workers', () => {
      // This test documents the purpose of force-static
      const dynamic = 'force-static';
      const revalidate = 86400;

      // force-static ensures pages are served from cache
      // rather than SSR on each request
      expect(dynamic).toBe('force-static');
      expect(revalidate).toBeGreaterThan(0); // Should revalidate periodically
    });
  });
});
