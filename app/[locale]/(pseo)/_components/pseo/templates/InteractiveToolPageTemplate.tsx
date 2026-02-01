/**
 * Interactive Tool Page Template
 * Template for interactive tool landing pages with embedded functionality
 */

import type { IToolPage, IToolConfig } from '@/lib/seo/pseo-types';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import React, { ReactElement } from 'react';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { BenefitsSection } from '../sections/BenefitsSection';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { FeaturesSection } from '../sections/FeaturesSection';
import { HowItWorksSection } from '../sections/HowItWorksSection';
import { UseCasesSection } from '../sections/UseCasesSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';
import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';

// Import interactive tools
import { ImageResizer } from '@/app/(pseo)/_components/tools/ImageResizer';
import { ImageCompressor } from '@/app/(pseo)/_components/tools/ImageCompressor';
import { FormatConverter } from '@/app/(pseo)/_components/tools/FormatConverter';
import { BulkImageCompressor } from '@/app/(pseo)/_components/tools/BulkImageCompressor';
import { BulkImageResizer } from '@/app/(pseo)/_components/tools/BulkImageResizer';
import { BackgroundRemover } from '@/app/(pseo)/_components/tools/BackgroundRemover';
import { GuestUpscaler } from '@/app/(pseo)/_components/tools/GuestUpscaler';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOL_COMPONENTS: Record<string, React.ComponentType<any>> = {
  ImageResizer,
  ImageCompressor,
  FormatConverter,
  BulkImageCompressor,
  BulkImageResizer,
  BackgroundRemover,
  GuestUpscaler,
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
}

export function InteractiveToolPageTemplate({
  data,
  locale,
}: IInteractiveToolPageTemplateProps): ReactElement {
  const pageMapping = getPageMappingByUrl(`/tools/${data.slug}`);
  const tier = pageMapping?.tier;

  const ToolComponent = data.toolComponent ? TOOL_COMPONENTS[data.toolComponent] : null;

  return (
    <div className="min-h-screen bg-base relative">
      {/* Subtle background pattern */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(0,0,0,0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.02) 1px, transparent 1px)',
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

      <div className="relative max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
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
          {/* Hero Section with Title */}
          <FadeIn>
            <div className="text-center py-8 max-w-4xl mx-auto">
              <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-4">{data.h1}</h1>
              <p className="text-xl text-text-secondary leading-relaxed">{data.intro}</p>
            </div>
          </FadeIn>

          {/* Interactive Tool Component */}
          {ToolComponent && (
            <FadeIn delay={0.1}>
              <div className="py-8">
                <ToolComponent {...getToolProps(data.toolComponent!, data.toolConfig)} />
              </div>
            </FadeIn>
          )}

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

          {/* Use Cases */}
          <UseCasesSection useCases={data.useCases} />

          {/* Benefits */}
          <BenefitsSection benefits={data.benefits} />

          {/* FAQ */}
          <FAQSection faqs={data.faq} pageType="tool" slug={data.slug} />

          {/* Upgrade CTA */}
          <div className="py-8">
            <FadeIn>
              <CTASection
                title="Need AI-Powered Enhancement?"
                description="For advanced upscaling with AI quality enhancement, try our flagship tool."
                ctaText="Try AI Image Upscaler"
                ctaUrl="/?signup=1"
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
