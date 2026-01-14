/**
 * Platform Format Page Template Component
 * Template for platform × format multiplier pages (Midjourney PNG, SD WebP, etc.)
 */

'use client';

import type { IPlatformFormatPage } from '@/lib/seo/pseo-types';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import { getRelatedPages, type IRelatedPage } from '@/lib/seo/related-pages';
import { ReactElement, useEffect, useState } from 'react';
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

interface IPlatformFormatPageTemplateProps {
  data: IPlatformFormatPage;
  locale?: string;
}

export function PlatformFormatPageTemplate({
  data,
  locale,
}: IPlatformFormatPageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/platform-format/${data.slug}`);
  const tier = pageMapping?.tier;

  // State for related pages
  const [relatedPages, setRelatedPages] = useState<IRelatedPage[]>([]);

  // Fetch related pages on mount
  useEffect(() => {
    getRelatedPages(
      'platform-format',
      data.slug,
      (locale as 'en' | 'es' | 'pt' | 'de' | 'fr' | 'it' | 'ja') || 'en'
    ).then(pages => {
      setRelatedPages(pages);
    });
  }, [data.slug, locale]);

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
        pageType="platform-format"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="platform-format" slug={data.slug} />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Breadcrumb */}
        <div className="pt-6 pb-4">
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

        <article>
          {/* Hero Section */}
          <HeroSection
            h1={data.h1}
            intro={data.intro}
            ctaText="Try Free"
            ctaUrl="/upscaler"
            pageType="platform-format"
            slug={data.slug}
          />

          {/* Platform & Format Info */}
          <FadeIn delay={0.2}>
            <div className="py-8">
              <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-6">
                {data.platformDescription && (
                  <div className="bg-surface-light rounded-xl p-6 border border-border-default">
                    <h3 className="text-lg font-semibold text-text-primary mb-3">
                      About {data.platform}
                    </h3>
                    <p className="text-text-secondary text-sm">{data.platformDescription}</p>
                  </div>
                )}
                {data.formatDescription && (
                  <div className="bg-surface-light rounded-xl p-6 border border-border-default">
                    <h3 className="text-lg font-semibold text-text-primary mb-3">
                      {data.format} Format
                    </h3>
                    <p className="text-text-secondary text-sm">{data.formatDescription}</p>
                  </div>
                )}
              </div>
            </div>
          </FadeIn>

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

          {/* Platform Settings */}
          {data.platformSettings && (
            <FadeIn delay={0.25}>
              <div className="py-6">
                <div className="max-w-3xl mx-auto bg-accent-primary/5 rounded-xl p-6 border border-accent-primary/20">
                  <h3 className="text-lg font-semibold text-text-primary mb-3">
                    Recommended Settings
                  </h3>
                  <p className="text-text-secondary">{data.platformSettings}</p>
                </div>
              </div>
            </FadeIn>
          )}

          {/* Benefits */}
          {data.benefits && data.benefits.length > 0 && (
            <BenefitsSection benefits={data.benefits} />
          )}

          {/* Export Tips */}
          {data.exportTips && data.exportTips.length > 0 && (
            <FadeIn delay={0.3}>
              <section className="py-12">
                <h2 className="text-2xl font-semibold text-text-primary text-center mb-8">
                  Export Tips
                </h2>
                <div className="max-w-3xl mx-auto bg-surface-light rounded-xl p-6 border border-border-default">
                  <ul className="space-y-3">
                    {data.exportTips.map((tip, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className="text-accent-success mt-1">✓</span>
                        <span className="text-text-secondary">{tip}</span>
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
                <h2 className="text-2xl font-semibold text-text-primary text-center mb-8">
                  Workflow
                </h2>
                <div className="max-w-3xl mx-auto space-y-4">
                  {data.workflowTips.map((tip, index) => (
                    <div key={index} className="flex gap-4 items-start">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent-primary text-white flex items-center justify-center text-sm font-semibold">
                        {index + 1}
                      </div>
                      <div className="flex-1 pb-4 border-b border-border-default last:border-0 pt-1">
                        <p className="text-text-secondary">{tip}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* Use Cases */}
          {data.useCases && data.useCases.length > 0 && (
            <UseCasesSection useCases={data.useCases} />
          )}

          {/* Related Pages */}
          {relatedPages.length > 0 && <RelatedPagesSection relatedPages={relatedPages} />}

          {/* FAQ */}
          {data.faq && data.faq.length > 0 && (
            <FAQSection faqs={data.faq} pageType="platform-format" slug={data.slug} />
          )}

          {/* Final CTA */}
          <div className="py-8">
            <FadeIn>
              <CTASection
                title={`Ready to upscale your ${data.platform} ${data.format} images?`}
                description="Start enhancing images with AI today. No credit card required."
                ctaText="Try Free"
                ctaUrl="/upscaler"
                pageType="platform-format"
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
