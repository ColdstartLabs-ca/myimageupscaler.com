/**
 * Free Page Template Component
 * Template for free tool landing pages that highlight free features
 * with clear upgrade paths to premium
 */

'use client';

import type { IFreePage } from '@/lib/seo/pseo-types';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import { getRelatedPages, type IRelatedPage } from '@/lib/seo/related-pages';
import { ReactElement, useEffect, useState } from 'react';
import { BeforeAfterSlider } from '@client/components/ui/BeforeAfterSlider';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { FeaturesSection } from '../sections/FeaturesSection';
import { HeroSection } from '../sections/HeroSection';
import { RelatedPagesSection } from '../sections/RelatedPagesSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';
import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';
import { Check, X, ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { Locale } from '@/i18n/config';

interface IFreePageTemplateProps {
  data: IFreePage;
  locale?: Locale;
}

export function FreePageTemplate({ data, locale }: IFreePageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/free/${data.slug}`);
  const tier = pageMapping?.tier;

  // State for related pages
  const [relatedPages, setRelatedPages] = useState<IRelatedPage[]>([]);

  // Fetch related pages on mount
  useEffect(() => {
    getRelatedPages(
      'free',
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
          background: 'radial-gradient(circle, rgba(34, 197, 94, 0.08) 0%, transparent 70%)',
        }}
      />

      <PSEOPageTracker
        pageType="free"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="free" slug={data.slug} />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Breadcrumb */}
        <div className="pt-6 pb-4">
          <BreadcrumbNav
            items={[
              { label: 'Home', href: '/' },
              { label: 'Free Tools', href: '/free' },
              { label: data.title, href: `/free/${data.slug}` },
            ]}
          />
        </div>

        <article>
          {/* Hero Section with Free Badge */}
          <div className="relative">
            <div className="absolute -top-4 left-0">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-light text-success text-sm font-semibold rounded-full">
                <Sparkles className="w-4 h-4" />
                Free Plan Available
              </span>
            </div>
            <div className="pt-8">
              <HeroSection
                h1={data.h1}
                intro={data.intro}
                ctaText="Start Free"
                ctaUrl={data.upgradePath || '/?signup=1'}
                pageType="free"
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
                  beforeUrl="/before-after/women-before.webp"
                  afterUrl="/before-after/women-after.webp"
                  beforeLabel={sliderLabels.before}
                  afterLabel={sliderLabels.after}
                  className="shadow-2xl shadow-accent/10"
                />
              </div>
            </div>
          </FadeIn>

          {/* Free Features */}
          {data.features && data.features.length > 0 && (
            <FeaturesSection features={data.features} />
          )}

          {/* Free vs Premium Comparison */}
          {data.limitations && data.limitations.length > 0 && (
            <FadeIn delay={0.4}>
              <section className="py-12">
                <div className="max-w-4xl mx-auto">
                  <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
                    Free vs Premium
                  </h2>
                  <p className="text-muted-foreground text-center mb-8">
                    Start free, upgrade when you need more power
                  </p>

                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Free Tier */}
                    <div className="bg-surface border-2 border-border rounded-xl p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="w-5 h-5 text-success" />
                        <h3 className="text-xl font-bold">Free Plan</h3>
                      </div>
                      <div className="space-y-3">
                        {data.features.slice(0, 3).map((feature, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <Check className="w-5 h-5 text-success shrink-0 mt-0.5" />
                            <span className="text-sm text-muted-foreground">{feature.title}</span>
                          </div>
                        ))}
                        {data.limitations.map((limitation, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <X className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                            <span className="text-sm text-muted-foreground">{limitation}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Premium Tier */}
                    <div className="bg-gradient-to-br from-accent/10 to-accent/5 border-2 border-accent/20 rounded-xl p-6 relative">
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="inline-block px-3 py-1 bg-accent text-white text-xs font-bold rounded-full">
                          RECOMMENDED
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mb-4 pt-2">
                        <h3 className="text-xl font-bold">Premium Plan</h3>
                      </div>
                      <div className="space-y-3 mb-6">
                        {data.features.map((feature, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <Check className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                            <span className="text-sm text-muted-foreground">{feature.title}</span>
                          </div>
                        ))}
                        {data.upgradePoints &&
                          data.upgradePoints.map((point, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <Check className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                              <span className="text-sm font-medium text-text-primary">{point}</span>
                            </div>
                          ))}
                      </div>
                      <Link
                        href={data.upgradePath || '/pricing'}
                        className="block w-full py-3 bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg text-center transition-colors"
                      >
                        Upgrade to Premium
                        <ArrowRight className="inline-block w-4 h-4 ml-1" />
                      </Link>
                    </div>
                  </div>
                </div>
              </section>
            </FadeIn>
          )}

          {/* FAQ */}
          {data.faq && data.faq.length > 0 && (
            <FAQSection faqs={data.faq} pageType="free" slug={data.slug} />
          )}

          {/* Related Pages */}
          {relatedPages.length > 0 && <RelatedPagesSection relatedPages={relatedPages} />}

          {/* Upgrade CTA */}
          <div className="py-8">
            <FadeIn>
              <CTASection
                title="Ready for unlimited access?"
                description="Upgrade to Premium for unlimited credits, faster processing, and priority support. No watermarks, ever."
                ctaText="View Premium Plans"
                ctaUrl={data.upgradePath || '/pricing'}
                pageType="free"
                slug={data.slug}
              />
            </FadeIn>
          </div>

          {/* Related Free Tools */}
          {data.relatedFree && data.relatedFree.length > 0 && (
            <FadeIn delay={0.6}>
              <section className="py-8 border-t border-border">
                <h2 className="text-2xl font-bold mb-6">More Free Tools</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {data.relatedFree.map((slug, idx) => (
                    <Link
                      key={idx}
                      href={`/free/${slug}`}
                      className="p-4 border border-border rounded-lg hover:border-success hover:shadow-md transition-all"
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
