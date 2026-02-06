/**
 * Tool Page Template Component
 * Based on PRD-PSEO-05 Section 2.1: Tool Page Template
 * Comprehensive template for tool landing pages
 */

'use client';

import type { IToolPage } from '@/lib/seo/pseo-types';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import type { IRelatedPage } from '@/lib/seo/related-pages';
import { ReactElement } from 'react';
import { BeforeAfterSlider } from '@client/components/ui/BeforeAfterSlider';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { BenefitsSection } from '../sections/BenefitsSection';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { FeaturesSection } from '../sections/FeaturesSection';
import { HeroSection } from '../sections/HeroSection';
import { HowItWorksSection } from '../sections/HowItWorksSection';
import { RelatedBlogPostsSection } from '../sections/RelatedBlogPostsSection';
import { RelatedPagesSection } from '../sections/RelatedPagesSection';
import { UseCasesSection } from '../sections/UseCasesSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';

import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';

interface IToolPageTemplateProps {
  data: IToolPage;
  locale?: string;
  relatedPages?: IRelatedPage[];
}

export function ToolPageTemplate({
  data,
  locale,
  relatedPages = [],
}: IToolPageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/tools/${data.slug}`);
  const tier = pageMapping?.tier;

  // Get locale-aware labels for before/after slider
  const getBeforeAfterLabels = (locale?: string) => {
    const labels: Record<string, { before: string; after: string }> = {
      en: { before: 'Before', after: 'After' },
      es: { before: 'Antes', after: 'Después' },
      pt: { before: 'Antes', after: 'Depois' },
      de: { before: 'Vorher', after: 'Nachher' },
      fr: { before: 'Avant', after: 'Après' },
      it: { before: 'Prima', after: 'Dopo' },
      ja: { before: '前', after: '後' },
    };
    return labels[locale || 'en'] || labels.en;
  };

  const sliderLabels = getBeforeAfterLabels(locale);

  return (
    <div className="min-h-screen bg-main relative">
      {/* Subtle background pattern */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Background blurs */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-0 w-[600px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, transparent 70%)',
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
              { label: 'Home', href: locale ? `/${locale}` : '/' },
              { label: 'Tools', href: locale ? `/${locale}/tools` : '/tools' },
              {
                label: data.title,
                href: locale ? `/${locale}/tools/${data.slug}` : `/tools/${data.slug}`,
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

          {/* Before/After Slider */}
          <FadeIn delay={0.3}>
            <div className="py-12">
              <div className="max-w-3xl mx-auto">
                <BeforeAfterSlider
                  beforeUrl={data.beforeAfterImages?.before ?? '/before-after/bird-before.webp'}
                  afterUrl={data.beforeAfterImages?.after ?? '/before-after/bird-after.webp'}
                  beforeLabel={data.beforeAfterImages?.beforeLabel ?? sliderLabels.before}
                  afterLabel={data.beforeAfterImages?.afterLabel ?? sliderLabels.after}
                  className="shadow-2xl shadow-accent/10"
                />
              </div>
            </div>
          </FadeIn>

          {/* Features */}
          <FeaturesSection features={data.features} />

          {/* How It Works */}
          <HowItWorksSection steps={data.howItWorks} />

          {/* Benefits */}
          <BenefitsSection benefits={data.benefits} />

          {/* Use Cases */}
          <UseCasesSection useCases={data.useCases} />

          {/* Related Pages */}
          {relatedPages.length > 0 && <RelatedPagesSection relatedPages={relatedPages} />}

          {/* Related Blog Posts */}
          {data.relatedBlogPosts && data.relatedBlogPosts.length > 0 && (
            <RelatedBlogPostsSection blogPostSlugs={data.relatedBlogPosts} locale={locale} />
          )}

          {/* FAQ */}
          <FAQSection faqs={data.faq} pageType="tool" slug={data.slug} />

          {/* Final CTA */}
          <div className="py-8">
            <FadeIn>
              <CTASection
                title="Ready to enhance your images?"
                description="Start upscaling images with AI today. No credit card required."
                ctaText={data.ctaText}
                ctaUrl={data.ctaUrl}
                pageType="tool"
                slug={data.slug}
              />
            </FadeIn>
          </div>
        </article>

        {/* Footer spacing */}
        <div className="pb-16" />
      </div>
    </div>
  );
}
