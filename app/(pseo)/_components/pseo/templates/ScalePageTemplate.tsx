/**
 * Scale Page Template Component
 * Template for resolution/scale-specific landing pages
 * (e.g., upscale to 4K, upscale to HD)
 */

'use client';

import type { IScalePage } from '@/lib/seo/pseo-types';
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
import { Monitor, Maximize2, Zap, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { Locale } from '@/i18n/config';

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
        pageType="scale"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="scale" slug={data.slug} />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Breadcrumb */}
        <div className="pt-6 pb-4">
          <BreadcrumbNav
            items={[
              { label: 'Home', href: '/' },
              { label: 'Resolution', href: '/scale' },
              { label: data.title, href: `/scale/${data.slug}` },
            ]}
          />
        </div>

        <article>
          {/* Hero Section with Resolution Badge */}
          <div className="relative">
            <div className="absolute -top-4 left-0">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-light text-accent text-sm font-semibold rounded-full">
                <Monitor className="w-4 h-4" />
                {data.resolution}
              </span>
            </div>
            <div className="pt-8">
              <HeroSection
                h1={data.h1}
                intro={data.intro}
                ctaText={`Upscale to ${data.resolution}`}
                ctaUrl="/?signup=1"
                pageType="scale"
                slug={data.slug}
              />
            </div>
          </div>

          {/* Description */}
          {data.description && (
            <FadeIn delay={0.2}>
              <div className="max-w-3xl mx-auto py-8">
                <p className="text-lg text-muted-foreground leading-relaxed text-center">
                  {data.description}
                </p>
              </div>
            </FadeIn>
          )}

          {/* Before/After Slider */}
          <FadeIn delay={0.25}>
            <div className="py-12">
              <div className="max-w-3xl mx-auto">
                <BeforeAfterSlider
                  beforeUrl="/before-after/bird-before.webp"
                  afterUrl="/before-after/bird-after.webp"
                  beforeLabel={sliderLabels.before}
                  afterLabel={sliderLabels.after}
                  className="shadow-2xl shadow-accent/10"
                />
              </div>
            </div>
          </FadeIn>

          {/* Resolution Specs */}
          {data.dimensions && (
            <FadeIn delay={0.3}>
              <section className="py-8">
                <div className="max-w-2xl mx-auto bg-gradient-to-br from-surface-light to-surface-light/50 rounded-xl p-8 border border-border">
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <Maximize2 className="w-6 h-6 text-accent" />
                    <h2 className="text-2xl font-bold">{data.resolution} Specifications</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-6 text-center">
                    <div>
                      <div className="text-3xl font-bold text-accent">{data.dimensions.width}</div>
                      <div className="text-sm text-muted-foreground mt-1">Width (pixels)</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-accent">{data.dimensions.height}</div>
                      <div className="text-sm text-muted-foreground mt-1">Height (pixels)</div>
                    </div>
                  </div>
                  {data.dimensions.aspectRatio && (
                    <div className="mt-6 pt-6 border-t border-border text-center">
                      <div className="text-sm text-muted-foreground">Aspect Ratio</div>
                      <div className="text-xl font-semibold text-primary mt-1">
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
              <section className="py-16">
                <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">Perfect For</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {data.useCases.map((useCase, idx) => (
                    <div
                      key={idx}
                      className="bg-surface border border-border rounded-xl p-6 hover:border-accent hover:shadow-lg transition-all"
                    >
                      <Zap className="w-8 h-8 text-accent mb-3" />
                      <h3 className="font-semibold text-lg mb-2">{useCase.title}</h3>
                      <p className="text-sm text-muted-foreground">{useCase.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* Benefits */}
          {data.benefits && data.benefits.length > 0 && (
            <FadeIn delay={0.5}>
              <section className="py-12 bg-gradient-to-br from-accent/10 to-accent/5 rounded-2xl px-8">
                <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
                  Why Upscale to {data.resolution}?
                </h2>
                <div className="grid md:grid-cols-3 gap-6">
                  {data.benefits.map((benefit, idx) => (
                    <div key={idx} className="text-center">
                      <div className="text-3xl font-bold text-accent mb-2">
                        {benefit.metric || '✓'}
                      </div>
                      <h3 className="font-semibold mb-2">{benefit.title}</h3>
                      <p className="text-sm text-muted-foreground">{benefit.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* How It Works */}
          <FadeIn delay={0.55}>
            <section className="py-16">
              <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
                How AI Upscaling to {data.resolution} Works
              </h2>
              <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
                Our advanced AI technology analyzes your image and intelligently adds detail,
                resulting in crystal clear {data.resolution} output.
              </p>
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-accent text-white rounded-full flex items-center justify-center font-bold">
                    1
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-1">Upload Your Image</h3>
                    <p className="text-muted-foreground">
                      Simply drag and drop or select any image from your device. Our system supports
                      all common formats including JPEG, PNG, WebP, and more.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-accent text-white rounded-full flex items-center justify-center font-bold">
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-1">AI Analysis & Enhancement</h3>
                    <p className="text-muted-foreground">
                      Our neural network analyzes your image at the pixel level, identifying edges,
                      textures, and patterns. It then intelligently generates new pixels to enlarge
                      your image to {data.resolution} while maintaining sharpness and clarity.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-accent text-white rounded-full flex items-center justify-center font-bold">
                    3
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-1">
                      Download {data.resolution} Result
                    </h3>
                    <p className="text-muted-foreground">
                      Within seconds, your upscaled image is ready. Download it in full{' '}
                      {data.resolution} quality, perfect for printing, professional use, or
                      high-resolution displays.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </FadeIn>

          {/* When to Use This Resolution */}
          <FadeIn delay={0.6}>
            <section className="py-12 bg-surface-light rounded-2xl px-8 border border-border">
              <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
                When to Use {data.resolution}
              </h2>
              <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
                Understanding the right resolution for your needs ensures optimal quality and file
                size.
              </p>
              <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <span className="text-accent">✓</span> Ideal For
                  </h3>
                  <ul className="space-y-2 text-muted-foreground">
                    <li>• High-quality photo printing and posters</li>
                    <li>• Professional photography portfolios</li>
                    <li>• Retina and 4K display backgrounds</li>
                    <li>• Marketing materials and brochures</li>
                    <li>• Social media cover photos and banners</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <span className="text-accent">✓</span> Technical Benefits
                  </h3>
                  <ul className="space-y-2 text-muted-foreground">
                    <li>• Crisp details on large format prints</li>
                    <li>• Future-proof for higher resolution displays</li>
                    <li>• Professional editing headroom</li>
                    <li>• Consistent quality across all devices</li>
                    <li>• Meets industry standard requirements</li>
                  </ul>
                </div>
              </div>
            </section>
          </FadeIn>

          {/* Comparison with Other Resolutions */}
          <FadeIn delay={0.65}>
            <section className="py-16">
              <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
                {data.resolution} vs Other Resolutions
              </h2>
              <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
                Compare {data.resolution} with common image resolutions to understand the difference
                in quality and use cases.
              </p>
              <div className="max-w-3xl mx-auto overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-border">
                      <th className="text-left py-3 px-4 font-semibold">Resolution</th>
                      <th className="text-left py-3 px-4 font-semibold">Dimensions</th>
                      <th className="text-left py-3 px-4 font-semibold">Best For</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border">
                      <td className="py-3 px-4 font-medium">720p (HD)</td>
                      <td className="py-3 px-4">1280 × 720</td>
                      <td className="py-3 px-4">Web sharing, social media</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-3 px-4 font-medium">1080p (Full HD)</td>
                      <td className="py-3 px-4">1920 × 1080</td>
                      <td className="py-3 px-4">YouTube, presentations</td>
                    </tr>
                    <tr className="border-b border-border bg-accent/5">
                      <td className="py-3 px-4 font-medium text-accent">{data.resolution}</td>
                      <td className="py-3 px-4">
                        {data.dimensions?.width || '—'} × {data.dimensions?.height || '—'}
                      </td>
                      <td className="py-3 px-4">Professional print, 4K displays</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-3 px-4 font-medium">8K (UHD)</td>
                      <td className="py-3 px-4">7680 × 4320</td>
                      <td className="py-3 px-4">Large format printing, cinema</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </FadeIn>

          {/* Technical Details */}
          <FadeIn delay={0.7}>
            <section className="py-16">
              <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
                Technical Details: AI-Powered Upscaling
              </h2>
              <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
                Learn about the technology behind our {data.resolution} upscaling process.
              </p>
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="glass-card-2025">
                  <h3 className="font-semibold text-lg mb-3">Neural Network Architecture</h3>
                  <p className="text-muted-foreground">
                    Our upscaling system uses deep convolutional neural networks (CNNs) trained on
                    millions of high-resolution image pairs. The network learns to intelligently
                    predict and generate missing pixel information when enlarging images to{' '}
                    {data.resolution}, resulting in natural-looking details without artifacts or
                    blurring.
                  </p>
                </div>
                <div className="glass-card-2025">
                  <h3 className="font-semibold text-lg mb-3">Edge-Preserving Algorithms</h3>
                  <p className="text-muted-foreground">
                    Unlike traditional interpolation methods that blur edges, our AI detects and
                    preserves important edges and fine details. When upscaling to {data.resolution},
                    lines remain sharp, textures look natural, and text stays readable even at
                    significant enlargement ratios.
                  </p>
                </div>
                <div className="glass-card-2025">
                  <h3 className="font-semibold text-lg mb-3">Format & Color Preservation</h3>
                  <p className="text-muted-foreground">
                    Your {data.resolution} output maintains the original color profile and supports
                    the same format as your input. Whether you&apos;re working with sRGB for web or
                    Adobe RGB for print, color accuracy is preserved throughout the upscaling
                    process.
                  </p>
                </div>
              </div>
            </section>
          </FadeIn>

          {/* FAQ */}
          {data.faq && data.faq.length > 0 && (
            <FAQSection faqs={data.faq} pageType="scale" slug={data.slug} />
          )}

          {/* Related Pages */}
          {relatedPages.length > 0 && <RelatedPagesSection relatedPages={relatedPages} />}

          {/* CTA */}
          <div className="py-8">
            <FadeIn>
              <CTASection
                title={`Ready to upscale to ${data.resolution}?`}
                description="Transform your images to stunning high resolution with AI-powered upscaling. Start free today."
                ctaText={`Start Upscaling to ${data.resolution}`}
                ctaUrl="/?signup=1"
                pageType="scale"
                slug={data.slug}
              />
            </FadeIn>
          </div>

          {/* Related Resolutions */}
          {data.relatedScales && data.relatedScales.length > 0 && (
            <FadeIn delay={0.6}>
              <section className="py-8 border-t border-border">
                <h2 className="text-2xl font-bold mb-6">Other Resolutions</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {data.relatedScales.map((slug, idx) => (
                    <Link
                      key={idx}
                      href={`/scale/${slug}`}
                      className="p-4 border border-border rounded-lg hover:border-accent hover:shadow-md transition-all group"
                    >
                      <span className="text-sm font-medium text-primary capitalize">
                        {slug.replace(/-/g, ' ').replace('upscale to ', '')}
                      </span>
                      <ArrowRight className="inline-block w-4 h-4 ml-1 text-muted-foreground group-hover:text-accent group-hover:translate-x-1 transition-all" />
                    </Link>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* Related Guides */}
          {data.relatedGuides && data.relatedGuides.length > 0 && (
            <FadeIn delay={0.7}>
              <section className="py-8">
                <h2 className="text-2xl font-bold mb-6">Related Guides</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.relatedGuides.map((slug, idx) => (
                    <Link
                      key={idx}
                      href={`/guides/${slug}`}
                      className="p-4 bg-surface rounded-lg hover:bg-surface-light hover:border-accent border border-transparent transition-all"
                    >
                      <span className="text-sm font-medium text-primary capitalize">
                        {slug.replace(/-/g, ' ')}
                      </span>
                      <ArrowRight className="inline-block w-4 h-4 ml-1 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}
        </article>

        {/* Footer spacing */}
        <div className="pb-16" />
      </div>
    </div>
  );
}
