import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(process.cwd());
const pageSource = fs.readFileSync(path.join(ROOT, 'app/[locale]/blog/page.tsx'), 'utf8');

describe('blog index search and pagination robots', () => {
  it('passes searchParams into metadata so filtered URLs can be deindexed', () => {
    expect(pageSource).toMatch(
      /export async function generateMetadata\(\{\s*params,\s*searchParams,\s*\}: IBlogPageProps\)/
    );
    expect(pageSource).toContain('const currentSearchParams = await searchParams;');
  });

  it('noindexes blog query and paginated variants while preserving follow', () => {
    expect(pageSource).toContain('Boolean(currentSearchParams.q?.trim())');
    expect(pageSource).toContain(
      "(Boolean(currentSearchParams.page) && currentSearchParams.page !== '1')"
    );
    expect(pageSource).toMatch(
      /robots:\s*{[\s\S]*index:\s*!hasIndexableBlogParams,[\s\S]*follow:\s*true,[\s\S]*}/
    );
  });

  it('keeps parameter variants canonicalized to the clean blog index', () => {
    expect(pageSource).toContain("const canonicalUrl = getCanonicalUrl('/blog', locale);");
    expect(pageSource).toMatch(/alternates:\s*{[\s\S]*canonical:\s*canonicalUrl,[\s\S]*}/);
  });

  it('does not emit internal links to noindex search-result URLs', () => {
    expect(pageSource).not.toContain('href={`/blog?q=${encodeURIComponent(path.query)}`}');
    expect(pageSource).not.toContain('href={`/blog?q=${encodeURIComponent(topic)}`}');
  });

  it('keeps ordinary pagination discoverable', () => {
    expect(pageSource).toContain('page=${currentPage - 1}');
    expect(pageSource).toContain('page=${page}');
    expect(pageSource).toContain('page=${currentPage + 1}');
  });
});
