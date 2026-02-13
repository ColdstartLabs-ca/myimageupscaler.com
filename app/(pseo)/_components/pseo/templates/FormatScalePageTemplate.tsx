/**
 * Format Scale Page Template Component
 * Template for format × scale multiplier pages (JPEG 2x, PNG 4x, etc.)
 */

'use client';

import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import type { IFormatScalePage } from '@/lib/seo/pseo-types';
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

interface IFormatScalePageTemplateProps {
  data: IFormatScalePage & {
    // Extended fields - bestPractices can be objects in JSON
    bestPractices?: Array<string | { title: string; description: string }>;
  };
  locale?: string;
  relatedPages?: IRelatedPage[];
}

export function FormatScalePageTemplate({
  data,
  locale,
  relatedPages = [],
}: IFormatScalePageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/format-scale/${data.slug}`);
  const tier = pageMapping?.tier;

  // Normalize bestPractices to handle both string[] and object[]
  const normalizedBestPractices = data.bestPractices?.map(bp =>
    typeof bp === 'string' ? { title: bp, description: '' } : bp
  );

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
        pageType="format-scale"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="format-scale" slug={data.slug} />

      {/* Full Width Hero Area */}
      <div className="relative">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative z-30 pt-6">
          <BreadcrumbNav
            items={[
              { label: 'Home', href: locale ? `/${locale}` : '/' },
              {
                label: 'Format Scale',
                href: locale ? `/${locale}/format-scale` : '/format-scale',
              },
              {
                label: `${data.format} ${data.scaleFactor}`,
                href: locale
                  ? `/${locale}/format-scale/${data.slug}`
                  : `/format-scale/${data.slug}`,
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
            pageType="format-scale"
            slug={data.slug}
          />
        </div>
      </div>

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        <article>
          {/* Format & Scale Info */}
          <FadeIn delay={0.2}>
            <div className="py-8">
              <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-8">
                {data.formatDescription && (
                  <div className="glass-card-2025 p-8 border-white/10">
                    <h3 className="text-xl font-bold text-white mb-4">About {data.format}</h3>
                    <p className="text-text-secondary text-base leading-relaxed">
                      {data.formatDescription}
                    </p>
                  </div>
                )}
                {data.scaleExpectations && (
                  <div className="glass-card-2025 p-8 border-accent/20">
                    <h3 className="text-xl font-bold text-white mb-4">
                      {data.scaleFactor} Scaling
                    </h3>
                    <p className="text-text-secondary text-base leading-relaxed">
                      {data.scaleExpectations}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </FadeIn>

          {/* Before/After Slider Removed (Bird Image) */}

          {/* Benefits */}
          <div className="py-12">
            {data.benefits && data.benefits.length > 0 && (
              <BenefitsSection benefits={data.benefits} />
            )}
          </div>

          {/* Use Cases */}
          <div className="py-12">
            {data.useCases && data.useCases.length > 0 && (
              <UseCasesSection useCases={data.useCases} />
            )}
          </div>

          {/* Best Practices */}
          {normalizedBestPractices && normalizedBestPractices.length > 0 && (
            <FadeIn delay={0.4}>
              <section className="py-12">
                <h2 className="text-2xl font-bold text-white text-center mb-12">Best Practices</h2>
                <div className="max-w-3xl mx-auto grid gap-6 md:grid-cols-2">
                  {normalizedBestPractices.map((practice, index) => (
                    <div key={index} className="glass-card-2025 p-6">
                      <h3 className="font-bold text-white text-lg mb-3">{practice.title}</h3>
                      {practice.description && (
                        <p className="text-text-secondary text-base leading-relaxed">
                          {practice.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* Tips */}
          {data.tips && data.tips.length > 0 && (
            <FadeIn delay={0.5}>
              <section className="py-12">
                <h2 className="text-2xl font-bold text-white text-center mb-12">Pro Tips</h2>
                <div className="max-w-3xl mx-auto glass-card-2025 p-8 border-accent/20">
                  <ul className="space-y-4">
                    {data.tips.map((tip, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                        <span className="text-text-secondary text-lg font-light leading-relaxed">
                          {tip}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </FadeIn>
          )}

          {/* Related Pages */}
          {relatedPages.length > 0 && (
            <div className="py-12">
              <RelatedPagesSection relatedPages={relatedPages} />
            </div>
          )}

          {/* FAQ */}
          {data.faq && data.faq.length > 0 && (
            <div className="py-12">
              <FAQSection faqs={data.faq} pageType="format-scale" slug={data.slug} />
            </div>
          )}
        </article>
      </div>

      {/* Final CTA Full Width */}
      <CTASection
        title={`Ready to upscale your ${data.format} images ${data.scaleFactor}?`}
        description="Start enhancing images with AI today. No credit card required."
        ctaText="Try Free"
        ctaUrl="/"
        pageType="format-scale"
        slug={data.slug}
      />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Footer spacing */}
        <div className="pb-16" />
      </div>
    </div>
  );
}
