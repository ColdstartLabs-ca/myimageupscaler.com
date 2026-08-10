import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = fs.readFileSync(
  path.resolve(process.cwd(), 'app/[locale]/blog/[slug]/page.tsx'),
  'utf8'
);

describe('blog post Core Web Vitals safeguards', () => {
  it('keeps database-backed blog pages on the static/ISR path', () => {
    expect(pageSource).toContain("export const dynamic = 'force-static';");
    expect(pageSource).toContain('export const revalidate = 86400;');
  });

  it('defers embedded media until it approaches the viewport', () => {
    expect(pageSource).toMatch(
      /<iframe[\s\S]*src=\{src\}[\s\S]*\{\.\.\.props\}[\s\S]*loading="lazy"/
    );
  });
});
