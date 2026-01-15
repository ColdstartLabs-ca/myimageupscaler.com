/**
 * Device Use Page Template Component
 * Template for device × use case multiplier pages (mobile social media, desktop professional, etc.)
 */

'use client';

import type { IDeviceUseCasePage } from '@/lib/seo/pseo-types';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import type { IRelatedPage } from '@/lib/seo/related-pages';
import { ReactElement } from 'react';
import { BeforeAfterSlider } from '@client/components/ui/BeforeAfterSlider';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { HeroSection } from '../sections/HeroSection';
import { RelatedPagesSection } from '../sections/RelatedPagesSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';
import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';

interface IDeviceUsePageTemplateProps {
  data: IDeviceUseCasePage;
  locale?: string;
  relatedPages?: IRelatedPage[];
}

export function DeviceUsePageTemplate({
  data,
  locale,
  relatedPages = [],
}: IDeviceUsePageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/device-use/${data.slug}`);
  const tier = pageMapping?.tier;

  // Get device icon
  const getDeviceIcon = (device: string) => {
    switch (device) {
      case 'mobile':
        return '📱';
      case 'desktop':
        return '🖥️';
      case 'tablet':
        return '📲';
      default:
        return '💻';
    }
  };

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
        pageType="device-use"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="device-use" slug={data.slug} />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Breadcrumb */}
        <div className="pt-6 pb-4">
          <BreadcrumbNav
            items={[
              { label: 'Home', href: locale ? `/${locale}` : '/' },
              { label: 'Device Use', href: locale ? `/${locale}/device-use` : '/device-use' },
              {
                label: `${data.device} ${data.useCase}`,
                href: locale ? `/${locale}/device-use/${data.slug}` : `/device-use/${data.slug}`,
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
            ctaUrl="/"
            pageType="device-use"
            slug={data.slug}
          />

          {/* Device & Use Case Info */}
          <FadeIn delay={0.2}>
            <div className="py-8">
              <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-6">
                {data.deviceDescription && (
                  <div className="bg-surface-light rounded-xl p-6 border border-border-default">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">{getDeviceIcon(data.device)}</span>
                      <h3 className="text-lg font-semibold text-text-primary capitalize">
                        {data.device} Device
                      </h3>
                    </div>
                    <p className="text-text-secondary text-sm">{data.deviceDescription}</p>
                  </div>
                )}
                {data.useCaseDescription && (
                  <div className="bg-surface-light rounded-xl p-6 border border-border-default">
                    <h3 className="text-lg font-semibold text-text-primary mb-3">
                      {data.useCase} Use Case
                    </h3>
                    <p className="text-text-secondary text-sm">{data.useCaseDescription}</p>
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

          {/* Device Constraints */}
          {data.deviceConstraints && data.deviceConstraints.length > 0 && (
            <FadeIn delay={0.3}>
              <section className="py-12">
                <h2 className="text-2xl font-semibold text-text-primary text-center mb-8">
                  {data.device.charAt(0).toUpperCase() + data.device.slice(1)} Considerations
                </h2>
                <div className="max-w-3xl mx-auto bg-surface-light rounded-xl p-6 border border-border-default">
                  <ul className="space-y-3">
                    {data.deviceConstraints.map((constraint, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className="text-accent-warning mt-1">⚠️</span>
                        <span className="text-text-secondary">{constraint}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </FadeIn>
          )}

          {/* Use Case Benefits */}
          {data.useCaseBenefits && data.useCaseBenefits.length > 0 && (
            <FadeIn delay={0.4}>
              <section className="py-12">
                <h2 className="text-2xl font-semibold text-text-primary text-center mb-8">
                  Benefits for {data.useCase}
                </h2>
                <div className="max-w-3xl mx-auto bg-accent-success/5 rounded-xl p-6 border border-accent-success/20">
                  <ul className="space-y-3">
                    {data.useCaseBenefits.map((benefit, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className="text-accent-success mt-1">✓</span>
                        <span className="text-text-secondary">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </FadeIn>
          )}

          {/* Tips */}
          {data.tips && data.tips.length > 0 && (
            <FadeIn delay={0.5}>
              <section className="py-12">
                <h2 className="text-2xl font-semibold text-text-primary text-center mb-8">
                  Pro Tips
                </h2>
                <div className="max-w-3xl mx-auto bg-accent-primary/5 rounded-xl p-6 border border-accent-primary/20">
                  <ul className="space-y-3">
                    {data.tips.map((tip, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className="text-accent-primary mt-1">💡</span>
                        <span className="text-text-secondary">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </FadeIn>
          )}

          {/* Related Pages */}
          {relatedPages.length > 0 && <RelatedPagesSection relatedPages={relatedPages} />}

          {/* FAQ */}
          {data.faq && data.faq.length > 0 && (
            <FAQSection faqs={data.faq} pageType="device-use" slug={data.slug} />
          )}

          {/* Final CTA */}
          <div className="py-8">
            <FadeIn>
              <CTASection
                title={`Ready to optimize images for ${data.useCase.toLowerCase()} on ${data.device}?`}
                description="Start enhancing images with AI today. No credit card required."
                ctaText="Try Free"
                ctaUrl="/"
                pageType="device-use"
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
