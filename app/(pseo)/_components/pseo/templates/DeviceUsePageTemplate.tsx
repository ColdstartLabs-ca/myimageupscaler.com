/**
 * Device Use Page Template Component
 * Template for device × use case multiplier pages (mobile social media, desktop professional, etc.)
 */

'use client';

import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import type { IDeviceUseCasePage } from '@/lib/seo/pseo-types';
import type { IRelatedPage } from '@/lib/seo/related-pages';
import { ReactElement } from 'react';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { HeroSection } from '../sections/HeroSection';
import { RelatedPagesSection } from '../sections/RelatedPagesSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';

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

  return (
    <div className="min-h-screen bg-main relative overflow-x-hidden">
      <PSEOPageTracker
        pageType="device-use"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="device-use" slug={data.slug} />

      {/* Full Width Hero Area */}
      <div className="relative">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative z-30 pt-6">
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

        <div className="relative h-full">
          <HeroSection
            h1={data.h1}
            intro={data.intro}
            ctaText="Try Free"
            ctaUrl="/"
            pageType="device-use"
            slug={data.slug}
          />
        </div>
      </div>

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        <article>
          {/* Device & Use Case Info */}
          <FadeIn delay={0.2}>
            <div className="py-8">
              <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-6">
                {data.deviceDescription && (
                  <div className="glass-card-2025 p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">{getDeviceIcon(data.device)}</span>
                      <h3 className="text-lg font-bold text-white capitalize">
                        {data.device} Device
                      </h3>
                    </div>
                    <p className="text-text-secondary text-sm">{data.deviceDescription}</p>
                  </div>
                )}
                {data.useCaseDescription && (
                  <div className="glass-card-2025 p-6">
                    <h3 className="text-lg font-bold text-white mb-3">
                      {data.useCase} Use Case
                    </h3>
                    <p className="text-text-secondary text-sm">{data.useCaseDescription}</p>
                  </div>
                )}
              </div>
            </div>
          </FadeIn>

          {/* Before/After Slider Removed (Bird Image) */}

          {/* Device Constraints */}
          {data.deviceConstraints && data.deviceConstraints.length > 0 && (
            <FadeIn delay={0.3}>
              <section className="py-12">
                <h2 className="text-2xl font-bold text-white text-center mb-8">
                  {data.device.charAt(0).toUpperCase() + data.device.slice(1)} Considerations
                </h2>
                <div className="max-w-3xl mx-auto glass-card-2025 p-8 border-warning/20">
                  <ul className="space-y-4">
                    {data.deviceConstraints.map((constraint, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className="text-yellow-500 mt-1 shrink-0">⚠️</span>
                        <span className="text-text-secondary text-lg">{constraint}</span>
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
                <h2 className="text-2xl font-bold text-white text-center mb-8">
                  Benefits for {data.useCase}
                </h2>
                <div className="max-w-3xl mx-auto glass-card-2025 p-8 border-success/20">
                  <ul className="space-y-4">
                    {data.useCaseBenefits.map((benefit, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className="text-success mt-1 shrink-0">✓</span>
                        <span className="text-text-secondary text-lg">{benefit}</span>
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
              <h2 className="text-2xl font-bold text-white text-center mb-4">
                How to Upscale Images for {data.useCase} on {data.device}
              </h2>
              <p className="text-center text-text-secondary mb-12 max-w-2xl mx-auto text-lg font-light">
                Optimize your images specifically for {data.useCase.toLowerCase()} on {data.device}{' '}
                devices with our AI-powered upscaling.
              </p>
              <div className="max-w-3xl mx-auto space-y-12">
                <div className="flex gap-6">
                  <div className="flex-shrink-0 w-12 h-12 bg-accent text-white rounded-full flex items-center justify-center text-xl font-bold shadow-lg shadow-accent/20">
                    1
                  </div>
                  <div className="flex-1 pb-6 border-b border-white/10">
                    <h3 className="font-bold text-white text-xl mb-2">Upload Your Image</h3>
                    <p className="text-text-secondary text-lg">
                      Simply drag and drop or select any image from your device. Our system supports
                      all common formats including JPEG, PNG, WebP, and more.
                    </p>
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="flex-shrink-0 w-12 h-12 bg-accent text-white rounded-full flex items-center justify-center text-xl font-bold shadow-lg shadow-accent/20">
                    2
                  </div>
                  <div className="flex-1 pb-6 border-b border-white/10">
                    <h3 className="font-bold text-white text-xl mb-2">Automatic Device Optimization</h3>
                    <p className="text-text-secondary text-lg">
                      Our AI automatically detects optimal settings for {data.device} displays and{' '}
                      {data.useCase.toLowerCase()} requirements, ensuring perfect output every time.
                    </p>
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="flex-shrink-0 w-12 h-12 bg-accent text-white rounded-full flex items-center justify-center text-xl font-bold shadow-lg shadow-accent/20">
                    3
                  </div>
                  <div className="flex-1 pb-6 last:border-0">
                    <h3 className="font-bold text-white text-xl mb-2">Download Optimized Image</h3>
                    <p className="text-text-secondary text-lg">
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
            <section className="py-12 glass-card-2025 p-8">
              <h2 className="text-2xl font-bold text-white text-center mb-4">
                Best Practices for {data.useCase} on {data.device}
              </h2>
              <p className="text-center text-text-secondary mb-12 max-w-2xl mx-auto text-lg font-light">
                Follow these guidelines to get the best results when upscaling images for your
                specific use case.
              </p>
              <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="font-bold text-white text-lg mb-4 flex items-center gap-2">
                    <span className="text-accent">✓</span> Image Preparation
                  </h3>
                  <ul className="space-y-3 text-text-secondary text-base">
                    <li className="flex items-start gap-2">• <span>Start with the highest quality source available</span></li>
                    <li className="flex items-start gap-2">• <span>Use proper lighting for product photos</span></li>
                    <li className="flex items-start gap-2">• <span>Ensure correct orientation before upload</span></li>
                    <li className="flex items-start gap-2">• <span>Remove any compression artifacts first</span></li>
                    <li className="flex items-start gap-2">• <span>Check color accuracy before upscaling</span></li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg mb-4 flex items-center gap-2">
                    <span className="text-accent">✓</span> Output Settings
                  </h3>
                  <ul className="space-y-3 text-text-secondary text-base">
                    <li className="flex items-start gap-2">• <span>Match {data.device} display resolution</span></li>
                    <li className="flex items-start gap-2">• <span>Consider file size for mobile data usage</span></li>
                    <li className="flex items-start gap-2">• <span>Use appropriate format for the platform</span></li>
                    <li className="flex items-start gap-2">• <span>Test on actual {data.device} devices</span></li>
                    <li className="flex items-start gap-2">• <span>Keep backups of original images</span></li>
                  </ul>
                </div>
              </div>
            </section>
          </FadeIn>

          {/* Common Use Cases for This Device/Category */}
          <FadeIn delay={0.55}>
            <section className="py-12">
              <h2 className="text-2xl font-bold text-white text-center mb-4">
                Popular {data.useCase} Scenarios on {data.device}
              </h2>
              <p className="text-center text-text-secondary mb-12 max-w-2xl mx-auto text-lg font-light">
                Discover how others are using AI upscaling for their {data.useCase.toLowerCase()}{' '}
                needs on {data.device}.
              </p>
              <div className="max-w-3xl mx-auto grid gap-6 md:grid-cols-2">
                <div className="glass-card-2025 p-6">
                  <h3 className="font-bold text-white mb-2">Content Creation</h3>
                  <p className="text-text-secondary text-sm">
                    Creators upscale thumbnails and preview images to ensure they look crisp when
                    viewed on {data.device} screens.
                  </p>
                </div>
                <div className="glass-card-2025 p-6">
                  <h3 className="font-bold text-white mb-2">E-commerce</h3>
                  <p className="text-text-secondary text-sm">
                    Online retailers enhance product photos to provide detailed views for customers
                    browsing on {data.device}.
                  </p>
                </div>
                <div className="glass-card-2025 p-6">
                  <h3 className="font-bold text-white mb-2">Social Media</h3>
                  <p className="text-text-secondary text-sm">
                    Marketers and influencers optimize images for maximum impact when shared on{' '}
                    {data.device} platforms.
                  </p>
                </div>
                <div className="glass-card-2025 p-6">
                  <h3 className="font-bold text-white mb-2">Professional Portfolio</h3>
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
              <h2 className="text-2xl font-bold text-white text-center mb-4">
                Understanding {data.device} Display Requirements
              </h2>
              <p className="text-center text-text-secondary mb-12 max-w-2xl mx-auto text-lg font-light">
                Technical insights to help you make informed decisions about image upscaling for{' '}
                {data.device}.
              </p>
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="glass-card-2025 p-8">
                  <h3 className="font-bold text-white text-lg mb-4">Display Resolution Considerations</h3>
                  <p className="text-text-secondary text-base leading-relaxed">
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
                <div className="glass-card-2025 p-8">
                  <h3 className="font-bold text-white text-lg mb-4">Aspect Ratio & Layout</h3>
                  <p className="text-text-secondary text-base leading-relaxed">
                    When upscaling for {data.useCase} on {data.device}, we consider common aspect
                    ratios and layout patterns. This ensures your images fit perfectly within their
                    intended display context without cropping or distortion.
                  </p>
                </div>
                <div className="glass-card-2025 p-8">
                  <h3 className="font-bold text-white text-lg mb-4">File Size Optimization</h3>
                  <p className="text-text-secondary text-base leading-relaxed">
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
              <section className="py-12">
                <h2 className="text-2xl font-bold text-white text-center mb-8">
                  Pro Tips
                </h2>
                <div className="max-w-3xl mx-auto glass-card-2025 p-8 border-accent/20">
                  <ul className="space-y-4">
                    {data.tips.map((tip, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                        <span className="text-text-secondary text-lg">{tip}</span>
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
              <FAQSection faqs={data.faq} pageType="device-use" slug={data.slug} />
            </div>
          )}
        </article>
      </div>

      {/* Final CTA Full Width */}
      <CTASection
        title={`Ready to optimize images for ${data.useCase.toLowerCase()} on ${data.device}?`}
        description="Start enhancing images with AI today. No credit card required."
        ctaText="Try Free"
        ctaUrl="/"
        pageType="device-use"
        slug={data.slug}
      />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Footer spacing */}
        <div className="pb-16" />
      </div>
    </div>
  );
}
