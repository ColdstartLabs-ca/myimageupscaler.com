/**
 * Tests for pSEO page templates
 * Tests Phase 5: Before/After Slider integration
 * Tests Phase 6: Related Pages Section integration
 */

import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import React from 'react';
import { PlatformPageTemplate } from '@/app/(pseo)/_components/pseo/templates/PlatformPageTemplate';
import { FormatScalePageTemplate } from '@/app/(pseo)/_components/pseo/templates/FormatScalePageTemplate';
import { DeviceUsePageTemplate } from '@/app/(pseo)/_components/pseo/templates/DeviceUsePageTemplate';
import { PlatformFormatPageTemplate } from '@/app/(pseo)/_components/pseo/templates/PlatformFormatPageTemplate';
import { RelatedPagesSection } from '@/app/(pseo)/_components/pseo/sections/RelatedPagesSection';
import type {
  IPlatformPage,
  IFormatScalePage,
  IDeviceUseCasePage,
  IPlatformFormatPage,
} from '@/lib/seo/pseo-types';
import type { IRelatedPage } from '@/lib/seo/related-pages';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowRight: ({ className }: { className?: string }) => (
    <svg data-testid="arrow-right" className={className}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  ),
  Link2: ({ className }: { className?: string }) => (
    <svg data-testid="link-icon" className={className}>
      <circle cx="12" cy="12" r="10" />
    </svg>
  ),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock MotionWrappers
vi.mock('@/app/(pseo)/_components/ui/MotionWrappers', () => ({
  FadeIn: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StaggerContainer: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => <div {...props}>{children}</div>,
  StaggerItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock IntersectionObserver for framer-motion
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Document | Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor() {}
}

global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

// Mock the BeforeAfterSlider to avoid client-side rendering issues in tests
vi.mock('@client/components/ui/BeforeAfterSlider', () => ({
  BeforeAfterSlider: ({ beforeLabel, afterLabel }: { beforeLabel: string; afterLabel: string }) => (
    <div data-testid="before-after-slider">
      <span data-testid="before-label">{beforeLabel}</span>
      <span data-testid="after-label">{afterLabel}</span>
    </div>
  ),
}));

// Mock analytics components
vi.mock('@/app/(pseo)/_components/pseo/analytics/PSEOPageTracker', () => ({
  PSEOPageTracker: () => null,
}));

vi.mock('@/app/(pseo)/_components/pseo/analytics/ScrollTracker', () => ({
  ScrollTracker: () => null,
}));

// Mock page mapping
vi.mock('@/lib/seo/keyword-mappings', () => ({
  getPageMappingByUrl: () => ({ tier: 'high' }),
}));

// Mock getRelatedPages
vi.mock('@/lib/seo/related-pages', () => ({
  getRelatedPages: vi.fn(() =>
    Promise.resolve([
      {
        slug: 'stable-diffusion-upscaler',
        title: 'Stable Diffusion Upscaler',
        description: 'Enhance SD images',
        category: 'platforms',
        url: '/platforms/stable-diffusion-upscaler',
        locale: 'en',
      },
      {
        slug: 'dalle-upscaler',
        title: 'DALL-E Upscaler',
        description: 'Enhance DALL-E images',
        category: 'platforms',
        url: '/platforms/dalle-upscaler',
        locale: 'en',
      },
    ])
  ),
}));

describe('pSEO Templates - Phase 5: Before/After Slider', () => {
  const mockPlatformData: IPlatformPage = {
    slug: 'midjourney-upscaler',
    platformName: 'Midjourney',
    title: 'Midjourney Upscaler',
    h1: 'Upscale Midjourney Images',
    intro: 'Enhance your AI art',
    description: 'Professional upscaling for Midjourney images',
    primaryKeyword: 'midjourney upscaler',
    benefits: [
      { title: 'Better quality', description: 'Higher resolution output' },
      { title: 'Faster processing', description: 'Quick upscaling' },
    ],
    integration: ['Easy export', 'Batch processing'],
    useCases: [{ title: 'Print', description: 'High quality prints' }],
    workflowSteps: ['Upload', 'Select scale', 'Download'],
    faq: [{ question: 'How to use?', answer: 'Just upload' }],
  };

  const mockFormatScaleData: IFormatScalePage = {
    slug: 'jpeg-2x',
    format: 'JPEG',
    scaleFactor: '2x',
    title: 'JPEG 2x Upscaler',
    h1: 'Upscale JPEG Images 2x',
    intro: 'Double your JPEG resolution',
    primaryKeyword: 'jpeg 2x upscaler',
    formatDescription: 'JPEG is a popular image format',
    scaleExpectations: '2x scaling provides good quality',
    benefits: [
      { title: 'Maintains quality', description: 'High quality upscaling' },
      { title: 'Fast processing', description: 'Quick results' },
    ],
    useCases: [{ title: 'Web', description: 'Better web images' }],
    bestPractices: ['Use high quality source', 'Check artifacts'],
    tips: ['Enable enhancement', 'Check output'],
    faq: [{ question: 'Quality loss?', answer: 'Minimal loss' }],
  };

  const mockDeviceUseData: IDeviceUseCasePage = {
    slug: 'mobile-social-media',
    device: 'mobile',
    useCase: 'social media',
    title: 'Mobile Social Media Upscaler',
    h1: 'Optimize for Mobile Social Media',
    intro: 'Perfect for Instagram, TikTok',
    primaryKeyword: 'mobile social media upscaler',
    deviceDescription: 'Mobile devices need optimized images',
    useCaseDescription: 'Social media platforms have specific requirements',
    deviceConstraints: ['Limited bandwidth', 'Small screens'],
    useCaseBenefits: ['Faster uploads', 'Better engagement'],
    tips: ['Use square format', 'Compress first'],
    faq: [{ question: 'Best format?', answer: 'JPEG or WebP' }],
  };

  const mockPlatformFormatData: IPlatformFormatPage = {
    slug: 'midjourney-png',
    platform: 'Midjourney',
    format: 'PNG',
    title: 'Midjourney PNG Upscaler',
    h1: 'Upscale Midjourney PNG Images',
    intro: 'Enhance PNG exports from Midjourney',
    primaryKeyword: 'midjourney png upscaler',
    platformDescription: 'Midjourney creates stunning AI art',
    formatDescription: 'PNG supports transparency',
    platformSettings: 'Use PNG for images with transparency',
    benefits: [
      { title: 'Lossless quality', description: 'No quality loss' },
      { title: 'Transparency support', description: 'Keeps transparency' },
    ],
    exportTips: ['Enable PNG export', 'Use high resolution'],
    workflowTips: ['Generate', 'Upscale', 'Download'],
    useCases: [{ title: 'Design', description: 'Professional design work' }],
    faq: [{ question: 'PNG vs JPEG?', answer: 'PNG for transparency' }],
  };

  describe('PlatformPageTemplate', () => {
    it('should render BeforeAfterSlider in PlatformPageTemplate', () => {
      render(<PlatformPageTemplate data={mockPlatformData} locale="en" />);
      expect(screen.getByTestId('before-after-slider')).toBeInTheDocument();
    });

    it('should use English labels by default', () => {
      render(<PlatformPageTemplate data={mockPlatformData} locale="en" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Before');
      expect(screen.getByTestId('after-label')).toHaveTextContent('After');
    });

    it('should use Spanish labels for es locale', () => {
      render(<PlatformPageTemplate data={mockPlatformData} locale="es" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Antes');
      expect(screen.getByTestId('after-label')).toHaveTextContent('Después');
    });

    it('should use Portuguese labels for pt locale', () => {
      render(<PlatformPageTemplate data={mockPlatformData} locale="pt" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Antes');
      expect(screen.getByTestId('after-label')).toHaveTextContent('Depois');
    });

    it('should use German labels for de locale', () => {
      render(<PlatformPageTemplate data={mockPlatformData} locale="de" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Vorher');
      expect(screen.getByTestId('after-label')).toHaveTextContent('Nachher');
    });

    it('should use French labels for fr locale', () => {
      render(<PlatformPageTemplate data={mockPlatformData} locale="fr" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Avant');
      expect(screen.getByTestId('after-label')).toHaveTextContent('Après');
    });

    it('should use Italian labels for it locale', () => {
      render(<PlatformPageTemplate data={mockPlatformData} locale="it" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Prima');
      expect(screen.getByTestId('after-label')).toHaveTextContent('Dopo');
    });

    it('should use Japanese labels for ja locale', () => {
      render(<PlatformPageTemplate data={mockPlatformData} locale="ja" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('前');
      expect(screen.getByTestId('after-label')).toHaveTextContent('後');
    });

    it('should fallback to English for undefined locale', () => {
      render(<PlatformPageTemplate data={mockPlatformData} />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Before');
      expect(screen.getByTestId('after-label')).toHaveTextContent('After');
    });
  });

  describe('FormatScalePageTemplate', () => {
    it('should render BeforeAfterSlider in FormatScalePageTemplate', () => {
      render(<FormatScalePageTemplate data={mockFormatScaleData} locale="en" />);
      expect(screen.getByTestId('before-after-slider')).toBeInTheDocument();
    });

    it('should use locale-aware labels', () => {
      render(<FormatScalePageTemplate data={mockFormatScaleData} locale="es" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Antes');
      expect(screen.getByTestId('after-label')).toHaveTextContent('Después');
    });
  });

  describe('DeviceUsePageTemplate', () => {
    it('should render BeforeAfterSlider in DeviceUsePageTemplate', () => {
      render(<DeviceUsePageTemplate data={mockDeviceUseData} locale="en" />);
      expect(screen.getByTestId('before-after-slider')).toBeInTheDocument();
    });

    it('should use locale-aware labels', () => {
      render(<DeviceUsePageTemplate data={mockDeviceUseData} locale="pt" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Antes');
      expect(screen.getByTestId('after-label')).toHaveTextContent('Depois');
    });
  });

  describe('PlatformFormatPageTemplate', () => {
    it('should render BeforeAfterSlider in PlatformFormatPageTemplate', () => {
      render(<PlatformFormatPageTemplate data={mockPlatformFormatData} locale="en" />);
      expect(screen.getByTestId('before-after-slider')).toBeInTheDocument();
    });

    it('should use locale-aware labels', () => {
      render(<PlatformFormatPageTemplate data={mockPlatformFormatData} locale="de" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Vorher');
      expect(screen.getByTestId('after-label')).toHaveTextContent('Nachher');
    });
  });
});

describe('pSEO Templates - Phase 6: Related Pages Section', () => {
  const mockRelatedPages: IRelatedPage[] = [
    {
      slug: 'stable-diffusion-upscaler',
      title: 'Stable Diffusion Upscaler',
      description: 'Enhance SD images to 4K quality',
      category: 'platforms',
      url: '/platforms/stable-diffusion-upscaler',
      locale: 'en',
    },
    {
      slug: 'dalle-upscaler',
      title: 'DALL-E Upscaler',
      description: 'Enhance DALL-E images to 4K quality',
      category: 'platforms',
      url: '/platforms/dalle-upscaler',
      locale: 'en',
    },
    {
      slug: 'png-upscale-2x',
      title: 'PNG 2x',
      description: 'Upscale PNG images 2x',
      category: 'format-scale',
      url: '/format-scale/png-upscale-2x',
      locale: 'en',
    },
  ];

  describe('RelatedPagesSection Component', () => {
    it('should render RelatedPagesSection with related pages', () => {
      render(<RelatedPagesSection relatedPages={mockRelatedPages} />);

      expect(screen.getByText('Related Pages')).toBeInTheDocument();
      expect(screen.getByText('Stable Diffusion Upscaler')).toBeInTheDocument();
      expect(screen.getByText('DALL-E Upscaler')).toBeInTheDocument();
    });

    it('should render category badges', () => {
      render(<RelatedPagesSection relatedPages={mockRelatedPages} />);

      const platformBadges = screen.getAllByText('AI Platform');
      const formatScaleBadges = screen.getAllByText('Format & Scale');
      expect(platformBadges.length).toBeGreaterThan(0);
      expect(formatScaleBadges.length).toBeGreaterThan(0);
    });

    it('should render links with correct URLs', () => {
      render(<RelatedPagesSection relatedPages={mockRelatedPages} />);

      const stableDiffusionLink = screen.getByText('Stable Diffusion Upscaler').closest('a');
      expect(stableDiffusionLink).toHaveAttribute('href', '/platforms/stable-diffusion-upscaler');
    });

    it('should not render section when relatedPages is empty', () => {
      const { container } = render(<RelatedPagesSection relatedPages={[]} />);

      expect(container.firstChild).toBeNull();
    });

    it('should limit number of pages with maxPages prop', () => {
      render(<RelatedPagesSection relatedPages={mockRelatedPages} maxPages={2} />);

      expect(screen.getByText('Stable Diffusion Upscaler')).toBeInTheDocument();
      expect(screen.getByText('DALL-E Upscaler')).toBeInTheDocument();
      expect(screen.queryByText('PNG 2x')).not.toBeInTheDocument();
    });

    it('should render custom title and subtitle', () => {
      render(
        <RelatedPagesSection
          relatedPages={mockRelatedPages}
          title="More Tools"
          subtitle="Explore additional upscaling tools"
        />
      );

      expect(screen.getByText('More Tools')).toBeInTheDocument();
      expect(screen.getByText('Explore additional upscaling tools')).toBeInTheDocument();
    });
  });
});
