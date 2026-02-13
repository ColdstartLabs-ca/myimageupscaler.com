/**
 * Use Case Page Template Component
 * Template for industry-specific use case landing pages
 */

'use client';

import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import type { IUseCasePage } from '@/lib/seo/pseo-types';
import type { IRelatedPage } from '@/lib/seo/related-pages';
import { BeforeAfterSlider } from '@client/components/ui/BeforeAfterSlider';
import { ReactElement } from 'react';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { HeroSection } from '../sections/HeroSection';
import { RelatedPagesSection } from '../sections/RelatedPagesSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';

interface IUseCasePageTemplateProps {
  data: IUseCasePage & {
    // Extended fields from actual JSON data
    platformRequirements?: Array<{
      platform: string;
      minimumSize: string;
      recommendedSize: string;
      maxFileSize: string;
      aspectRatio: string;
      format: string;
      background: string;
      notes: string;
    }>;
    commonProblems?: Array<{
      problem: string;
      solution: string;
      howTo: string;
    }>;
    workflow?: Array<{
      step: number;
      title: string;
      description: string;
    }>;
  };
  locale?: string;
  relatedPages?: IRelatedPage[];
}

export function UseCasePageTemplate({
  data,
  locale,
  relatedPages = [],
}: IUseCasePageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/use-cases/${data.slug}`);
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
        pageType="use-case"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="use-case" slug={data.slug} />

      {/* Full Width Hero Area */}
      <div className="relative">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative z-30 pt-6">
          <BreadcrumbNav
            items={[
              { label: 'Home', href: locale ? `/${locale}` : '/' },
              { label: 'Use Cases', href: locale ? `/${locale}/use-cases` : '/use-cases' },
              {
                label: data.industry || data.title,
                href: locale ? `/${locale}/use-cases/${data.slug}` : `/use-cases/${data.slug}`,
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
            pageType="use-case"
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

          {/* Before/After Slider - Page-specific images when available */}
          {data.beforeAfterImages && (
            <FadeIn delay={0.25}>
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

          {/* Platform Requirements */}
          {data.platformRequirements && data.platformRequirements.length > 0 && (
            <FadeIn delay={0.3}>
              <section className="py-12">
                <h2 className="text-2xl font-bold text-white text-center mb-8">
                  Platform Requirements
                </h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {data.platformRequirements.map((req, index) => (
                    <div key={index} className="glass-card-2025 p-6">
                      <h3 className="text-lg font-bold text-white mb-4">{req.platform}</h3>
                      <div className="space-y-2 text-sm text-text-secondary">
                        <div className="flex justify-between">
                          <span>Minimum:</span>
                          <span className="font-medium text-text-primary">{req.minimumSize}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Recommended:</span>
                          <span className="font-medium text-text-primary">
                            {req.recommendedSize}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Max File:</span>
                          <span className="font-medium text-text-primary">{req.maxFileSize}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Aspect Ratio:</span>
                          <span className="font-medium text-text-primary">{req.aspectRatio}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Format:</span>
                          <span className="font-medium text-text-primary">{req.format}</span>
                        </div>
                      </div>
                      {req.notes && (
                        <p className="mt-4 text-xs text-text-tertiary border-t border-white/10 pt-3">
                          {req.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* Common Problems */}
          {data.commonProblems && data.commonProblems.length > 0 && (
            <FadeIn delay={0.4}>
              <section className="py-12">
                <h2 className="text-2xl font-bold text-white text-center mb-8">
                  Common Problems & Solutions
                </h2>
                <div className="space-y-6">
                  {data.commonProblems.map((item, index) => (
                    <div key={index} className="glass-card-2025 p-6">
                      <h3 className="text-lg font-bold text-white mb-2">{item.problem}</h3>
                      <p className="text-text-secondary mb-3">{item.solution}</p>
                      {item.howTo && (
                        <div className="bg-white/5 rounded-lg p-4 text-sm border border-white/10">
                          <span className="font-medium text-accent">How to: </span>
                          <span className="text-text-secondary">{item.howTo}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* Workflow Steps */}
          {data.workflow && data.workflow.length > 0 && (
            <FadeIn delay={0.5}>
              <section className="py-12">
                <h2 className="text-2xl font-bold text-white text-center mb-8">
                  Step-by-Step Workflow
                </h2>
                <div className="max-w-3xl mx-auto space-y-4">
                  {data.workflow.map((step, index) => (
                    <div key={index} className="flex gap-6 items-start">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center text-lg font-bold shadow-lg shadow-accent/20">
                        {step.step}
                      </div>
                      <div className="flex-1 pb-6 border-b border-white/10 last:border-0">
                        <h3 className="font-bold text-white text-lg mb-1">{step.title}</h3>
                        <p className="text-text-secondary text-base">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* Challenges (from type definition) */}
          {data.challenges && data.challenges.length > 0 && (
            <FadeIn delay={0.4}>
              <section className="py-12">
                <h2 className="text-2xl font-bold text-white text-center mb-8">Key Challenges</h2>
                <div className="max-w-3xl mx-auto">
                  <div className="glass-card-2025 p-8">
                    <ul className="space-y-4">
                      {data.challenges.map((challenge, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                          <span className="text-text-secondary text-lg">{challenge}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
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
              <FAQSection faqs={data.faq} pageType="use-case" slug={data.slug} />
            </div>
          )}
        </article>
      </div>

      {/* Final CTA Full Width */}
      <CTASection
        title={`Ready to optimize your ${data.industry || 'images'}?`}
        description="Start enhancing images with AI today. No credit card required."
        ctaText="Try Free"
        ctaUrl="/"
        pageType="use-case"
        slug={data.slug}
      />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Footer spacing */}
        <div className="pb-16" />
      </div>
    </div>
  );
}
