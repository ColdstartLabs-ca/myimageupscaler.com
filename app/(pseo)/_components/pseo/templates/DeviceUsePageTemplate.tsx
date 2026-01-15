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
    <div className="min-h-screen bg-main relative">
      {/* Subtle background pattern */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Background blurs */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-0 w-[600px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, transparent 70%)',
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
                  <div className="glass-card-2025">
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
                  <div className="glass-card-2025">
                    <h3 className="text-lg font-semibold text-text-primary mb-3">
                      {data.useCase} Use Case
                    </h3>
                    <p className="text-text-secondary text-sm">{data.useCaseDescription}</p>
                  </div>
                )}
              </div>
            </div>
          </FadeIn>

          {/* Device Constraints */}
          {data.deviceConstraints && data.deviceConstraints.length > 0 && (
            <FadeIn delay={0.3}>
              <section className="py-16">
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
              <section className="py-16">
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

          {/* How It Works */}
          <FadeIn delay={0.45}>
            <section className="py-12">
              <h2 className="text-2xl font-semibold text-text-primary text-center mb-4">
                How to Upscale Images for {data.useCase} on {data.device}
              </h2>
              <p className="text-center text-text-secondary mb-8 max-w-2xl mx-auto">
                Optimize your images specifically for {data.useCase.toLowerCase()} on {data.device}{' '}
                devices with our AI-powered upscaling.
              </p>
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-accent-primary text-white rounded-full flex items-center justify-center font-bold">
                    1
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-1">Upload Your Image</h3>
                    <p className="text-text-secondary">
                      Simply drag and drop or select any image from your device. Our system supports
                      all common formats including JPEG, PNG, WebP, and more.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-accent-primary text-white rounded-full flex items-center justify-center font-bold">
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-1">Automatic Device Optimization</h3>
                    <p className="text-text-secondary">
                      Our AI automatically detects optimal settings for {data.device} displays and{' '}
                      {data.useCase.toLowerCase()} requirements, ensuring perfect output every time.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-accent-primary text-white rounded-full flex items-center justify-center font-bold">
                    3
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-1">Download Optimized Image</h3>
                    <p className="text-text-secondary">
                      Get your perfectly upscaled image ready for {data.useCase.toLowerCase()} on{' '}
                      {data.device}. Download instantly and start using right away.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </FadeIn>

          {/* Device-Specific Best Practices */}
          <FadeIn delay={0.5}>
            <section className="py-12 bg-surface-light rounded-2xl px-8 border border-border-default">
              <h2 className="text-2xl font-semibold text-text-primary text-center mb-4">
                Best Practices for {data.useCase} on {data.device}
              </h2>
              <p className="text-center text-text-secondary mb-8 max-w-2xl mx-auto">
                Follow these guidelines to get the best results when upscaling images for your
                specific use case.
              </p>
              <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <span className="text-accent-primary">✓</span> Image Preparation
                  </h3>
                  <ul className="space-y-2 text-text-secondary text-sm">
                    <li>• Start with the highest quality source available</li>
                    <li>• Use proper lighting for product photos</li>
                    <li>• Ensure correct orientation before upload</li>
                    <li>• Remove any compression artifacts first</li>
                    <li>• Check color accuracy before upscaling</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <span className="text-accent-primary">✓</span> Output Settings
                  </h3>
                  <ul className="space-y-2 text-text-secondary text-sm">
                    <li>• Match {data.device} display resolution</li>
                    <li>• Consider file size for mobile data usage</li>
                    <li>• Use appropriate format for the platform</li>
                    <li>• Test on actual {data.device} devices</li>
                    <li>• Keep backups of original images</li>
                  </ul>
                </div>
              </div>
            </section>
          </FadeIn>

          {/* Common Use Cases for This Device/Category */}
          <FadeIn delay={0.55}>
            <section className="py-12">
              <h2 className="text-2xl font-semibold text-text-primary text-center mb-4">
                Popular {data.useCase} Scenarios on {data.device}
              </h2>
              <p className="text-center text-text-secondary mb-8 max-w-2xl mx-auto">
                Discover how others are using AI upscaling for their {data.useCase.toLowerCase()}{' '}
                needs on {data.device}.
              </p>
              <div className="max-w-3xl mx-auto grid gap-4 md:grid-cols-2">
                <div className="bg-surface-light rounded-xl p-5 border border-border-default">
                  <h3 className="font-semibold mb-2">Content Creation</h3>
                  <p className="text-text-secondary text-sm">
                    Creators upscale thumbnails and preview images to ensure they look crisp when
                    viewed on {data.device} screens.
                  </p>
                </div>
                <div className="bg-surface-light rounded-xl p-5 border border-border-default">
                  <h3 className="font-semibold mb-2">E-commerce</h3>
                  <p className="text-text-secondary text-sm">
                    Online retailers enhance product photos to provide detailed views for customers
                    browsing on {data.device}.
                  </p>
                </div>
                <div className="bg-surface-light rounded-xl p-5 border border-border-default">
                  <h3 className="font-semibold mb-2">Social Media</h3>
                  <p className="text-text-secondary text-sm">
                    Marketers and influencers optimize images for maximum impact when shared on{' '}
                    {data.device} platforms.
                  </p>
                </div>
                <div className="bg-surface-light rounded-xl p-5 border border-border-default">
                  <h3 className="font-semibold mb-2">Professional Portfolio</h3>
                  <p className="text-text-secondary text-sm">
                    Photographers and designers showcase work with high-resolution images optimized
                    for {data.device} viewing.
                  </p>
                </div>
              </div>
            </section>
          </FadeIn>

          {/* Technical Information */}
          <FadeIn delay={0.6}>
            <section className="py-12">
              <h2 className="text-2xl font-semibold text-text-primary text-center mb-4">
                Understanding {data.device} Display Requirements
              </h2>
              <p className="text-center text-text-secondary mb-8 max-w-2xl mx-auto">
                Technical insights to help you make informed decisions about image upscaling for{' '}
                {data.device}.
              </p>
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="bg-surface-light rounded-xl p-6 border border-border-default">
                  <h3 className="font-semibold text-lg mb-3">Display Resolution Considerations</h3>
                  <p className="text-text-secondary text-sm">
                    {data.device === 'mobile' && (
                      <>
                        Mobile devices typically range from 1080p to 1440p resolution, with premium
                        models reaching 4K. Our AI upscales images to match these pixel densities,
                        ensuring your content looks sharp on any smartphone screen.
                      </>
                    )}
                    {data.device === 'desktop' && (
                      <>
                        Desktop monitors commonly support 1080p, 1440p, and 4K resolutions.
                        Upscaling ensures your images maintain clarity across all these display
                        sizes, from standard laptop screens to large desktop monitors.
                      </>
                    )}
                    {data.device === 'tablet' && (
                      <>
                        Tablets bridge the gap between mobile and desktop, typically featuring 2K to
                        3K displays. Our upscaling optimizes images specifically for these
                        intermediate screen sizes and aspect ratios.
                      </>
                    )}
                    {!['mobile', 'desktop', 'tablet'].includes(data.device) && (
                      <>
                        Different devices have varying screen resolutions and pixel densities. Our
                        AI automatically detects optimal settings to ensure your images look their
                        best on the target device.
                      </>
                    )}
                  </p>
                </div>
                <div className="bg-surface-light rounded-xl p-6 border border-border-default">
                  <h3 className="font-semibold text-lg mb-3">Aspect Ratio & Layout</h3>
                  <p className="text-text-secondary text-sm">
                    When upscaling for {data.useCase} on {data.device}, we consider common aspect
                    ratios and layout patterns. This ensures your images fit perfectly within their
                    intended display context without cropping or distortion.
                  </p>
                </div>
                <div className="bg-surface-light rounded-xl p-6 border border-border-default">
                  <h3 className="font-semibold text-lg mb-3">File Size Optimization</h3>
                  <p className="text-text-secondary text-sm">
                    Higher resolutions increase file size, which affects loading times and data
                    usage. Our upscaling balances quality with efficiency, especially important for
                    mobile users and bandwidth-constrained scenarios.
                  </p>
                </div>
              </div>
            </section>
          </FadeIn>

          {/* Tips */}
          {data.tips && data.tips.length > 0 && (
            <FadeIn delay={0.65}>
              <section className="py-16">
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
