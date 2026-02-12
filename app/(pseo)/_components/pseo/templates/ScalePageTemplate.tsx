/**
 * Scale Page Template Component
 * Template for resolution/scale-specific landing pages
 * (e.g., upscale to 4K, upscale to HD)
 */

'use client';

import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';
import type { Locale } from '@/i18n/config';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import type { IScalePage } from '@/lib/seo/pseo-types';
import type { IRelatedPage } from '@/lib/seo/related-pages';
import { BeforeAfterSlider } from '@client/components/ui/BeforeAfterSlider';
import { ArrowRight, Maximize2, Monitor, Zap } from 'lucide-react';
import Link from 'next/link';
import { ReactElement } from 'react';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { ComparisonTableSection } from '../sections/ComparisonTableSection';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { HeroSection } from '../sections/HeroSection';
import { HowItWorksSection } from '../sections/HowItWorksSection';
import { RelatedPagesSection } from '../sections/RelatedPagesSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';

interface IScalePageTemplateProps {
  data: IScalePage;
  locale?: Locale;
  relatedPages?: IRelatedPage[];
}

export function ScalePageTemplate({
  data,
  locale,
  relatedPages = [],
}: IScalePageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/scale/${data.slug}`);
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
        pageType="scale"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="scale" slug={data.slug} />

      {/* Full Width Hero Area */}
      <div className="relative">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative z-30 pt-6">
          <BreadcrumbNav
            items={[
              { label: 'Home', href: '/' },
              { label: 'Resolution', href: '/scale' },
              { label: data.title, href: `/scale/${data.slug}` },
            ]}
          />
        </div>

        <div className="relative h-full">
          {/* Centered Badge */}
          <div className="absolute top-8 left-1/2 -translate-x-1/2 flex gap-2 z-30">
            <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent/10 text-accent text-sm font-bold rounded-full border border-accent/20 glass-strong">
              <Monitor className="w-4 h-4" />
              {data.resolution}
            </span>
          </div>

          <HeroSection
            h1={data.h1}
            intro={data.intro}
            ctaText={`Upscale to ${data.resolution}`}
            ctaUrl="/?signup=1"
            pageType="scale"
            slug={data.slug}
            hideBadge={true}
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

          {/* Unique Intro */}
          {data.uniqueIntro && (
            <FadeIn delay={0.25}>
              <div className="max-w-3xl mx-auto py-8">
                <p className="text-lg text-text-secondary leading-relaxed text-center font-light italic">
                  &ldquo;{data.uniqueIntro}&rdquo;
                </p>
              </div>
            </FadeIn>
          )}

          {/* Expanded Description */}
          {data.expandedDescription && (
            <FadeIn delay={0.3}>
              <div className="max-w-4xl mx-auto py-8">
                <p className="text-lg text-text-secondary leading-relaxed">
                  {data.expandedDescription}
                </p>
              </div>
            </FadeIn>
          )}

          {/* Page Specific Details */}
          {data.pageSpecificDetails && (
            <FadeIn delay={0.35}>
              <div className="max-w-4xl mx-auto py-12 px-8 glass-card-2025">
                <h3 className="text-2xl font-bold mb-6 text-white text-center">Key Details & Use Cases</h3>
                <p className="text-lg text-text-secondary leading-relaxed">
                  {data.pageSpecificDetails}
                </p>
              </div>
            </FadeIn>
          )}

          {/* Before/After Slider - Page-specific images when available */}
          {data.beforeAfterImages && (
            <FadeIn delay={0.4}>
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

          {/* Resolution Specs */}
          {data.dimensions && (
            <FadeIn delay={0.3}>
              <section className="py-12">
                <div className="max-w-2xl mx-auto glass-card-2025 p-8 border-accent/20">
                  <div className="flex items-center justify-center gap-3 mb-8">
                    <Maximize2 className="w-8 h-8 text-accent" />
                    <h2 className="text-3xl font-bold text-white">{data.resolution} Specifications</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-8 text-center">
                    <div>
                      <div className="text-4xl font-black text-accent">{data.dimensions.width}</div>
                      <div className="text-base text-text-tertiary mt-2 uppercase tracking-widest">Width (px)</div>
                    </div>
                    <div>
                      <div className="text-4xl font-black text-accent">{data.dimensions.height}</div>
                      <div className="text-base text-text-tertiary mt-2 uppercase tracking-widest">Height (px)</div>
                    </div>
                  </div>
                  {data.dimensions.aspectRatio && (
                    <div className="mt-8 pt-8 border-t border-white/10 text-center">
                      <div className="text-base text-text-tertiary uppercase tracking-widest">Target Aspect Ratio</div>
                      <div className="text-2xl font-bold text-white mt-1">
                        {data.dimensions.aspectRatio}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </FadeIn>
          )}

          {/* Use Cases */}
          {data.useCases && data.useCases.length > 0 && (
            <FadeIn delay={0.4}>
              <section className="py-12">
                <h2 className="text-3xl font-bold text-white text-center mb-12">Perfect For</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {data.useCases.map((useCase, idx) => (
                    <div
                      key={idx}
                      className="glass-card-2025 p-8 transition-all hover:border-accent group"
                    >
                      <Zap className="w-10 h-10 text-accent mb-6 group-hover:scale-110 transition-transform" />
                      <h3 className="font-bold text-white text-xl mb-3">{useCase.title}</h3>
                      <p className="text-base text-text-secondary leading-relaxed">{useCase.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* Benefits */}
          {data.benefits && data.benefits.length > 0 && (
            <FadeIn delay={0.5}>
              <section className="py-12 glass-card-2025 p-12 bg-accent/5 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-[80px] -mr-32 -mt-32" />
                <h2 className="text-3xl font-bold text-white text-center mb-12 relative z-10">
                  Why Upscale to {data.resolution}?
                </h2>
                <div className="grid md:grid-cols-3 gap-12 relative z-10">
                  {data.benefits.map((benefit, idx) => (
                    <div key={idx} className="text-center">
                      <div className="text-4xl font-black text-accent mb-4">
                        {benefit.metric || '✓'}
                      </div>
                      <h3 className="font-bold text-white text-lg mb-2">{benefit.title}</h3>
                      <p className="text-base text-text-secondary leading-relaxed">{benefit.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* How It Works - use data.howItWorks if available, otherwise show generic steps */}
          {data.howItWorks && data.howItWorks.length > 0 ? (
            <FadeIn delay={0.55}>
              <div className="py-12">
                <HowItWorksSection
                  title={`How AI Upscaling to ${data.resolution} Works`}
                  subtitle={`Our advanced AI technology analyzes your image and intelligently adds detail, resulting in crystal clear ${data.resolution} output.`}
                  steps={data.howItWorks}
                />
              </div>
            </FadeIn>
          ) : (
            <FadeIn delay={0.55}>
              <section className="py-12">
                <h2 className="text-3xl font-bold text-white text-center mb-6">
                  How AI Upscaling to {data.resolution} Works
                </h2>
                <p className="text-center text-text-secondary mb-12 max-w-2xl mx-auto text-lg font-light">
                  Our advanced AI technology analyzes your image and intelligently adds detail,
                  resulting in crystal clear {data.resolution} output.
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
                      <h3 className="font-bold text-white text-xl mb-2">AI Analysis & Enhancement</h3>
                      <p className="text-text-secondary text-lg">
                        Our neural network analyzes your image at the pixel level, identifying edges,
                        textures, and patterns. It then intelligently generates new pixels to enlarge
                        your image to {data.resolution} while maintaining sharpness and clarity.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-6">
                    <div className="flex-shrink-0 w-12 h-12 bg-accent text-white rounded-full flex items-center justify-center text-xl font-bold shadow-lg shadow-accent/20">
                      3
                    </div>
                    <div className="flex-1 pb-6 last:border-0">
                      <h3 className="font-bold text-white text-xl mb-2">
                        Download {data.resolution} Result
                      </h3>
                      <p className="text-text-secondary text-lg">
                        Within seconds, your upscaled image is ready. Download it in full{' '}
                        {data.resolution} quality, perfect for printing, professional use, or
                        high-resolution displays.
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </FadeIn>
          )}

          {/* When to Use This Resolution */}
          <FadeIn delay={0.6}>
            <section className="py-12 glass-card-2025 p-12">
              <h2 className="text-3xl font-bold text-white text-center mb-6">
                When to Use {data.resolution}
              </h2>
              <p className="text-center text-text-secondary mb-12 max-w-2xl mx-auto text-lg font-light">
                Understanding the right resolution for your needs ensures optimal quality and file
                size.
              </p>
              <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-12">
                <div>
                  <h3 className="font-bold text-white text-xl mb-6 flex items-center gap-3">
                    <span className="text-accent">✓</span> Ideal For
                  </h3>
                  <ul className="space-y-4 text-text-secondary text-lg">
                    <li className="flex items-start gap-3"><span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" /> <span>High-quality photo printing and posters</span></li>
                    <li className="flex items-start gap-3"><span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" /> <span>Professional photography portfolios</span></li>
                    <li className="flex items-start gap-3"><span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" /> <span>Retina and 4K display backgrounds</span></li>
                    <li className="flex items-start gap-3"><span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" /> <span>Marketing materials and brochures</span></li>
                    <li className="flex items-start gap-3"><span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" /> <span>Social media cover photos and banners</span></li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-bold text-white text-xl mb-6 flex items-center gap-3">
                    <span className="text-accent">✓</span> Technical Benefits
                  </h3>
                  <ul className="space-y-4 text-text-secondary text-lg">
                    <li className="flex items-start gap-3"><span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" /> <span>Crisp details on large format prints</span></li>
                    <li className="flex items-start gap-3"><span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" /> <span>Future-proof for higher resolution displays</span></li>
                    <li className="flex items-start gap-3"><span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" /> <span>Professional editing headroom</span></li>
                    <li className="flex items-start gap-3"><span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" /> <span>Consistent quality across all devices</span></li>
                    <li className="flex items-start gap-3"><span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" /> <span>Meets industry standard requirements</span></li>
                  </ul>
                </div>
              </div>
            </section>
          </FadeIn>

          {/* Comparison with Other Resolutions */}
          {data.comparisonTable ? (
            <ComparisonTableSection comparisonTable={data.comparisonTable} />
          ) : (
            <FadeIn delay={0.65}>
              <section className="py-12">
                <h2 className="text-3xl font-bold text-white text-center mb-6">
                  {data.resolution} vs Other Resolutions
                </h2>
                <p className="text-center text-text-secondary mb-12 max-w-2xl mx-auto text-lg font-light">
                  Compare {data.resolution} with common image resolutions to understand the
                  difference in quality and use cases.
                </p>
                <div className="max-w-4xl mx-auto overflow-hidden rounded-2xl glass-card-2025 border-white/10">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/5">
                          <th className="py-6 px-8 text-lg font-bold text-white">
                            Resolution
                          </th>
                          <th className="py-6 px-8 text-lg font-bold text-white">
                            Dimensions
                          </th>
                          <th className="py-6 px-8 text-lg font-bold text-white">Best For</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        <tr>
                          <td className="py-5 px-8 font-bold text-white">720p (HD)</td>
                          <td className="py-5 px-8 text-text-secondary font-mono">
                            1280 × 720
                          </td>
                          <td className="py-5 px-8 text-text-secondary">
                            Web sharing, social media
                          </td>
                        </tr>
                        <tr>
                          <td className="py-5 px-8 font-bold text-white">
                            1080p (Full HD)
                          </td>
                          <td className="py-5 px-8 text-text-secondary font-mono">
                            1920 × 1080
                          </td>
                          <td className="py-5 px-8 text-text-secondary">
                            YouTube, presentations
                          </td>
                        </tr>
                        <tr className="bg-accent/10">
                          <td className="py-5 px-8 font-extrabold text-accent">
                            {data.resolution}
                          </td>
                          <td className="py-5 px-8 text-accent font-mono">
                            {data.dimensions?.width || '—'} × {data.dimensions?.height || '—'}
                          </td>
                          <td className="py-5 px-8 text-accent font-bold">
                            Professional print, 4K displays
                          </td>
                        </tr>
                        <tr>
                          <td className="py-5 px-8 font-bold text-white">8K (UHD)</td>
                          <td className="py-5 px-8 text-text-secondary font-mono">
                            7680 × 4320
                          </td>
                          <td className="py-5 px-8 text-text-secondary">
                            Large format printing, cinema
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </FadeIn>
          )}

          {/* Technical Details - use data.technicalDetails if available */}
          {data.technicalDetails && data.technicalDetails.length > 0 ? (
            <FadeIn delay={0.7}>
              <section className="py-12">
                <h2 className="text-3xl font-bold text-white text-center mb-6">
                  Technical Details: {data.resolution} AI Upscaling
                </h2>
                <p className="text-center text-text-secondary mb-12 max-w-2xl mx-auto text-lg font-light">
                  Learn about the technology behind our {data.resolution} upscaling process.
                </p>
                <div className="max-w-4xl mx-auto space-y-8">
                  {data.technicalDetails.map((detail, idx) => (
                    <div key={idx} className="glass-card-2025 p-8">
                      <h3 className="font-bold text-white text-xl mb-4">{detail.title}</h3>
                      <p className="text-text-secondary text-lg leading-relaxed">{detail.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          ) : (
            <FadeIn delay={0.7}>
              <section className="py-12">
                <h2 className="text-3xl font-bold text-white text-center mb-6">
                  Technical Details: AI-Powered Upscaling
                </h2>
                <p className="text-center text-text-secondary mb-12 max-w-2xl mx-auto text-lg font-light">
                  Learn about the technology behind our {data.resolution} upscaling process.
                </p>
                <div className="max-w-4xl mx-auto space-y-8">
                  <div className="glass-card-2025 p-8">
                    <h3 className="font-bold text-white text-xl mb-4">Neural Network Architecture</h3>
                    <p className="text-text-secondary text-lg leading-relaxed">
                      Our upscaling system uses deep convolutional neural networks (CNNs) trained on
                      millions of high-resolution image pairs. The network learns to intelligently
                      predict and generate missing pixel information when enlarging images to{' '}
                      {data.resolution}, resulting in natural-looking details without artifacts or
                      blurring.
                    </p>
                  </div>
                  <div className="glass-card-2025 p-8">
                    <h3 className="font-bold text-white text-xl mb-4">Edge-Preserving Algorithms</h3>
                    <p className="text-text-secondary text-lg leading-relaxed">
                      Unlike traditional interpolation methods that blur edges, our AI detects and
                      preserves important edges and fine details. When upscaling to {data.resolution},
                      lines remain sharp, textures look natural, and text stays readable even at
                      significant enlargement ratios.
                    </p>
                  </div>
                  <div className="glass-card-2025 p-8">
                    <h3 className="font-bold text-white text-xl mb-4">Format & Color Preservation</h3>
                    <p className="text-text-secondary text-lg leading-relaxed">
                      Your {data.resolution} output maintains the original color profile and supports
                      the same format as your input. Whether you&apos;re working with sRGB for web or
                      Adobe RGB for print, color accuracy is preserved throughout the upscaling
                      process.
                    </p>
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
              <FAQSection faqs={data.faq} pageType="scale" slug={data.slug} />
            </div>
          )}
        </article>
      </div>

      {/* Final CTA Full Width */}
      <CTASection
        title={`Ready to upscale to ${data.resolution}?`}
        description="Transform your images to stunning high resolution with AI-powered upscaling. Start free today."
        ctaText={`Start Upscaling to ${data.resolution}`}
        ctaUrl="/?signup=1"
        pageType="scale"
        slug={data.slug}
      />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Related Resolutions */}
        {data.relatedScales && data.relatedScales.length > 0 && (
          <FadeIn delay={0.6}>
            <section className="py-12 border-t border-white/10 mt-12">
              <h2 className="text-2xl font-bold mb-8 text-white">Other Resolutions</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {data.relatedScales.map((slug, idx) => (
                  <Link
                    key={idx}
                    href={`/scale/${slug}`}
                    className="p-6 glass-card-2025 hover:border-accent transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-white capitalize">
                        {slug.replace(/-/g, ' ').replace('upscale to ', '')}
                      </span>
                      <ArrowRight className="w-5 h-5 text-text-tertiary group-hover:text-accent group-hover:translate-x-1 transition-all" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </FadeIn>
        )}

        {/* Related Guides */}
        {data.relatedGuides && data.relatedGuides.length > 0 && (
          <FadeIn delay={0.7}>
            <section className="py-12">
              <h2 className="text-2xl font-bold mb-8 text-white">Related Guides</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {data.relatedGuides.map((slug, idx) => (
                  <Link
                    key={idx}
                    href={`/guides/${slug}`}
                    className="p-6 glass-card-2025 hover:border-accent transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-white capitalize">
                        {slug.replace(/-/g, ' ')}
                      </span>
                      <ArrowRight className="w-5 h-5 text-text-tertiary group-hover:text-accent group-hover:translate-x-1 transition-all" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </FadeIn>
        )}

        {/* Footer spacing */}
        <div className="pb-16" />
      </div>
    </div>
  );
}
