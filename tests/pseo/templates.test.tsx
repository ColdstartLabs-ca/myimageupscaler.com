/**
 * Tests for pSEO page templates
 * Tests Phase 5: Before/After Slider integration
 * Tests Phase 6: Related Pages Section integration
 */

import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import React from 'react';
import { ToolPageTemplate } from '@/app/(pseo)/_components/pseo/templates/ToolPageTemplate';
import { FormatPageTemplate } from '@/app/(pseo)/_components/pseo/templates/FormatPageTemplate';
import { ScalePageTemplate } from '@/app/(pseo)/_components/pseo/templates/ScalePageTemplate';
import { RelatedPagesSection } from '@/app/(pseo)/_components/pseo/sections/RelatedPagesSection';
import type { IToolPage, IFormatPage, IScalePage } from '@/lib/seo/pseo-types';
import type { IRelatedPage } from '@/lib/seo/related-pages';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowRight: ({ className }: { className?: string }) => (
    <svg data-testid="arrow-right" className={className}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  ),
  ChevronDown: ({ className }: { className?: string }) => (
    <svg data-testid="chevron-down" className={className}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  Link2: ({ className }: { className?: string }) => (
    <svg data-testid="link-icon" className={className}>
      <circle cx="12" cy="12" r="10" />
    </svg>
  ),
  Monitor: ({ className }: { className?: string }) => (
    <svg data-testid="monitor-icon" className={className}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
    </svg>
  ),
  Zap: ({ className }: { className?: string }) => (
    <svg data-testid="zap-icon" className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Check: ({ className }: { className?: string }) => (
    <svg data-testid="check-icon" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Image: ({ className }: { className?: string }) => (
    <svg data-testid="image-icon" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  ),
  FileImage: ({ className }: { className?: string }) => (
    <svg data-testid="file-image-icon" className={className}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    </svg>
  ),
  Sparkles: ({ className }: { className?: string }) => (
    <svg data-testid="sparkles-icon" className={className}>
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
    </svg>
  ),
  Target: ({ className }: { className?: string }) => (
    <svg data-testid="target-icon" className={className}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  Layers: ({ className }: { className?: string }) => (
    <svg data-testid="layers-icon" className={className}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  Maximize2: ({ className }: { className?: string }) => (
    <svg data-testid="maximize2-icon" className={className}>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
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
  const mockToolData: IToolPage = {
    slug: 'image-upscaler',
    category: 'tools',
    toolName: 'Image Upscaler',
    title: 'Image Upscaler',
    metaTitle: 'AI Image Upscaler - Upscale Images Online',
    metaDescription: 'Upscale your images with AI',
    h1: 'Upscale Images with AI',
    intro: 'Enhance your images with our AI-powered upscaler',
    primaryKeyword: 'image upscaler',
    secondaryKeywords: ['upscale', 'ai upscaler'],
    description: 'Professional AI-powered image upscaling tool',
    features: [
      { title: 'AI Enhancement', description: 'Advanced AI algorithms' },
      { title: 'Multiple formats', description: 'Support for JPEG, PNG, WebP' },
    ],
    useCases: [{ title: 'Print', description: 'High quality prints' }],
    benefits: [
      { title: 'Better quality', description: 'Higher resolution output' },
      { title: 'Faster processing', description: 'Quick upscaling' },
    ],
    howItWorks: [
      { step: 1, title: 'Upload', description: 'Upload your image' },
      { step: 2, title: 'Select', description: 'Choose scale factor' },
      { step: 3, title: 'Download', description: 'Download result' },
    ],
    faq: [{ question: 'How to use?', answer: 'Just upload' }],
    relatedTools: [],
    relatedGuides: [],
    ctaText: 'Try Now',
    ctaUrl: '/',
    lastUpdated: '2024-01-01',
    beforeAfterImages: {
      before: '/images/before.jpg',
      after: '/images/after.jpg',
    },
  };

  const mockFormatData: IFormatPage = {
    slug: 'jpeg-upscaler',
    category: 'formats',
    formatName: 'JPEG',
    extension: '.jpg',
    title: 'JPEG Upscaler',
    metaTitle: 'JPEG Upscaler - Upscale JPEG Images Online',
    metaDescription: 'Upscale your JPEG images',
    h1: 'Upscale JPEG Images',
    intro: 'Double your JPEG resolution',
    primaryKeyword: 'jpeg upscaler',
    secondaryKeywords: ['jpg upscaler', 'jpeg upscale'],
    description: 'JPEG is a popular image format',
    characteristics: [
      { title: 'Lossy compression', description: 'Smaller file sizes' },
    ],
    useCases: [{ title: 'Web', description: 'Better web images' }],
    bestPractices: [
      { title: 'Use high quality source', description: 'Avoid artifacts' },
    ],
    faq: [{ question: 'Quality loss?', answer: 'Minimal loss' }],
    relatedFormats: [],
    relatedGuides: [],
    lastUpdated: '2024-01-01',
    beforeAfterImages: {
      before: '/images/before.jpg',
      after: '/images/after.jpg',
    },
  };

  const mockScaleData: IScalePage = {
    slug: '2x-upscaler',
    category: 'scale',
    resolution: '2x',
    title: '2x Upscaler',
    metaTitle: '2x Image Upscaler - Double Your Image Size',
    metaDescription: 'Upscale images by 2x',
    h1: 'Upscale Images 2x',
    intro: 'Double your image resolution',
    primaryKeyword: '2x upscaler',
    secondaryKeywords: ['2x upscale', 'double size'],
    description: '2x scaling provides good quality',
    dimensions: { width: 2048, height: 2048 },
    useCases: [{ title: 'Print', description: 'Large prints' }],
    benefits: [
      { title: 'Maintains quality', description: 'High quality upscaling' },
    ],
    faq: [{ question: 'Is 2x good?', answer: 'Yes, very sharp' }],
    relatedScales: [],
    relatedGuides: [],
    lastUpdated: '2024-01-01',
    beforeAfterImages: {
      before: '/images/before.jpg',
      after: '/images/after.jpg',
    },
  };

  describe('ToolPageTemplate', () => {
    it('should render BeforeAfterSlider in ToolPageTemplate', () => {
      render(<ToolPageTemplate data={mockToolData} locale="en" />);
      expect(screen.getByTestId('before-after-slider')).toBeInTheDocument();
    });

    it('should use English labels by default', () => {
      render(<ToolPageTemplate data={mockToolData} locale="en" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Before');
      expect(screen.getByTestId('after-label')).toHaveTextContent('After');
    });

    it('should use Spanish labels for es locale', () => {
      render(<ToolPageTemplate data={mockToolData} locale="es" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Antes');
      expect(screen.getByTestId('after-label')).toHaveTextContent('Después');
    });

    it('should use Portuguese labels for pt locale', () => {
      render(<ToolPageTemplate data={mockToolData} locale="pt" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Antes');
      expect(screen.getByTestId('after-label')).toHaveTextContent('Depois');
    });

    it('should use German labels for de locale', () => {
      render(<ToolPageTemplate data={mockToolData} locale="de" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Vorher');
      expect(screen.getByTestId('after-label')).toHaveTextContent('Nachher');
    });

    it('should use French labels for fr locale', () => {
      render(<ToolPageTemplate data={mockToolData} locale="fr" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Avant');
      expect(screen.getByTestId('after-label')).toHaveTextContent('Après');
    });

    it('should use Italian labels for it locale', () => {
      render(<ToolPageTemplate data={mockToolData} locale="it" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Prima');
      expect(screen.getByTestId('after-label')).toHaveTextContent('Dopo');
    });

    it('should use Japanese labels for ja locale', () => {
      render(<ToolPageTemplate data={mockToolData} locale="ja" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('前');
      expect(screen.getByTestId('after-label')).toHaveTextContent('後');
    });

    it('should fallback to English for undefined locale', () => {
      render(<ToolPageTemplate data={mockToolData} />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Before');
      expect(screen.getByTestId('after-label')).toHaveTextContent('After');
    });
  });

  describe('FormatPageTemplate', () => {
    it('should render BeforeAfterSlider in FormatPageTemplate', () => {
      render(<FormatPageTemplate data={mockFormatData} locale="en" />);
      expect(screen.getByTestId('before-after-slider')).toBeInTheDocument();
    });

    it('should use locale-aware labels', () => {
      render(<FormatPageTemplate data={mockFormatData} locale="es" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Antes');
      expect(screen.getByTestId('after-label')).toHaveTextContent('Después');
    });
  });

  describe('ScalePageTemplate', () => {
    it('should render BeforeAfterSlider in ScalePageTemplate', () => {
      render(<ScalePageTemplate data={mockScaleData} locale="en" />);
      expect(screen.getByTestId('before-after-slider')).toBeInTheDocument();
    });

    it('should use locale-aware labels', () => {
      render(<ScalePageTemplate data={mockScaleData} locale="pt" />);
      expect(screen.getByTestId('before-label')).toHaveTextContent('Antes');
      expect(screen.getByTestId('after-label')).toHaveTextContent('Depois');
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
