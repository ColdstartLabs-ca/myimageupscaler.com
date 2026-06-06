import fs from 'node:fs';
import path from 'node:path';
import { isPhotographicFeaturedImage } from '@client/components/blog/BlogFeaturedImage';

describe('BlogFeaturedImage', () => {
  describe('isPhotographicFeaturedImage', () => {
    it('returns true for Unsplash photo URLs', () => {
      expect(
        isPhotographicFeaturedImage(
          'https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=1200&h=630&fit=crop&q=80'
        )
      ).toBe(true);
    });

    it('returns false for generated title-card OG images', () => {
      expect(
        isPhotographicFeaturedImage(
          'https://cdn.outrank.so/blog/convert-picture-to-outline-og.webp'
        )
      ).toBe(false);
    });

    it('returns false for invalid URLs', () => {
      expect(isPhotographicFeaturedImage('not-a-url')).toBe(false);
    });
  });
});

describe('blog post featured image placement', () => {
  it('renders the featured image inside the hero section with landing-style framing', () => {
    const pageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'app/[locale]/blog/[slug]/page.tsx'),
      'utf8'
    );
    const imageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'client/components/blog/BlogFeaturedImage.tsx'),
      'utf8'
    );
    const heroSource = fs.readFileSync(
      path.resolve(process.cwd(), 'client/components/blog/BlogPostHeroSection.tsx'),
      'utf8'
    );

    expect(pageSource).toContain('BlogPostHeroSection');
    expect(pageSource).toContain('image={post.image}');
    expect(heroSource).toContain('BlogFeaturedImage');
    expect(imageSource).toContain('border-white/20');
    expect(imageSource).toContain('shadow-2xl shadow-accent/10');
  });
});
