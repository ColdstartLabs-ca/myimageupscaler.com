/**
 * Compare Page Template Component
 * Template for comparison landing pages (vs pages and "best of" pages)
 */

import type { IComparisonPage } from '@/lib/seo/pseo-types';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import { ReactElement } from 'react';
import { clientEnv } from '@shared/config/env';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { HeroSection } from '../sections/HeroSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';
import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';
import { Check, X, Star, Award, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface IComparePageTemplateProps {
  data: IComparisonPage;
}

export function ComparePageTemplate({ data }: IComparePageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/compare/${data.slug}`);
  const tier = pageMapping?.tier;

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
          background: 'radial-gradient(circle, rgba(249, 115, 22, 0.08) 0%, transparent 70%)',
        }}
      />

      <PSEOPageTracker
        pageType="comparison"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="comparison" slug={data.slug} />

      <div className="relative max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Breadcrumb */}
        <div className="pt-6 pb-4">
          <BreadcrumbNav
            items={[
              { label: 'Home', href: '/' },
              { label: 'Comparisons', href: '/compare' },
              { label: data.title, href: `/compare/${data.slug}` },
            ]}
          />
        </div>

        <article>
          {/* Hero Section with Comparison Badge */}
          <div className="relative">
            <div className="absolute -top-4 left-0">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-warning/20 text-warning text-sm font-semibold rounded-full">
                <Star className="w-4 h-4" />
                Comparison
              </span>
            </div>
            <div className="pt-8">
              <HeroSection
                h1={data.h1}
                intro={data.intro}
                ctaText={`Try ${clientEnv.APP_NAME} Free`}
                ctaUrl="/?signup=1"
                pageType="comparison"
                slug={data.slug}
              />
            </div>
          </div>

          {/* Comparison Table */}
          {data.products && data.products.length > 0 && data.criteria && (
            <FadeIn delay={0.3}>
              <section className="py-12">
                <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
                  Head-to-Head Comparison
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full bg-surface border border-border rounded-xl overflow-hidden">
                    <thead className="bg-surface">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-primary">
                          Feature
                        </th>
                        {data.products.map((product, idx) => (
                          <th
                            key={idx}
                            className={`px-6 py-4 text-center text-sm font-semibold ${
                              product.isRecommended
                                ? 'bg-surface-light text-primary'
                                : 'text-primary'
                            }`}
                          >
                            {product.isRecommended && (
                              <div className="inline-flex items-center gap-1 px-2 py-1 bg-accent text-white text-xs font-bold rounded-full mb-2">
                                <Award className="w-3 h-3" />
                                BEST
                              </div>
                            )}
                            <div>{product.name}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.criteria.map((criterion, idx) => (
                        <tr key={idx} className="hover:bg-surface">
                          <td className="px-6 py-4 text-sm font-medium text-primary">
                            {criterion.name}
                          </td>
                          {data.products?.map((product, pIdx) => {
                            const value = product.features?.[criterion.key];
                            return (
                              <td
                                key={pIdx}
                                className={`px-6 py-4 text-center ${
                                  product.isRecommended ? 'bg-surface-light' : ''
                                }`}
                              >
                                {typeof value === 'boolean' ? (
                                  value ? (
                                    <Check className="w-5 h-5 text-success mx-auto" />
                                  ) : (
                                    <X className="w-5 h-5 text-muted-foreground mx-auto" />
                                  )
                                ) : (
                                  <span className="text-sm text-muted-foreground">
                                    {value || '-'}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </FadeIn>
          )}

          {/* Verdict */}
          {data.verdict && (
            <FadeIn delay={0.4}>
              <section className="py-12">
                <div className="max-w-3xl mx-auto bg-gradient-to-br from-accent/10 to-accent/5 border-2 border-accent/20 rounded-xl p-8">
                  <div className="flex items-center gap-2 mb-4">
                    <Award className="w-6 h-6 text-accent" />
                    <h2 className="text-2xl font-bold">Our Verdict</h2>
                  </div>
                  <div className="prose prose-slate max-w-none">
                    <p className="text-muted-foreground leading-relaxed">{data.verdict.summary}</p>
                    {data.verdict.winner && (
                      <div className="mt-4 p-4 bg-surface rounded-lg border border-accent/20">
                        <div className="font-semibold text-primary mb-1">Winner:</div>
                        <div className="text-lg font-bold text-accent">{data.verdict.winner}</div>
                        {data.verdict.reason && (
                          <p className="text-sm text-muted-foreground mt-2">
                            {data.verdict.reason}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </FadeIn>
          )}

          {/* Detailed Reviews */}
          {data.products && data.products.length > 0 && (
            <FadeIn delay={0.5}>
              <section className="py-12">
                <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
                  Detailed Reviews
                </h2>
                <div className="space-y-6">
                  {data.products.map((product, idx) => (
                    <div
                      key={idx}
                      className={`border rounded-xl p-6 ${
                        product.isRecommended
                          ? 'border-accent/50 bg-surface-light'
                          : 'border-border bg-surface'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-xl font-bold mb-1">{product.name}</h3>
                          {product.tagline && (
                            <p className="text-sm text-muted-foreground">{product.tagline}</p>
                          )}
                        </div>
                        {product.rating && (
                          <div className="flex items-center gap-1">
                            <Star className="w-5 h-5 text-warning fill-warning" />
                            <span className="font-bold text-lg">{product.rating}</span>
                            <span className="text-sm text-muted-foreground">/5</span>
                          </div>
                        )}
                      </div>
                      {product.description && (
                        <p className="text-muted-foreground mb-4">{product.description}</p>
                      )}
                      {product.pros && product.pros.length > 0 && (
                        <div className="mb-4">
                          <h4 className="font-semibold text-sm text-success mb-2">Pros:</h4>
                          <ul className="space-y-1">
                            {product.pros.map((pro, pIdx) => (
                              <li key={pIdx} className="flex items-start gap-2 text-sm">
                                <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />
                                <span className="text-muted-foreground">{pro}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {product.cons && product.cons.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-sm text-error mb-2">Cons:</h4>
                          <ul className="space-y-1">
                            {product.cons.map((con, cIdx) => (
                              <li key={cIdx} className="flex items-start gap-2 text-sm">
                                <X className="w-4 h-4 text-error shrink-0 mt-0.5" />
                                <span className="text-muted-foreground">{con}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* FAQ */}
          {data.faq && data.faq.length > 0 && (
            <FAQSection faqs={data.faq} pageType="comparison" slug={data.slug} />
          )}

          {/* CTA */}
          <div className="py-8">
            <FadeIn>
              <CTASection
                title="Ready to try the best?"
                description={`Experience the difference with ${clientEnv.APP_NAME}'s AI-powered image enhancement. Start free today.`}
                ctaText={`Try ${clientEnv.APP_NAME} Free`}
                ctaUrl="/?signup=1"
                pageType="comparison"
                slug={data.slug}
              />
            </FadeIn>
          </div>

          {/* Related Comparisons */}
          {data.relatedComparisons && data.relatedComparisons.length > 0 && (
            <FadeIn delay={0.6}>
              <section className="py-8 border-t border-border">
                <h2 className="text-2xl font-bold mb-6">More Comparisons</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {data.relatedComparisons.map((slug, idx) => (
                    <Link
                      key={idx}
                      href={`/compare/${slug}`}
                      className="p-4 border border-border rounded-lg hover:border-warning hover:shadow-md transition-all group"
                    >
                      <span className="text-sm font-medium text-primary capitalize">
                        {slug.replace(/-/g, ' ')}
                      </span>
                      <ArrowRight className="inline-block w-4 h-4 ml-1 text-muted-foreground group-hover:text-warning group-hover:translate-x-1 transition-all" />
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
