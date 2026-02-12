/**
 * Platform Format Page Template Component
 * Template for platform × format multiplier pages (Midjourney PNG, SD WebP, etc.)
 */

'use client';

import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import type { IPlatformFormatPage } from '@/lib/seo/pseo-types';
import type { IRelatedPage } from '@/lib/seo/related-pages';
import { ReactElement } from 'react';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { BenefitsSection } from '../sections/BenefitsSection';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { HeroSection } from '../sections/HeroSection';
import { RelatedPagesSection } from '../sections/RelatedPagesSection';
import { UseCasesSection } from '../sections/UseCasesSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';

interface IPlatformFormatPageTemplateProps {
  data: IPlatformFormatPage;
  locale?: string;
  relatedPages?: IRelatedPage[];
}

export function PlatformFormatPageTemplate({
  data,
  locale,
  relatedPages = [],
}: IPlatformFormatPageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/platform-format/${data.slug}`);
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

  const _sliderLabels = getBeforeAfterLabels(locale);

  return (
    <div className="min-h-screen bg-main relative overflow-x-hidden">
      <PSEOPageTracker
        pageType="platform-format"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="platform-format" slug={data.slug} />

      {/* Full Width Hero Area */}
      <div className="relative">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative z-30 pt-6">
          <BreadcrumbNav
            items={[
              { label: 'Home', href: locale ? `/${locale}` : '/' },
              {
                label: 'Platform Format',
                href: locale ? `/${locale}/platform-format` : '/platform-format',
              },
              {
                label: `${data.platform} ${data.format}`,
                href: locale
                  ? `/${locale}/platform-format/${data.slug}`
                  : `/platform-format/${data.slug}`,
              },
            ]}
          />
        </div>

        <div className="relative h-full">
          <HeroSection
            h1={data.h1}
            intro={data.intro}
            ctaText="Try Free"
            ctaUrl="/"
            pageType="platform-format"
            slug={data.slug}
          />
        </div>
      </div>

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        <article>
          {/* Platform & Format Info */}
          <FadeIn delay={0.2}>
            <div className="py-8">
              <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-8">
                {data.platformDescription && (
                  <div className="glass-card-2025 p-8 border-white/10">
                    <h3 className="text-xl font-bold text-white mb-4">
                      About {data.platform}
                    </h3>
                    <p className="text-text-secondary text-base leading-relaxed">{data.platformDescription}</p>
                  </div>
                )}
                {data.formatDescription && (
                  <div className="glass-card-2025 p-8 border-accent/20">
                    <h3 className="text-xl font-bold text-white mb-4">
                      {data.format} Format
                    </h3>
                    <p className="text-text-secondary text-base leading-relaxed">{data.formatDescription}</p>
                  </div>
                )}
              </div>
            </div>
          </FadeIn>

          {/* Before/After Slider Removed (Bird Image) */}

          {/* Platform Settings */}
          {data.platformSettings && (
            <FadeIn delay={0.25}>
              <div className="py-6">
                <div className="max-w-3xl mx-auto glass-card-2025 p-12 border-accent/30 bg-accent/5">
                  <h3 className="text-2xl font-bold text-white text-center mb-6">
                    Recommended Settings
                  </h3>
                  <p className="text-text-secondary text-lg text-center leading-relaxed font-light">{data.platformSettings}</p>
                </div>
              </div>
            </FadeIn>
          )}

          {/* Benefits */}
          <div className="py-12">
            {data.benefits && data.benefits.length > 0 && (
              <BenefitsSection benefits={data.benefits} />
            )}
          </div>

          {/* Export Tips */}
          {data.exportTips && data.exportTips.length > 0 && (
            <FadeIn delay={0.3}>
              <section className="py-12">
                <h2 className="text-2xl font-bold text-white text-center mb-12">
                  Export Tips
                </h2>
                <div className="max-w-3xl mx-auto glass-card-2025 p-8 border-white/10">
                  <ul className="space-y-4">
                    {data.exportTips.map((tip, index) => (
                      <li key={index} className="flex items-start gap-4">
                        <span className="text-success mt-1 shrink-0">✓</span>
                        <span className="text-text-secondary text-lg leading-relaxed">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </FadeIn>
          )}

          {/* Workflow Tips */}
          {data.workflowTips && data.workflowTips.length > 0 && (
            <FadeIn delay={0.4}>
              <section className="py-12">
                <h2 className="text-3xl font-bold text-white text-center mb-12">
                  Workflow
                </h2>
                <div className="max-w-3xl mx-auto space-y-8">
                  {data.workflowTips.map((tip, index) => (
                    <div key={index} className="flex gap-6 items-start">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center text-lg font-bold shadow-lg shadow-accent/20">
                        {index + 1}
                      </div>
                      <div className="flex-1 pb-6 border-b border-white/10 last:border-0 pt-1">
                        <p className="text-text-secondary text-lg leading-relaxed">{tip}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* Use Cases */}
          <div className="py-12">
            {data.useCases && data.useCases.length > 0 && (
              <UseCasesSection useCases={data.useCases} />
            )}
          </div>

          {/* Related Pages */}
          {relatedPages.length > 0 && (
            <div className="py-12">
              <RelatedPagesSection relatedPages={relatedPages} />
            </div>
          )}

          {/* FAQ */}
          {data.faq && data.faq.length > 0 && (
            <div className="py-12">
              <FAQSection faqs={data.faq} pageType="platform-format" slug={data.slug} />
            </div>
          )}
        </article>
      </div>

      {/* Final CTA Full Width */}
      <CTASection
        title={`Ready to upscale your ${data.platform} ${data.format} images?`}
        description="Start enhancing images with AI today. No credit card required."
        ctaText="Try Free"
        ctaUrl="/"
        pageType="platform-format"
        slug={data.slug}
      />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Footer spacing */}
        <div className="pb-16" />
      </div>
    </div>
  );
}
