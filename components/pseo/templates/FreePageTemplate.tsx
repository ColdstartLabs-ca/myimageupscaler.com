/**
 * Free Page Template Component
 * Template for free tool landing pages that highlight free features
 * with clear upgrade paths to premium
 */

import type { IFreePage } from '@/lib/seo/pseo-types';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import { ReactElement } from 'react';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { FeaturesSection } from '../sections/FeaturesSection';
import { HeroSection } from '../sections/HeroSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';
import { FadeIn } from '@/components/ui/MotionWrappers';
import { Check, X, ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

interface IFreePageTemplateProps {
  data: IFreePage;
}

export function FreePageTemplate({ data }: IFreePageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/free/${data.slug}`);
  const tier = pageMapping?.tier;

  return (
    <div className="min-h-screen bg-white relative">
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
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 text-sm font-semibold rounded-full">
                <Sparkles className="w-4 h-4" />
                100% Free
              </span>
            </div>
            <div className="pt-8">
              <HeroSection
                h1={data.h1}
                intro={data.intro}
                ctaText="Start Free"
                ctaUrl={data.upgradePath || '/upscaler'}
                pageType="free"
                slug={data.slug}
              />
            </div>
          </div>

          {/* Description */}
          {data.description && (
            <FadeIn delay={0.2}>
              <div className="max-w-3xl mx-auto py-8">
                <p className="text-lg text-slate-600 leading-relaxed text-center">
                  {data.description}
                </p>
              </div>
            </FadeIn>
          )}

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
                  <p className="text-slate-600 text-center mb-8">
                    Start free, upgrade when you need more power
                  </p>

                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Free Tier */}
                    <div className="bg-white border-2 border-slate-200 rounded-xl p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="w-5 h-5 text-green-600" />
                        <h3 className="text-xl font-bold">Free Plan</h3>
                      </div>
                      <div className="space-y-3">
                        {data.features.slice(0, 3).map((feature, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                            <span className="text-sm text-slate-700">{feature.title}</span>
                          </div>
                        ))}
                        {data.limitations.map((limitation, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <X className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                            <span className="text-sm text-slate-500">{limitation}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Premium Tier */}
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6 relative">
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="inline-block px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full">
                          RECOMMENDED
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mb-4 pt-2">
                        <h3 className="text-xl font-bold">Premium Plan</h3>
                      </div>
                      <div className="space-y-3 mb-6">
                        {data.features.map((feature, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <Check className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                            <span className="text-sm text-slate-700">{feature.title}</span>
                          </div>
                        ))}
                        {data.upgradePoints &&
                          data.upgradePoints.map((point, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <Check className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                              <span className="text-sm font-medium text-blue-900">{point}</span>
                            </div>
                          ))}
                      </div>
                      <Link
                        href={data.upgradePath || '/pricing'}
                        className="block w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-center transition-colors"
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
              <section className="py-8 border-t border-slate-200">
                <h2 className="text-2xl font-bold mb-6">More Free Tools</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {data.relatedFree.map((slug, idx) => (
                    <Link
                      key={idx}
                      href={`/free/${slug}`}
                      className="p-4 border border-slate-200 rounded-lg hover:border-green-500 hover:shadow-md transition-all"
                    >
                      <span className="text-sm font-medium text-slate-900 capitalize">
                        {slug.replace(/-/g, ' ')}
                      </span>
                      <ArrowRight className="inline-block w-4 h-4 ml-1 text-slate-400" />
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
