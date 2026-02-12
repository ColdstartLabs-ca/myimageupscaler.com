/**
 * Platform Page Template Component
 * Template for AI platform integration landing pages (Midjourney, Stable Diffusion, etc.)
 */

'use client';

import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import type { IPlatformPage } from '@/lib/seo/pseo-types';
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

interface IPlatformPageTemplateProps {
  data: IPlatformPage;
  locale?: string;
  relatedPages?: IRelatedPage[];
}

export function PlatformPageTemplate({
  data,
  locale,
  relatedPages = [],
}: IPlatformPageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/platforms/${data.slug}`);
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
        pageType="platform"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="platform" slug={data.slug} />

      {/* Full Width Hero Area */}
      <div className="relative">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative z-30 pt-6">
          <BreadcrumbNav
            items={[
              { label: 'Home', href: locale ? `/${locale}` : '/' },
              { label: 'Platforms', href: locale ? `/${locale}/platforms` : '/platforms' },
              {
                label: data.platformName || data.title,
                href: locale ? `/${locale}/platforms/${data.slug}` : `/platforms/${data.slug}`,
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
            pageType="platform"
            slug={data.slug}
          />
        </div>
      </div>

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        <article>
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

          {/* Detailed Description */}
          {data.detailedDescription && (
            <FadeIn delay={0.22}>
              <div className="max-w-4xl mx-auto py-6">
                <div className="prose prose-lg prose-invert max-w-none">
                  {data.detailedDescription.split('\n\n').map((paragraph, index) => (
                    <p key={index} className="text-text-secondary leading-relaxed mb-4">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            </FadeIn>
          )}

          {/* Before/After Slider Removed (Bird Image) */}

          {/* Benefits */}
          <div className="py-12">
            {data.benefits && data.benefits.length > 0 && (
              <BenefitsSection benefits={data.benefits} />
            )}
          </div>

          {/* Integration Features */}
          {data.integration && data.integration.length > 0 && (
            <FadeIn delay={0.3}>
              <section className="py-12">
                <h2 className="text-2xl font-bold text-white text-center mb-8">
                  Integration Features
                </h2>
                <div className="max-w-3xl mx-auto glass-card-2025 p-8 border-white/10">
                  <ul className="space-y-4">
                    {data.integration.map((feature, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className="text-success mt-1 shrink-0">✓</span>
                        <span className="text-text-secondary text-lg">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </FadeIn>
          )}

          {/* Technical Details */}
          {data.technicalDetails && (
            <FadeIn delay={0.32}>
              <section className="py-12">
                <h2 className="text-2xl font-bold text-white text-center mb-8">
                  Technical Specifications
                </h2>
                <div className="max-w-4xl mx-auto glass-card-2025 p-8 border-white/10">
                  <div className="prose prose-lg prose-invert max-w-none">
                    {data.technicalDetails.split('\n\n').map((paragraph, index) => (
                      <p key={index} className="text-text-secondary leading-relaxed mb-4">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>
              </section>
            </FadeIn>
          )}

          {/* Best Practices */}
          {data.bestPractices && data.bestPractices.length > 0 && (
            <FadeIn delay={0.34}>
              <section className="py-12">
                <h2 className="text-2xl font-bold text-white text-center mb-8">
                  Best Practices
                </h2>
                <div className="max-w-4xl mx-auto">
                  <div className="glass-card-2025 p-8 border-white/10">
                    <ul className="space-y-4">
                      {data.bestPractices.map((practice, index) => (
                        <li key={index} className="flex items-start gap-4">
                          <span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                          <span className="text-text-secondary text-lg">{practice}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            </FadeIn>
          )}

          {/* Comparison Notes */}
          {data.comparisonNotes && (
            <FadeIn delay={0.36}>
              <section className="py-12">
                <h2 className="text-2xl font-bold text-white text-center mb-8">
                  How This Compares
                </h2>
                <div className="max-w-4xl mx-auto glass-card-2025 p-8 border-white/10">
                  <div className="prose prose-lg prose-invert max-w-none">
                    {data.comparisonNotes.split('\n\n').map((paragraph, index) => (
                      <p key={index} className="text-text-secondary leading-relaxed mb-4">
                        {paragraph}
                      </p>
                    ))}
                  </div>
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

          {/* Workflow Steps */}
          {data.workflowSteps && data.workflowSteps.length > 0 && (
            <FadeIn delay={0.5}>
              <section className="py-12">
                <h2 className="text-2xl font-bold text-white text-center mb-8">
                  How to Use
                </h2>
                <div className="max-w-3xl mx-auto space-y-8">
                  {data.workflowSteps.map((step, index) => (
                    <div key={index} className="flex gap-6 items-start">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center text-lg font-bold shadow-lg shadow-accent/20">
                        {index + 1}
                      </div>
                      <div className="flex-1 pb-6 border-b border-white/10 last:border-0 pt-1">
                        <p className="text-text-secondary text-lg">{step}</p>
                      </div>
                    </div>
                  ))}
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
              <FAQSection faqs={data.faq} pageType="platform" slug={data.slug} />
            </div>
          )}
        </article>
      </div>

      {/* Final CTA Full Width */}
      <CTASection
        title={`Ready to enhance your ${data.platformName || 'AI'} images?`}
        description="Start enhancing images with AI today. No credit card required."
        ctaText="Try Free"
        ctaUrl="/"
        pageType="platform"
        slug={data.slug}
      />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Footer spacing */}
        <div className="pb-16" />
      </div>
    </div>
  );
}
