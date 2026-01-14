/**
 * Platform Page Template Component
 * Template for AI platform integration landing pages (Midjourney, Stable Diffusion, etc.)
 */

'use client';

import type { IPlatformPage } from '@/lib/seo/pseo-types';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import type { IRelatedPage } from '@/lib/seo/related-pages';
import { ReactElement } from 'react';
import { BeforeAfterSlider } from '@client/components/ui/BeforeAfterSlider';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { BenefitsSection } from '../sections/BenefitsSection';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { HeroSection } from '../sections/HeroSection';
import { UseCasesSection } from '../sections/UseCasesSection';
import { RelatedPagesSection } from '../sections/RelatedPagesSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';
import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';

interface IPlatformPageTemplateProps {
  data: IPlatformPage;
  locale?: string;
  relatedPages?: IRelatedPage[];
}

export function PlatformPageTemplate({ data, locale, relatedPages = [] }: IPlatformPageTemplateProps): ReactElement {
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

  const sliderLabels = getBeforeAfterLabels(locale);

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
        pageType="platform"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="platform" slug={data.slug} />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Breadcrumb */}
        <div className="pt-6 pb-4">
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

        <article>
          {/* Hero Section */}
          <HeroSection
            h1={data.h1}
            intro={data.intro}
            ctaText="Try Free"
            ctaUrl="/upscaler"
            pageType="platform"
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

          {/* Detailed Description (Phase 8) */}
          {data.detailedDescription && (
            <FadeIn delay={0.22}>
              <div className="max-w-4xl mx-auto py-6">
                <div className="prose prose-lg max-w-none">
                  {data.detailedDescription.split('\n\n').map((paragraph, index) => (
                    <p key={index} className="text-text-secondary leading-relaxed mb-4">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            </FadeIn>
          )}

          {/* Before/After Slider */}
          <FadeIn delay={0.25}>
            <div className="py-12">
              <div className="max-w-3xl mx-auto">
                <BeforeAfterSlider
                  beforeUrl="/before-after/women-before.webp"
                  afterUrl="/before-after/women-after.webp"
                  beforeLabel={sliderLabels.before}
                  afterLabel={sliderLabels.after}
                  className="shadow-2xl shadow-accent/10"
                />
              </div>
            </div>
          </FadeIn>

          {/* Benefits */}
          {data.benefits && data.benefits.length > 0 && (
            <BenefitsSection benefits={data.benefits} />
          )}

          {/* Integration Features */}
          {data.integration && data.integration.length > 0 && (
            <FadeIn delay={0.3}>
              <section className="py-12">
                <h2 className="text-2xl font-semibold text-text-primary text-center mb-8">
                  Integration Features
                </h2>
                <div className="max-w-3xl mx-auto bg-surface-light rounded-xl p-6 border border-border-default">
                  <ul className="space-y-3">
                    {data.integration.map((feature, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className="text-accent-success mt-1">✓</span>
                        <span className="text-text-secondary">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </FadeIn>
          )}

          {/* Technical Details (Phase 8) */}
          {data.technicalDetails && (
            <FadeIn delay={0.32}>
              <section className="py-12">
                <h2 className="text-2xl font-semibold text-text-primary text-center mb-8">
                  Technical Specifications
                </h2>
                <div className="max-w-4xl mx-auto bg-surface-light rounded-xl p-8 border border-border-default">
                  <div className="prose prose-lg max-w-none">
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

          {/* Best Practices (Phase 8) */}
          {data.bestPractices && data.bestPractices.length > 0 && (
            <FadeIn delay={0.34}>
              <section className="py-12">
                <h2 className="text-2xl font-semibold text-text-primary text-center mb-8">
                  Best Practices
                </h2>
                <div className="max-w-4xl mx-auto">
                  <div className="bg-surface-light rounded-xl p-8 border border-border-default">
                    <ul className="space-y-4">
                      {data.bestPractices.map((practice, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <span className="text-accent-primary mt-1 flex-shrink-0">•</span>
                          <span className="text-text-secondary">{practice}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            </FadeIn>
          )}

          {/* Comparison Notes (Phase 8) */}
          {data.comparisonNotes && (
            <FadeIn delay={0.36}>
              <section className="py-12">
                <h2 className="text-2xl font-semibold text-text-primary text-center mb-8">
                  How This Compares
                </h2>
                <div className="max-w-4xl mx-auto bg-surface-light rounded-xl p-8 border border-border-default">
                  <div className="prose prose-lg max-w-none">
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
          {data.useCases && data.useCases.length > 0 && (
            <UseCasesSection useCases={data.useCases} />
          )}

          {/* Workflow Steps */}
          {data.workflowSteps && data.workflowSteps.length > 0 && (
            <FadeIn delay={0.5}>
              <section className="py-12">
                <h2 className="text-2xl font-semibold text-text-primary text-center mb-8">
                  How to Use
                </h2>
                <div className="max-w-3xl mx-auto space-y-4">
                  {data.workflowSteps.map((step, index) => (
                    <div key={index} className="flex gap-4 items-start">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent-primary text-white flex items-center justify-center text-sm font-semibold">
                        {index + 1}
                      </div>
                      <div className="flex-1 pb-4 border-b border-border-default last:border-0 pt-1">
                        <p className="text-text-secondary">{step}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* Related Pages */}
          {relatedPages.length > 0 && <RelatedPagesSection relatedPages={relatedPages} />}

          {/* FAQ */}
          {data.faq && data.faq.length > 0 && (
            <FAQSection faqs={data.faq} pageType="platform" slug={data.slug} />
          )}

          {/* Final CTA */}
          <div className="py-8">
            <FadeIn>
              <CTASection
                title={`Ready to enhance your ${data.platformName || 'AI'} images?`}
                description="Start enhancing images with AI today. No credit card required."
                ctaText="Try Free"
                ctaUrl="/upscaler"
                pageType="platform"
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
