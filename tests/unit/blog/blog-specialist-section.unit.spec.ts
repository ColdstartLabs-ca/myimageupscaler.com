import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOG_SPECIALIST_PROFILE } from '@lib/blog/specialist-profile';

describe('BlogSpecialistSection', () => {
  it('renders expanded reviewer bio and social links', () => {
    const sectionSource = fs.readFileSync(
      path.resolve(process.cwd(), 'client/components/blog/BlogSpecialistSection.tsx'),
      'utf8'
    );

    expect(sectionSource).toContain('Reviewed by');
    expect(sectionSource).not.toContain('BlogSectionHeader');
    expect(sectionSource).toContain('FaXTwitter');
    expect(sectionSource).toContain('specialist.bio');
    expect(sectionSource).toContain('specialist.expertise');
    expect(sectionSource).toContain('specialist.xUrl');
    expect(sectionSource).toContain('specialist.xHandle');
    expect(sectionSource).toContain('blogCategoryBadgeClass');
    expect(sectionSource).toContain('blogHeroSecondaryButtonClass');
    expect(sectionSource).toContain('About Joao');
  });

  it('is placed at the bottom of blog post article content', () => {
    const pageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'app/[locale]/blog/[slug]/page.tsx'),
      'utf8'
    );

    expect(pageSource).toContain('BlogSpecialistSection');
    expect(pageSource).toMatch(/BlogFaqSection[\s\S]*BlogSpecialistSection/);
  });

  it('includes expanded profile data for Joao Furtado', () => {
    expect(BLOG_SPECIALIST_PROFILE.bio.length).toBeGreaterThan(80);
    expect(BLOG_SPECIALIST_PROFILE.expertise.length).toBeGreaterThanOrEqual(3);
    expect(BLOG_SPECIALIST_PROFILE.sameAs).toContain('https://x.com/joaocoldstart');
  });
});
