import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  COMPRESS_SLUGS,
  CONVERSION_SLUGS,
  INTERACTIVE_TOOL_PATHS,
  LOCALIZED_INTERACTIVE_SLUGS,
  RESIZE_SLUGS,
} from '@/lib/seo/interactive-tool-routes';

const ROOT = path.resolve(__dirname, '../../..');
const routeFiles = {
  resize: [
    'app/(pseo)/tools/resize/[slug]/page.tsx',
    'app/[locale]/(pseo)/tools/resize/[slug]/page.tsx',
  ],
  convert: [
    'app/(pseo)/tools/convert/[slug]/page.tsx',
    'app/[locale]/(pseo)/tools/convert/[slug]/page.tsx',
  ],
  compress: [
    'app/(pseo)/tools/compress/[slug]/page.tsx',
    'app/[locale]/(pseo)/tools/compress/[slug]/page.tsx',
  ],
} as const;

const read = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('interactive tool route contracts', () => {
  it('should expose the same resize slugs in English and locale routes', () => {
    for (const file of routeFiles.resize) {
      expect(read(file), file).toMatch(
        /import\s*\{[^}]*RESIZE_SLUGS[^}]*\}\s*from\s*['"]@\/lib\/seo\/interactive-tool-routes['"]/s
      );
      expect(read(file), file).not.toMatch(/const\s+RESIZE_SLUGS\s*=\s*\[/);
    }
    expect(RESIZE_SLUGS).toHaveLength(12);
    expect(RESIZE_SLUGS).toContain('resize-image-for-telegram');
  });

  it('should use the shared conversion and compression slug lists in all route files', () => {
    for (const file of [...routeFiles.convert, ...routeFiles.compress]) {
      const source = read(file);
      const exportName = file.includes('/convert/') ? 'CONVERSION_SLUGS' : 'COMPRESS_SLUGS';
      expect(source, file).toMatch(
        new RegExp(
          `import\\s*\\{[^}]*${exportName}[^}]*\\}\\s*from\\s*['"]@/lib/seo/interactive-tool-routes['"]`,
          's'
        )
      );
      expect(source, file).not.toMatch(new RegExp(`const\\s+${exportName}\\s*=\\s*\\[`));
    }
    expect(CONVERSION_SLUGS).toHaveLength(10);
    expect(COMPRESS_SLUGS).toHaveLength(2);
  });

  it('should route every sitemap-advertised interactive tool path', () => {
    const allSlugs = new Set([...RESIZE_SLUGS, ...CONVERSION_SLUGS, ...COMPRESS_SLUGS]);
    for (const slug of Object.keys(INTERACTIVE_TOOL_PATHS)) {
      expect(allSlugs.has(slug), `missing route declaration for ${slug}`).toBe(true);
    }
    expect(Object.keys(INTERACTIVE_TOOL_PATHS)).toHaveLength(allSlugs.size);
  });

  it('should mark untranslated interactive tools noindex, not 404', () => {
    const untranslated = [...RESIZE_SLUGS, ...CONVERSION_SLUGS, ...COMPRESS_SLUGS].filter(
      slug =>
        !LOCALIZED_INTERACTIVE_SLUGS.includes(slug as (typeof LOCALIZED_INTERACTIVE_SLUGS)[number])
    );

    expect(untranslated).toContain('resize-image-for-telegram');
    expect(LOCALIZED_INTERACTIVE_SLUGS).not.toContain('resize-image-for-telegram');

    for (const file of [routeFiles.resize[1], routeFiles.convert[1]]) {
      expect(read(file), file).toContain('LOCALIZED_INTERACTIVE_SLUGS');
      expect(read(file), file).toContain('index: false');
      expect(read(file), file).toContain('follow: true');
    }
  });
});
