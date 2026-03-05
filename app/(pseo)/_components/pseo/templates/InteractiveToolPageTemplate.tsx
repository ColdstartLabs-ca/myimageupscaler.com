/**
 * Interactive Tool Page Template
 * Template for interactive tool landing pages with embedded functionality
 */

'use client';

import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import type { IToolConfig, IToolPage } from '@/lib/seo/pseo-types';
import type { IRelatedPage } from '@/lib/seo/related-pages';
import { useTranslations } from 'next-intl';
import React, { ReactElement } from 'react';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { BenefitsSection } from '../sections/BenefitsSection';
import { CTASection } from '../sections/CTASection';
import { ExternalSourcesSection } from '../sections/ExternalSourcesSection';
import { FAQSection } from '../sections/FAQSection';
import { FeaturesSection } from '../sections/FeaturesSection';
import { HeroSection } from '../sections/HeroSection';
import { HowItWorksSection } from '../sections/HowItWorksSection';
import { RelatedPagesSection } from '../sections/RelatedPagesSection';
import { UseCasesSection } from '../sections/UseCasesSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';

// Import interactive tools
import { BackgroundChanger } from '@/app/(pseo)/_components/tools/BackgroundChanger';
import { BackgroundRemover } from '@/app/(pseo)/_components/tools/BackgroundRemover';
import { BulkImageCompressor } from '@/app/(pseo)/_components/tools/BulkImageCompressor';
import { BulkImageResizer } from '@/app/(pseo)/_components/tools/BulkImageResizer';
import { FormatConverter } from '@/app/(pseo)/_components/tools/FormatConverter';
import { HeicConverter } from '@/app/(pseo)/_components/tools/HeicConverter';
import { ImageCompressor } from '@/app/(pseo)/_components/tools/ImageCompressor';
import { ImageResizer } from '@/app/(pseo)/_components/tools/ImageResizer';
import { ImageToPdfConverter } from '@/app/(pseo)/_components/tools/ImageToPdfConverter';
import { ImageToText } from '@/app/(pseo)/_components/tools/ImageToText';
import { PdfToImageConverter } from '@/app/(pseo)/_components/tools/PdfToImageConverter';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOL_COMPONENTS: Record<string, React.ComponentType<any>> = {
  ImageResizer,
  ImageCompressor,
  FormatConverter,
  BulkImageCompressor,
  BulkImageResizer,
  BackgroundRemover,
  BackgroundChanger,
  HeicConverter,
  PdfToImageConverter,
  ImageToPdfConverter,
  ImageToText,
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
    case 'HeicConverter':
      return {
        defaultOutputFormat: config.defaultOutputFormat,
      };
    case 'PdfToImageConverter':
      return {
        defaultOutputFormat: config.defaultOutputFormat,
        defaultDpi: config.defaultDpi,
      };
    case 'ImageToPdfConverter':
      return {
        acceptedInputFormats: config.acceptedInputFormats,
      };
    default:
      return {};
  }
}

/**
 * Cross-sell CTA shown after the interactive tool widget
 * Phase 9: Post-tool cross-sell for AI upscaling
 */
function PostToolCTA({ slug }: { slug: string }): ReactElement | null {
  // Skip for pages that already are about AI enhancement
  const aiPages = ['ai-photo-enhancer', 'photo-restoration', 'photo-quality-enhancer'];
  if (aiPages.includes(slug)) return null;

  return (
    <div className="mt-8 p-5 bg-surface-light border border-border rounded-xl flex flex-col sm:flex-row items-start sm:items-center gap-4">
      <div className="flex-1">
        <p className="text-sm font-semibold text-primary">Want sharper, larger images?</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          After processing, upscale your image 2–4× with AI for print-quality results.
        </p>
      </div>
      <a
        href="/?signup=1"
        className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 transition-colors"
      >
        Try AI Upscaler Free →
      </a>
    </div>
  );
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
  const t = useTranslations('pseo');

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
          {/* Interactive Tool Component */}
          {ToolComponent && (
            <FadeIn delay={0.1}>
              <div className="py-12">
                <ToolComponent {...getToolProps(data.toolComponent!, data.toolConfig)} />
                {/* Phase 9: Post-tool cross-sell CTA */}
                <PostToolCTA slug={data.slug} />
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
            <FeaturesSection
              features={data.features}
              title={t('templates.tool.features.title')}
              subtitle={t('templates.tool.features.subtitle')}
            />
          </div>

          {/* How It Works */}
          <div className="py-12">
            <HowItWorksSection
              steps={data.howItWorks}
              title={t('templates.tool.howItWorks.title')}
              subtitle={t('templates.tool.howItWorks.subtitle')}
            />
          </div>

          {/* Use Cases */}
          <div className="py-12">
            <UseCasesSection
              useCases={data.useCases}
              title={t('templates.tool.useCases.title')}
              subtitle={t('templates.tool.useCases.subtitle')}
            />
          </div>

          {/* Benefits */}
          <div className="py-12">
            <BenefitsSection
              benefits={data.benefits}
              title={t('templates.tool.benefits.title')}
              subtitle={t('templates.tool.benefits.subtitle')}
            />
          </div>

          {/* Related Pages */}
          {relatedPages.length > 0 && (
            <div className="py-12">
              <RelatedPagesSection
                relatedPages={relatedPages}
                title={t('templates.tool.relatedPages.title')}
              />
            </div>
          )}

          {/* FAQ */}
          <div className="py-12">
            <FAQSection faqs={data.faq} pageType="tool" slug={data.slug} />
          </div>

          {/* External Sources */}
          {data.externalSources && data.externalSources.length > 0 && (
            <div className="py-4">
              <ExternalSourcesSection sources={data.externalSources} />
            </div>
          )}
        </article>
      </div>

      {/* Final CTA Full Width */}
      <CTASection
        title={t('templates.tool.cta.title')}
        description={t('templates.tool.cta.description')}
        ctaText={t('templates.tool.cta.ctaText')}
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
