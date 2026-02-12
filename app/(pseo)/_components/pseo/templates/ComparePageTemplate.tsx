/**
 * Compare Page Template Component
 * Template for comparison landing pages (vs pages and "best of" pages)
 */

import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import type { IComparisonPage } from '@/lib/seo/pseo-types';
import type { IRelatedPage } from '@/lib/seo/related-pages';
import { clientEnv } from '@shared/config/env';
import { ArrowRight, Award, Check, Star, X } from 'lucide-react';
import Link from 'next/link';
import { ReactElement } from 'react';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { HeroSection } from '../sections/HeroSection';
import { RelatedPagesSection } from '../sections/RelatedPagesSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';

interface IComparePageTemplateProps {
  data: IComparisonPage;
  relatedPages?: IRelatedPage[];
}

export function ComparePageTemplate({ data, relatedPages = [] }: IComparePageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/compare/${data.slug}`);
  const tier = pageMapping?.tier;

  return (
    <div className="min-h-screen bg-main relative overflow-x-hidden">
      <PSEOPageTracker
        pageType="comparison"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="comparison" slug={data.slug} />

      {/* Full Width Hero Area */}
      <div className="relative">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative z-30 pt-6">
          <BreadcrumbNav
            items={[
              { label: 'Home', href: '/' },
              { label: 'Comparisons', href: '/compare' },
              { label: data.title, href: `/compare/${data.slug}` },
            ]}
          />
        </div>

        <div className="relative h-full">
          {/* Badge Area - Centered above Hero */}
          <div className="absolute top-8 left-1/2 -translate-x-1/2 flex gap-2 z-30">
            <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500/10 text-orange-500 text-sm font-semibold rounded-full glass-strong border border-orange-500/20">
              <Star className="w-4 h-4" />
              Comparison
            </span>
          </div>

          <HeroSection
            h1={data.h1}
            intro={data.intro}
            ctaText={`Try ${clientEnv.APP_NAME} Free`}
            ctaUrl="/?signup=1"
            pageType="comparison"
            slug={data.slug}
            hideBadge={true}
          />
        </div>
      </div>

      <div className="relative max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
        <article>
          {/* Comparison Table */}
          {data.products && data.products.length > 0 && data.criteria && (
            <FadeIn delay={0.3}>
              <div className="py-12">
                <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
                  Head-to-Head Comparison
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full glass-card-2025 overflow-hidden">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-text-primary">
                          Feature
                        </th>
                        {data.products.map((product, idx) => (
                          <th
                            key={idx}
                            className={`px-6 py-4 text-center text-sm font-semibold ${product.isRecommended
                              ? 'bg-white/10 text-text-primary'
                              : 'text-text-primary'
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
                    <tbody className="divide-y divide-white/10">
                      {data.criteria.map((criterion, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4 text-sm font-medium text-text-primary">
                            {criterion.name}
                          </td>
                          {data.products?.map((product, pIdx) => {
                            const value = product.features?.[criterion.key];
                            return (
                              <td
                                key={pIdx}
                                className={`px-6 py-4 text-center ${product.isRecommended ? 'bg-white/5' : ''
                                  }`}
                              >
                                {typeof value === 'boolean' ? (
                                  value ? (
                                    <Check className="w-5 h-5 text-success mx-auto" />
                                  ) : (
                                    <X className="w-5 h-5 text-text-tertiary mx-auto" />
                                  )
                                ) : (
                                  <span className="text-sm text-text-secondary">
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
              </div>
            </FadeIn>
          )}

          {/* Verdict */}
          {data.verdict && (
            <FadeIn delay={0.4}>
              <div className="py-12">
                <div className="max-w-3xl mx-auto glass-card-2025 p-8 border-accent/20">
                  <div className="flex items-center gap-2 mb-4">
                    <Award className="w-6 h-6 text-accent" />
                    <h2 className="text-2xl font-bold text-text-primary">Our Verdict</h2>
                  </div>
                  <div className="prose prose-invert max-w-none">
                    <p className="text-text-secondary leading-relaxed">{data.verdict.summary}</p>
                    {data.verdict.winner && (
                      <div className="mt-4 p-4 bg-white/5 rounded-lg border border-accent/20">
                        <div className="font-semibold text-text-primary mb-1 text-sm">Winner:</div>
                        <div className="text-xl font-bold text-accent">{data.verdict.winner}</div>
                        {data.verdict.reason && (
                          <p className="text-sm text-text-secondary mt-2">
                            {data.verdict.reason}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </FadeIn>
          )}

          {/* Detailed Reviews */}
          {data.products && data.products.length > 0 && (
            <FadeIn delay={0.5}>
              <div className="py-12">
                <h2 className="text-2xl md:text-3xl font-bold text-center mb-8 text-text-primary">
                  Detailed Reviews
                </h2>
                <div className="space-y-6">
                  {data.products.map((product, idx) => (
                    <div
                      key={idx}
                      className={`glass-card-2025 p-6 ${product.isRecommended
                        ? 'border-accent/40 bg-accent/5'
                        : ''
                        }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-xl font-bold mb-1 text-text-primary">{product.name}</h3>
                          {product.tagline && (
                            <p className="text-sm text-text-secondary">{product.tagline}</p>
                          )}
                        </div>
                        {product.rating && (
                          <div className="flex items-center gap-1">
                            <Star className="w-5 h-5 text-orange-400 fill-orange-400" />
                            <span className="font-bold text-lg text-text-primary">{product.rating}</span>
                            <span className="text-sm text-text-secondary">/5</span>
                          </div>
                        )}
                      </div>
                      {product.description && (
                        <p className="text-text-secondary mb-4">{product.description}</p>
                      )}
                      {product.pros && product.pros.length > 0 && (
                        <div className="mb-4">
                          <h4 className="font-semibold text-sm text-success/90 mb-2">Pros:</h4>
                          <ul className="space-y-1">
                            {product.pros.map((pro, pIdx) => (
                              <li key={pIdx} className="flex items-start gap-2 text-sm text-text-secondary">
                                <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />
                                <span>{pro}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {product.cons && product.cons.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-sm text-error/90 mb-2">Cons:</h4>
                          <ul className="space-y-1">
                            {product.cons.map((con, cIdx) => (
                              <li key={cIdx} className="flex items-start gap-2 text-sm text-text-secondary">
                                <X className="w-4 h-4 text-error shrink-0 mt-0.5" />
                                <span>{con}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
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
              <FAQSection faqs={data.faq} pageType="comparison" slug={data.slug} />
            </div>
          )}
        </article>
      </div>

      {/* Full Width CTA Section */}
      <CTASection
        title="Ready to try the best?"
        description={`Experience the difference with ${clientEnv.APP_NAME}'s AI-powered image enhancement. Start free today.`}
        ctaText={`Try ${clientEnv.APP_NAME} Free`}
        ctaUrl="/?signup=1"
        pageType="comparison"
        slug={data.slug}
      />

      <div className="relative max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Related Comparisons */}
        {data.relatedComparisons && data.relatedComparisons.length > 0 && (
          <FadeIn delay={0.6}>
            <section className="py-12 border-t border-border mt-12">
              <h2 className="text-2xl font-bold mb-6 text-white">More Comparisons</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {data.relatedComparisons.map((slug, idx) => (
                  <Link
                    key={idx}
                    href={`/compare/${slug}`}
                    className="p-4 border border-border rounded-lg hover:border-warning hover:shadow-md transition-all group glass-card-2025"
                  >
                    <span className="text-sm font-medium text-text-primary capitalize">
                      {slug.replace(/-/g, ' ')}
                    </span>
                    <ArrowRight className="inline-block w-4 h-4 ml-1 text-text-tertiary group-hover:text-warning group-hover:translate-x-1 transition-all" />
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
