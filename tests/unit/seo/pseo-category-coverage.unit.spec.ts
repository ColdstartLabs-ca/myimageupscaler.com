import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('use-cases-expanded route coverage', () => {
  it('should have a page route for every use-cases-expanded data slug', () => {
    const data = JSON.parse(read('app/seo/data/use-cases-expanded.json')) as {
      pages: Array<{ slug: string }>;
    };
    const pageSource = read('app/(pseo)/use-cases-expanded/[slug]/page.tsx');

    expect(pageSource).toContain('getAllUseCasesExpandedSlugs');
    expect(pageSource).toContain('getUseCasesExpandedData');
    expect(pageSource).toContain("'use-cases-expanded'");
    expect(data.pages).toHaveLength(10);
  });

  it('should register and serve the use-cases-expanded sitemap', async () => {
    const indexSource = read('app/sitemap.xml/route.ts');
    expect(indexSource).toContain("'use-cases-expanded'");

    const { GET } = await import('@/app/sitemap-use-cases-expanded.xml/route');
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(
      'https://myimageupscaler.com/use-cases-expanded/real-estate-photography'
    );
  });
});
