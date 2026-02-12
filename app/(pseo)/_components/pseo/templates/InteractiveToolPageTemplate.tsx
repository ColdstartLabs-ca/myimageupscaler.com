/**
 * Interactive Tool Page Template
 * Template for interactive tool landing pages with embedded functionality
 */

'use client';

import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import type { IToolConfig, IToolPage } from '@/lib/seo/pseo-types';
import type { IRelatedPage } from '@/lib/seo/related-pages';
import React, { ReactElement } from 'react';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { BenefitsSection } from '../sections/BenefitsSection';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { FeaturesSection } from '../sections/FeaturesSection';
import { HeroSection } from '../sections/HeroSection';
import { HowItWorksSection } from '../sections/HowItWorksSection';
import { RelatedPagesSection } from '../sections/RelatedPagesSection';
import { UseCasesSection } from '../sections/UseCasesSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';

// Import interactive tools
import { BackgroundRemover } from '@/app/(pseo)/_components/tools/BackgroundRemover';
import { BulkImageCompressor } from '@/app/(pseo)/_components/tools/BulkImageCompressor';
import { BulkImageResizer } from '@/app/(pseo)/_components/tools/BulkImageResizer';
import { FormatConverter } from '@/app/(pseo)/_components/tools/FormatConverter';
import { ImageCompressor } from '@/app/(pseo)/_components/tools/ImageCompressor';
import { ImageResizer } from '@/app/(pseo)/_components/tools/ImageResizer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOL_COMPONENTS: Record<string, React.ComponentType<any>> = {
  ImageResizer,
  ImageCompressor,
  FormatConverter,
  BulkImageCompressor,
  BulkImageResizer,
  BackgroundRemover,
};

/**
 * Get props to pass to a tool component based on config
 */
function getToolProps(componentName: string, config?: IToolConfig): Record<string, unknown> {
  if (!config) return {};

  switch (componentName) {
    case 'FormatConverter':
      return {
        defaultTargetFormat: config.defaultTargetFormat,
        acceptedInputFormats: config.acceptedInputFormats,
        availableOutputFormats: config.availableOutputFormats,
      };
    case 'ImageResizer':
      return {
        defaultWidth: config.defaultWidth,
        defaultHeight: config.defaultHeight,
        lockDimensions: config.lockDimensions,
        presetFilter: config.presetFilter,
      };
    case 'ImageCompressor':
      return {
        defaultQuality: config.defaultQuality,
      };
    default:
      return {};
  }
}

interface IInteractiveToolPageTemplateProps {
  data: IToolPage;
  locale?: string;
  relatedPages?: IRelatedPage[];
}

export function InteractiveToolPageTemplate({
  data,
  locale = 'en',
  relatedPages = [],
}: IInteractiveToolPageTemplateProps): ReactElement {
  const pageMapping = getPageMappingByUrl(`/tools/${data.slug}`);
  const tier = pageMapping?.tier;

  const ToolComponent = data.toolComponent ? TOOL_COMPONENTS[data.toolComponent] : null;

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
              { label: data.title, href: locale ? `/${locale}/tools/${data.slug}` : `/tools/${data.slug}` },
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
          {/* Interactive Tool Component */}
          {ToolComponent && (
            <FadeIn delay={0.1}>
              <div className="py-12">
                <ToolComponent {...getToolProps(data.toolComponent!, data.toolConfig)} />
              </div>
            </FadeIn>
          )}

          {/* Description */}
          {data.description && (
            <FadeIn delay={0.2}>
              <div className="max-w-3xl mx-auto py-8">
                <p className="text-lg text-text-secondary leading-relaxed text-center font-light">
                  {data.description}
                </p>
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

          {/* Use Cases */}
          <div className="py-12">
            <UseCasesSection useCases={data.useCases} />
          </div>

          {/* Benefits */}
          <div className="py-12">
            <BenefitsSection benefits={data.benefits} />
          </div>

          {/* Related Pages */}
          {relatedPages.length > 0 && (
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
        title="Need AI-Powered Enhancement?"
        description="For advanced upscaling with AI quality enhancement, try our flagship tool. No credit card required."
        ctaText="Try AI Image Upscaler"
        ctaUrl="/?signup=1"
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
