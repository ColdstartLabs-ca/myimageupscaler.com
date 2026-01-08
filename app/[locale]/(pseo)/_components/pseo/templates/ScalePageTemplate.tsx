/**
 * Scale Page Template Component
 * Template for resolution/scale-specific landing pages
 * (e.g., upscale to 4K, upscale to HD)
 */

import type { IScalePage } from '@/lib/seo/pseo-types';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import { ReactElement } from 'react';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { HeroSection } from '../sections/HeroSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';
import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';
import { Monitor, Maximize2, Zap, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface IScalePageTemplateProps {
  data: IScalePage;
}

export function ScalePageTemplate({ data }: IScalePageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/scale/${data.slug}`);
  const tier = pageMapping?.tier;

  return (
    <div className="min-h-screen bg-surface relative">
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
              <section className="py-12">
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

          {/* FAQ */}
          {data.faq && data.faq.length > 0 && (
            <FAQSection faqs={data.faq} pageType="scale" slug={data.slug} />
          )}

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
