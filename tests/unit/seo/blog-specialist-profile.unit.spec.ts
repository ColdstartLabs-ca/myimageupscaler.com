import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOG_SPECIALIST_PROFILE } from '@lib/blog/specialist-profile';

describe('blog specialist profile', () => {
  it('defines Joao Furtado as the visible blog specialist', () => {
    expect(BLOG_SPECIALIST_PROFILE).toMatchObject({
      name: 'Joao Furtado',
      role: 'AI Image Upscaling Specialist',
      image: '/authors/joao-furtado.webp',
      url: '/about',
      xHandle: 'joaocoldstart',
      xUrl: 'https://x.com/joaocoldstart',
    });
  });

  it('uses an optimized public WebP profile image', () => {
    const imagePath = path.resolve(process.cwd(), 'public/authors/joao-furtado.webp');
    expect(fs.existsSync(imagePath)).toBe(true);
    expect(fs.statSync(imagePath).size).toBeGreaterThan(0);
  });

  it('adds reviewedBy structured data with sameAs to blog posts', () => {
    const pageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'app/[locale]/blog/[slug]/page.tsx'),
      'utf8'
    );

    expect(pageSource).toContain('reviewedBy');
    expect(pageSource).toContain('BLOG_SPECIALIST_PROFILE.name');
    expect(pageSource).toContain('BLOG_SPECIALIST_PROFILE.image');
    expect(pageSource).toContain('BLOG_SPECIALIST_PROFILE.sameAs');
  });
});
