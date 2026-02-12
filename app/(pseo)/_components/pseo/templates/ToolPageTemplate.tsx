/**
 * Tool Page Template Component
 * Based on PRD-PSEO-05 Section 2.1: Tool Page Template
 * Comprehensive template for tool landing pages
 */

'use client';

import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import type { IToolPage } from '@/lib/seo/pseo-types';
import type { IRelatedPage } from '@/lib/seo/related-pages';
import { BeforeAfterSlider } from '@client/components/ui/BeforeAfterSlider';
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
import { RelatedPagesSection } from '../sections/RelatedPagesSection';
import { UseCasesSection } from '../sections/UseCasesSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';

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
    <div className="min-h-screen bg-main relative overflow-x-hidden">
      <PSEOPageTracker
        pageType="tool"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="tool" slug={data.slug} />

      {/* Full Width Hero Area */}
      <div className="relative">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative z-30 pt-6">
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

        <div className="relative h-full">
          <HeroSection
            h1={data.h1}
            intro={data.intro}
            ctaText={data.ctaText}
            ctaUrl={data.ctaUrl}
            pageType="tool"
            slug={data.slug}
          />
        </div>
      </div>

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        <article>
          {/* Unique Intro (for content uniqueness) */}
          {data.uniqueIntro && (
            <FadeIn delay={0.25}>
              <div className="max-w-3xl mx-auto py-8">
                <p className="text-lg text-text-secondary leading-relaxed text-center font-light">
                  {data.uniqueIntro}
                </p>
              </div>
            </FadeIn>
          )}

          {/* Expanded Description */}
          {data.expandedDescription && (
            <FadeIn delay={0.3}>
              <div className="max-w-4xl mx-auto py-8">
                <p className="text-base text-text-secondary leading-relaxed">
                  {data.expandedDescription}
                </p>
              </div>
            </FadeIn>
          )}

          {/* Page Specific Details */}
          {data.pageSpecificDetails && (
            <FadeIn delay={0.35}>
              <div className="max-w-4xl mx-auto py-8 px-8 glass-card-2025">
                <h3 className="text-xl font-bold mb-4 text-center text-white">Key Details & Use Cases</h3>
                <p className="text-base text-text-secondary leading-relaxed">
                  {data.pageSpecificDetails}
                </p>
              </div>
            </FadeIn>
          )}

          {/* Before/After Slider Removed (Bird Image) unless matched */}
          {data.beforeAfterImages && (
            <FadeIn delay={0.4}>
              <div className="py-12">
                <div className="max-w-3xl mx-auto">
                  <BeforeAfterSlider
                    beforeUrl={data.beforeAfterImages.before}
                    afterUrl={data.beforeAfterImages.after}
                    beforeLabel={data.beforeAfterImages.beforeLabel ?? sliderLabels.before}
                    afterLabel={data.beforeAfterImages.afterLabel ?? sliderLabels.after}
                    className="shadow-2xl shadow-accent/10"
                  />
                </div>
              </div>
            </FadeIn>
          )}

          {/* Features */}
          <div className="py-12">
            <FeaturesSection features={data.features} />
          </div>

          {/* How It Works */}
          <div className="py-12">
            <HowItWorksSection steps={data.howItWorks} />
          </div>

          {/* Benefits */}
          <div className="py-12">
            <BenefitsSection benefits={data.benefits} />
          </div>

          {/* Use Cases */}
          <div className="py-12">
            <UseCasesSection useCases={data.useCases} />
          </div>

          {/* Related Pages */}
          {relatedPages.length > 0 && (
            <div className="py-12">
              <RelatedPagesSection relatedPages={relatedPages} />
            </div>
          )}

          {/* Related Blog Posts */}
          {data.relatedBlogPosts && data.relatedBlogPosts.length > 0 && (
            <div className="py-12">
              <RelatedBlogPostsSection blogPostSlugs={data.relatedBlogPosts} locale={locale} />
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
