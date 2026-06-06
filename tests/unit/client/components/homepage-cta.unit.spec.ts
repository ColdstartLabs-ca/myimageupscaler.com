import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd());

describe('Homepage CTA distribution', () => {
  const homePageClient = readFileSync(
    join(ROOT, 'client/components/pages/HomePageClient.tsx'),
    'utf-8'
  );
  const heroSection = readFileSync(
    join(ROOT, 'client/components/landing/HeroSection.tsx'),
    'utf-8'
  );
  const sectionCta = readFileSync(
    join(ROOT, 'client/components/landing/SectionSignupCTA.tsx'),
    'utf-8'
  );

  it('should export a reusable SectionSignupCTA component', () => {
    expect(sectionCta).toContain('export function SectionSignupCTA');
    expect(sectionCta).toContain("openAuthModal('register')");
  });

  it('should place signup CTAs across homepage sections', () => {
    expect(homePageClient).toContain('homepage_faq');
    expect(
      readFileSync(join(ROOT, 'client/components/features/landing/CreatorsSection.tsx'), 'utf-8')
    ).toContain('homepage_creators');
    expect(
      readFileSync(join(ROOT, 'client/components/features/landing/Features.tsx'), 'utf-8')
    ).toContain('homepage_features');
    expect(
      readFileSync(join(ROOT, 'client/components/features/landing/HowItWorks.tsx'), 'utf-8')
    ).toContain('homepage_how_it_works');
  });

  it('should not render the redundant striking-distance guides block', () => {
    expect(homePageClient).not.toContain('STRIKING_DISTANCE_GUIDES');
    expect(homePageClient).not.toContain('Popular Image Upscaling Guides');
  });

  it('should not duplicate the hero feature grid below the fold', () => {
    expect(heroSection).not.toContain('What is');
    expect(heroSection).not.toContain('Image Upscaling');
  });
});
