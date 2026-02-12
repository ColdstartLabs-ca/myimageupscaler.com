/**
 * Free Page Template Component
 * Template for free tool landing pages that highlight free features
 * with clear upgrade paths to premium
 */

'use client';

import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';
import type { Locale } from '@/i18n/config';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import type { IFreePage } from '@/lib/seo/pseo-types';
import type { IRelatedPage } from '@/lib/seo/related-pages';
import { ArrowRight, Check, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { ReactElement } from 'react';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { FeaturesSection } from '../sections/FeaturesSection';
import { HeroSection } from '../sections/HeroSection';
import { RelatedPagesSection } from '../sections/RelatedPagesSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';

interface IFreePageTemplateProps {
  data: IFreePage;
  locale?: Locale;
  relatedPages?: IRelatedPage[];
}

export function FreePageTemplate({ data, locale, relatedPages = [] }: IFreePageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/free/${data.slug}`);
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

  const _sliderLabels = getBeforeAfterLabels(locale);

  return (
    <div className="min-h-screen bg-main relative overflow-x-hidden">
      <PSEOPageTracker
        pageType="free"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="free" slug={data.slug} />

      {/* Full Width Hero Area */}
      <div className="relative">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative z-30 pt-6">
          <BreadcrumbNav
            items={[
              { label: 'Home', href: '/' },
              { label: 'Free Tools', href: '/free' },
              { label: data.title, href: `/free/${data.slug}` },
            ]}
          />
        </div>

        <div className="relative h-full">
          {/* Badge Area - Centered above Hero */}
          <div className="absolute top-8 left-1/2 -translate-x-1/2 flex gap-2 z-30">
            <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 text-emerald-500 text-sm font-semibold rounded-full glass-strong border border-emerald-500/20">
              <Sparkles className="w-4 h-4" />
              Free Tool
            </span>
          </div>

          <HeroSection
            h1={data.h1}
            intro={data.intro}
            ctaText="Start Free"
            ctaUrl={data.upgradePath || '/?signup=1'}
            pageType="free"
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

          {/* Before/After Slider Removed (Bird Image) */}

          {/* Free Features */}
          {data.features && data.features.length > 0 && (
            <div className="py-12">
              <FeaturesSection features={data.features} />
            </div>
          )}

          {/* Free vs Premium Comparison */}
          {data.limitations && data.limitations.length > 0 && (
            <FadeIn delay={0.4}>
              <section className="py-12">
                <div className="max-w-4xl mx-auto">
                  <h2 className="text-2xl md:text-3xl font-bold text-center mb-4 text-white">
                    Free vs Premium
                  </h2>
                  <p className="text-text-secondary text-center mb-12">
                    Start free, upgrade when you need more power
                  </p>

                  <div className="grid md:grid-cols-2 gap-8">
                    {/* Free Tier */}
                    <div className="glass-card-2025 p-8 border-white/10">
                      <div className="flex items-center gap-2 mb-6">
                        <Sparkles className="w-6 h-6 text-emerald-500" />
                        <h3 className="text-xl font-bold text-white">Free Plan</h3>
                      </div>
                      <div className="space-y-4">
                        {data.features.slice(0, 3).map((feature, idx) => (
                          <div key={idx} className="flex items-start gap-3">
                            <Check className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                            <span className="text-base text-text-secondary">{feature.title}</span>
                          </div>
                        ))}
                        {data.limitations.map((limitation, idx) => (
                          <div key={idx} className="flex items-start gap-3 opacity-50">
                            <X className="w-5 h-5 text-text-tertiary shrink-0 mt-0.5" />
                            <span className="text-base text-text-tertiary">{limitation}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Premium Tier */}
                    <div className="glass-card-2025 p-8 border-accent/30 bg-accent/5 relative">
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="inline-block px-3 py-1 bg-accent text-white text-xs font-bold rounded-full shadow-lg shadow-accent/20">
                          RECOMMENDED
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mb-6 pt-2">
                        <h3 className="text-xl font-bold text-white">Premium Plan</h3>
                      </div>
                      <div className="space-y-4 mb-8">
                        {data.features.map((feature, idx) => (
                          <div key={idx} className="flex items-start gap-3">
                            <Check className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                            <span className="text-base text-text-secondary">{feature.title}</span>
                          </div>
                        ))}
                        {data.upgradePoints &&
                          data.upgradePoints.map((point, idx) => (
                            <div key={idx} className="flex items-start gap-3">
                              <Check className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                              <span className="text-base font-bold text-white">{point}</span>
                            </div>
                          ))}
                      </div>
                      <Link
                        href={data.upgradePath || '/pricing'}
                        className="block w-full py-4 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl text-center transition-all shadow-lg shadow-accent/20 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        Upgrade to Premium
                        <ArrowRight className="inline-block w-5 h-5 ml-2" />
                      </Link>
                    </div>
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
              <FAQSection faqs={data.faq} pageType="free" slug={data.slug} />
            </div>
          )}
        </article>
      </div>

      {/* Final CTA Full Width */}
      <CTASection
        title="Ready for unlimited access?"
        description="Upgrade to Premium for unlimited credits, faster processing, and priority support. No watermarks, ever."
        ctaText="View Premium Plans"
        ctaUrl={data.upgradePath || '/pricing'}
        pageType="free"
        slug={data.slug}
      />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Related Free Tools */}
        {data.relatedFree && data.relatedFree.length > 0 && (
          <FadeIn delay={0.6}>
            <section className="py-12 border-t border-white/10 mt-12">
              <h2 className="text-2xl font-bold mb-8 text-white">More Free Tools</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {data.relatedFree.map((slug, idx) => (
                  <Link
                    key={idx}
                    href={`/free/${slug}`}
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
