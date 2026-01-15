/**
 * Alternative Page Template Component
 * Template for competitor comparison landing pages (vs Topaz, vs Bigjpg, etc.)
 */

import type { IAlternativePage } from '@/lib/seo/pseo-types';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import type { IRelatedPage } from '@/lib/seo/related-pages';
import { ReactElement } from 'react';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { HeroSection } from '../sections/HeroSection';
import { RelatedPagesSection } from '../sections/RelatedPagesSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';
import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';

interface IAlternativePageTemplateProps {
  data: IAlternativePage & {
    // Extended fields from actual JSON data
    competitor?: string;
    competitorName?: string;
    competitorPricing?: string;
    ourPricing?: string;
    keyDifferentiators?: Array<{
      title: string;
      ourAdvantage: string;
      theirLimitation: string;
    }>;
    comparisonTable?: Array<{
      feature: string;
      myimageupscaler: string;
      competitor: string;
    }>;
  };
  locale?: string;
  relatedPages?: IRelatedPage[];
}

export function AlternativePageTemplate({
  data,
  locale,
  relatedPages = [],
}: IAlternativePageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/alternatives/${data.slug}`);
  const tier = pageMapping?.tier;

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
        pageType="alternative"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="alternative" slug={data.slug} />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Breadcrumb */}
        <div className="pt-6 pb-4">
          <BreadcrumbNav
            items={[
              { label: 'Home', href: locale ? `/${locale}` : '/' },
              {
                label: 'Alternatives',
                href: locale ? `/${locale}/alternatives` : '/alternatives',
              },
              {
                label: data.competitorName || data.originalTool || data.title,
                href: locale
                  ? `/${locale}/alternatives/${data.slug}`
                  : `/alternatives/${data.slug}`,
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
            pageType="alternative"
            slug={data.slug}
          />

          {/* Pricing Comparison */}
          {data.competitorPricing && data.ourPricing && (
            <FadeIn delay={0.2}>
              <div className="py-8">
                <div className="max-w-xl mx-auto grid grid-cols-2 gap-4">
                  <div className="glass-card-2025 text-center">
                    <p className="text-sm text-text-tertiary mb-2">
                      {data.competitorName || 'Competitor'}
                    </p>
                    <p className="text-xl font-bold text-text-secondary">
                      {data.competitorPricing}
                    </p>
                  </div>
                  <div className="bg-accent-primary/10 rounded-xl p-6 border border-accent-primary text-center">
                    <p className="text-sm text-text-tertiary mb-2">MyImageUpscaler</p>
                    <p className="text-xl font-bold text-accent-primary">{data.ourPricing}</p>
                  </div>
                </div>
              </div>
            </FadeIn>
          )}

          {/* Key Differentiators */}
          {data.keyDifferentiators && data.keyDifferentiators.length > 0 && (
            <FadeIn delay={0.3}>
              <section className="py-16">
                <h2 className="text-2xl font-semibold text-text-primary text-center mb-8">
                  Why Choose MyImageUpscaler
                </h2>
                <div className="space-y-6">
                  {data.keyDifferentiators.map((diff, index) => (
                    <div
                      key={index}
                      className="glass-card-2025"
                    >
                      <h3 className="text-lg font-semibold text-text-primary mb-4">{diff.title}</h3>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="bg-accent-success/10 rounded-lg p-4">
                          <p className="text-sm font-medium text-accent-success mb-1">
                            Our Advantage
                          </p>
                          <p className="text-text-secondary text-sm">{diff.ourAdvantage}</p>
                        </div>
                        <div className="bg-accent-error/10 rounded-lg p-4">
                          <p className="text-sm font-medium text-accent-error mb-1">
                            Their Limitation
                          </p>
                          <p className="text-text-secondary text-sm">{diff.theirLimitation}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* Comparison Table */}
          {data.comparisonTable && data.comparisonTable.length > 0 && (
            <FadeIn delay={0.4}>
              <section className="py-16">
                <h2 className="text-2xl font-semibold text-text-primary text-center mb-8">
                  Feature Comparison
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border-default">
                        <th className="text-left py-4 px-4 text-text-primary font-semibold">
                          Feature
                        </th>
                        <th className="text-left py-4 px-4 text-accent-primary font-semibold">
                          MyImageUpscaler
                        </th>
                        <th className="text-left py-4 px-4 text-text-secondary font-semibold">
                          {data.competitorName || 'Competitor'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.comparisonTable.map((row, index) => (
                        <tr key={index} className="border-b border-border-default">
                          <td className="py-4 px-4 text-text-primary font-medium">{row.feature}</td>
                          <td className="py-4 px-4 text-text-secondary">{row.myimageupscaler}</td>
                          <td className="py-4 px-4 text-text-tertiary">{row.competitor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </FadeIn>
          )}

          {/* Alternatives list (from type definition) */}
          {data.alternatives && data.alternatives.length > 0 && (
            <FadeIn delay={0.4}>
              <section className="py-16">
                <h2 className="text-2xl font-semibold text-text-primary text-center mb-8">
                  Other Alternatives
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {data.alternatives.map((alt, index) => (
                    <div
                      key={index}
                      className="glass-card-2025"
                    >
                      <h3 className="text-lg font-semibold text-text-primary mb-2">{alt.name}</h3>
                      <p className="text-text-secondary text-sm mb-3">{alt.description}</p>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-tertiary">Pricing: {alt.pricing}</span>
                        <span className="text-accent-primary">Best for: {alt.bestFor}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* Related Pages */}
          {relatedPages.length > 0 && <RelatedPagesSection relatedPages={relatedPages} />}

          {/* FAQ */}
          {data.faq && data.faq.length > 0 && (
            <FAQSection faqs={data.faq} pageType="alternative" slug={data.slug} />
          )}

          {/* Final CTA */}
          <div className="py-8">
            <FadeIn>
              <CTASection
                title={`Ready to try a better alternative?`}
                description="Start enhancing images with AI today. No credit card required."
                ctaText="Try Free"
                ctaUrl="/"
                pageType="alternative"
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
