import fs from 'node:fs';
import path from 'node:path';

describe('blog post footer layout', () => {
  const pagePath = path.resolve(process.cwd(), 'app/[locale]/blog/[slug]/page.tsx');
  const footerPath = path.resolve(
    process.cwd(),
    'app/[locale]/blog/_components/BlogPostFooter.tsx'
  );
  const sectionHeaderPath = path.resolve(
    process.cwd(),
    'client/components/blog/BlogSectionHeader.tsx'
  );

  let pageSource: string;
  let footerSource: string;

  beforeAll(() => {
    pageSource = fs.readFileSync(pagePath, 'utf8');
    footerSource = fs.readFileSync(footerPath, 'utf8');
  });

  it('delegates post-footer sections to BlogPostFooter', () => {
    expect(pageSource).toContain('BlogPostFooter');
    expect(pageSource).toContain('<BlogPostFooter');
    expect(pageSource).not.toContain('Ready to Try AI Image Enhancement?');
    expect(pageSource).not.toContain('from-accent via-tertiary to-accent');
  });

  it('uses a shared section header component for footer blocks', () => {
    expect(fs.existsSync(sectionHeaderPath)).toBe(true);
    expect(footerSource).toContain('BlogSectionHeader');
    expect(footerSource).toContain('Try It Yourself');
    expect(footerSource).toContain('Quick Verdict');
    expect(footerSource).toContain('Continue Reading');
  });

  it('keeps the final CTA in a card instead of a full-bleed gradient banner', () => {
    expect(footerSource).toContain('rounded-2xl border border-accent/20 bg-surface-light');
    expect(footerSource).not.toContain('from-accent via-tertiary to-accent');
    expect(footerSource).not.toContain('bg-white text-accent');
  });

  it('uses consistent max-width containers for stacked footer sections', () => {
    expect(footerSource).toContain('max-w-4xl');
    expect(footerSource).toContain('max-w-6xl');
  });
});
