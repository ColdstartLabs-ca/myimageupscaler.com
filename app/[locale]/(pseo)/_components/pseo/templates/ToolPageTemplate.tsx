/**
 * Tool Page Template Component
 * Based on PRD-PSEO-05 Section 2.1: Tool Page Template
 * Comprehensive template for tool landing pages
 */

import type { IToolPage } from '@/lib/seo/pseo-types';
import type { IRelatedPage } from '@/lib/seo/related-pages';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import { getSafeLocale } from '@/lib/seo/locale-utils';
import Link from 'next/link';
import { ReactElement } from 'react';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { BenefitsSection } from '../sections/BenefitsSection';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { FeaturesSection } from '../sections/FeaturesSection';
import { HeroSection } from '../sections/HeroSection';
import { HowItWorksSection } from '../sections/HowItWorksSection';
import { RelatedBlogPostsSection } from '../sections/RelatedBlogPostsSection';
import { RelatedPagesSection } from '@/app/(pseo)/_components/pseo/sections/RelatedPagesSection';
import { UseCasesSection } from '../sections/UseCasesSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';

import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';

interface IToolPageTemplateProps {
  data: IToolPage;
  locale?: string;
  relatedPages?: IRelatedPage[];
}

const HIGH_OPPORTUNITY_GUIDES: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/blog/best-ai-upscaler', label: 'Top AI image upscaler websites' },
  { href: '/blog/free-ai-upscaler-no-watermark', label: 'Free AI upscaler with no watermark' },
  { href: '/blog/best-ai-image-quality-enhancer-free', label: 'Free AI image sharpener' },
  { href: '/blog/fix-blurry-photos-ai-methods-guide', label: 'Fix blurry photos with AI' },
  { href: '/blog/upscale-image-for-print-300-dpi-guide', label: 'Upscale to 300 DPI for print' },
  { href: '/blog/topaz-video-upscaler', label: 'Topaz Video AI 2026 update' },
  { href: '/scale/upscale-16x', label: 'Upscale images 16x' },
] as const;

export function ToolPageTemplate({
  data,
  locale = 'en',
  relatedPages = [],
}: IToolPageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/tools/${data.slug}`);
  const tier = pageMapping?.tier;

  return (
    <div className="min-h-screen bg-base relative">
      {/* Subtle background pattern */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(0, 0, 0, 0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(0, 0, 0, 0.02) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Background blurs */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-0 w-[600px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(45, 129, 255, 0.08) 0%, transparent 70%)',
        }}
      />

      <PSEOPageTracker
        pageType="tool"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="tool" slug={data.slug} />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Breadcrumb */}
        <div className="pt-6 pb-4">
          <BreadcrumbNav
            items={[
              {
                label: 'Home',
                href: getSafeLocale(locale) ? `/${getSafeLocale(locale)}` : '/',
              },
              {
                label: 'Tools',
                href: getSafeLocale(locale) ? `/${getSafeLocale(locale)}/tools` : '/tools',
              },
              {
                label: data.title,
                href: getSafeLocale(locale)
                  ? `/${getSafeLocale(locale)}/tools/${data.slug}`
                  : `/tools/${data.slug}`,
              },
            ]}
          />
        </div>

        <article>
          {/* Hero Section */}
          <HeroSection
            h1={data.h1}
            intro={data.intro}
            ctaText={data.ctaText}
            ctaUrl={data.ctaUrl}
            pageType="tool"
            slug={data.slug}
          />

          {/* Description */}
          {data.description && (
            <FadeIn delay={0.2}>
              <div className="max-w-3xl mx-auto py-8">
                <p className="text-lg text-text-secondary leading-relaxed text-center">
                  {data.description}
                </p>
              </div>
            </FadeIn>
          )}

          {/* Features */}
          <FeaturesSection features={data.features} />

          {/* How It Works */}
          <HowItWorksSection steps={data.howItWorks} />

          {/* Related Blog Posts */}
          {data.relatedBlogPosts && data.relatedBlogPosts.length > 0 && (
            <div className="py-12">
              <RelatedBlogPostsSection
                blogPostSlugs={data.relatedBlogPosts}
                locale={getSafeLocale(locale)}
              />
            </div>
          )}

          <div className="py-8">
            <section className="rounded-lg border border-border bg-surface/60 p-6">
              <h2 className="text-xl font-bold text-primary mb-4">More Upscaling Guides</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {HIGH_OPPORTUNITY_GUIDES.map(guide => (
                  <Link
                    key={guide.href}
                    href={guide.href}
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    {guide.label}
                  </Link>
                ))}
              </div>
            </section>
          </div>

          {/* Use Cases */}
          <UseCasesSection useCases={data.useCases} />

          {/* Benefits */}
          <BenefitsSection benefits={data.benefits} />

          {/* Related Pages */}
          {relatedPages && relatedPages.length > 0 && (
            <div className="py-12">
              <RelatedPagesSection relatedPages={relatedPages} />
            </div>
          )}

          {/* FAQ */}
          <div className="py-12">
            <FAQSection faqs={data.faq} pageType="tool" slug={data.slug} />
          </div>
        </article>
      </div>

      {/* Final CTA Full Width */}
      <CTASection
        title="Ready to enhance your images?"
        description="Start upscaling images with AI today. No credit card required."
        ctaText={data.ctaText}
        ctaUrl={data.ctaUrl}
        pageType="tool"
        slug={data.slug}
      />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Footer spacing */}
        <div className="pb-16" />
      </div>
    </div>
  );
}
