/**
 * Guide Page Template Component
 * Template for guide/tutorial landing pages (how-to, tutorials, explainers)
 */

'use client';

import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';
import type { Locale } from '@/i18n/config';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import type { IGuidePage } from '@/lib/seo/pseo-types';
import type { IRelatedPage } from '@/lib/seo/related-pages';
import { BeforeAfterSlider } from '@client/components/ui/BeforeAfterSlider';
import { ArrowRight, BarChart3, BookOpen, CheckCircle2, Clock, Lightbulb } from 'lucide-react';
import Link from 'next/link';
import { ReactElement } from 'react';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { HeroSection } from '../sections/HeroSection';
import { RelatedPagesSection } from '../sections/RelatedPagesSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';

interface IGuidePageTemplateProps {
  data: IGuidePage;
  locale?: Locale;
  relatedPages?: IRelatedPage[];
}

export function GuidePageTemplate({ data, locale: _locale, relatedPages = [] }: IGuidePageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/guides/${data.slug}`);
  const tier = pageMapping?.tier;

  // Difficulty badge styling
  const _difficultyStyles = {
    beginner: 'bg-surface-light text-success',
    intermediate: 'bg-warning/20 text-warning',
    advanced: 'bg-error/20 text-error',
  };

  return (
    <div className="min-h-screen bg-main relative overflow-x-hidden">
      <PSEOPageTracker
        pageType="guide"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="guide" slug={data.slug} />

      {/* Full Width Hero Area */}
      <div className="relative">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative z-30 pt-6">
          <BreadcrumbNav
            items={[
              { label: 'Home', href: '/' },
              { label: 'Guides', href: '/guides' },
              { label: data.title, href: `/guides/${data.slug}` },
            ]}
          />
        </div>

        <div className="relative h-full">
          {/* Badge Area - Centered above Hero */}
          <div className="absolute top-8 left-1/2 -translate-x-1/2 flex gap-2 z-30">
            <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 text-emerald-500 text-sm font-semibold rounded-full glass-strong border border-emerald-500/20">
              <BookOpen className="w-4 h-4" />
              {data.guideType === 'how-to' ? 'How-To Guide' : 'Tutorial'}
            </span>
            {data.difficulty && (
              <span
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-full capitalize glass-strong border ${data.difficulty === 'beginner'
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  : data.difficulty === 'intermediate'
                    ? 'bg-orange-500/10 text-orange-500 border-orange-500/20'
                    : 'bg-red-500/10 text-red-500 border-red-500/20'
                  }`}
              >
                <BarChart3 className="w-4 h-4" />
                {data.difficulty}
              </span>
            )}
          </div>

          <HeroSection
            h1={data.h1}
            intro={data.intro}
            ctaText="Get Started"
            ctaUrl="/?signup=1"
            pageType="guide"
            slug={data.slug}
            hideBadge={true}
          />
        </div>
      </div>

      <div className="relative max-w-4xl mx-auto px-6 sm:px-8 lg:px-12">
        <article>
          {/* Guide Meta */}
          {data.estimatedTime && (
            <FadeIn delay={0.2}>
              <div className="flex items-center justify-center gap-6 py-6 text-sm text-text-secondary">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>{data.estimatedTime}</span>
                </div>
                {data.steps && data.steps.length > 0 && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{data.steps.length} Steps</span>
                  </div>
                )}
              </div>
            </FadeIn>
          )}

          {/* Description */}
          {data.description && (
            <FadeIn delay={0.3}>
              <div className="max-w-3xl mx-auto py-8">
                <MarkdownRenderer
                  content={data.description}
                  className="prose prose-invert prose-slate max-w-none prose-p:text-text-secondary"
                />
              </div>
            </FadeIn>
          )}

          {/* Before/After Slider - Page-specific images when available */}
          {data.beforeAfterImages && (
            <FadeIn delay={0.35}>
              <div className="py-12">
                <div className="max-w-3xl mx-auto">
                  <BeforeAfterSlider
                    beforeUrl={data.beforeAfterImages.before}
                    afterUrl={data.beforeAfterImages.after}
                    beforeLabel={data.beforeAfterImages.beforeLabel ?? 'Before'}
                    afterLabel={data.beforeAfterImages.afterLabel ?? 'After'}
                    className="shadow-2xl shadow-accent/10"
                  />
                </div>
              </div>
            </FadeIn>
          )}

          {/* Step-by-Step Instructions */}
          {data.steps && data.steps.length > 0 && (
            <FadeIn delay={0.4}>
              <section className="py-12">
                <h2 className="text-2xl md:text-3xl font-bold text-center mb-8 text-white">
                  Step-by-Step Instructions
                </h2>
                <div className="space-y-8">
                  {data.steps.map((step, idx) => (
                    <div
                      key={idx}
                      id={`step-${idx + 1}`}
                      className="relative glass-card-2025 p-6 hover:border-accent transition-colors"
                    >
                      {/* Step Number Badge */}
                      <div className="absolute -top-4 -left-4 w-12 h-12 bg-success text-white rounded-full flex items-center justify-center text-xl font-bold shadow-lg">
                        {idx + 1}
                      </div>

                      <div className="ml-8">
                        <h3 className="text-xl font-bold mb-3 text-white">{step.title}</h3>
                        <MarkdownRenderer
                          content={step.content}
                          className="prose prose-invert prose-slate max-w-none prose-p:text-gray-300 prose-headings:text-white prose-strong:text-white prose-code:text-accent prose-a:text-accent hover:prose-a:text-accent/80 prose-li:text-gray-300"
                        />
                        {step.image && (
                          <div className="mt-4 rounded-lg overflow-hidden border border-border">
                            <img
                              src={step.image}
                              alt={step.title}
                              className="w-full h-auto"
                              loading="lazy"
                            />
                          </div>
                        )}
                        {step.tip && (
                          <div className="mt-4 p-4 bg-success/10 border-l-4 border-success rounded">
                            <div className="flex items-start gap-2">
                              <Lightbulb className="w-5 h-5 text-success shrink-0 mt-0.5" />
                              <div>
                                <div className="font-semibold text-text-primary text-sm mb-1">
                                  Pro Tip:
                                </div>
                                <p className="text-sm text-text-secondary">{step.tip}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* Additional Tips */}
          {data.tips && data.tips.length > 0 && (
            <FadeIn delay={0.5}>
              <section className="py-12">
                <div className="glass-card-2025 p-8 border-success/20">
                  <div className="flex items-center gap-2 mb-6">
                    <Lightbulb className="w-6 h-6 text-success" />
                    <h2 className="text-2xl font-bold text-white">Pro Tips & Best Practices</h2>
                  </div>
                  <ul className="space-y-3">
                    {data.tips.map((tip, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
                        <MarkdownRenderer
                          content={tip}
                          className="prose prose-p:text-gray-300 prose-strong:text-white prose-a:text-accent"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </FadeIn>
          )}

          {/* FAQ */}
          {data.faq && data.faq.length > 0 && (
            <div className="py-12">
              <FAQSection faqs={data.faq} pageType="guide" slug={data.slug} />
            </div>
          )}

          {/* Related Pages */}
          {relatedPages.length > 0 && (
            <div className="py-12">
              <RelatedPagesSection relatedPages={relatedPages} />
            </div>
          )}
        </article>
      </div>

      {/* Full Width CTA Section */}
      <CTASection
        title="Ready to put this guide into action?"
        description="Start enhancing your images with AI technology. No credit card required to get started."
        ctaText="Try It Free"
        ctaUrl="/?signup=1"
        pageType="guide"
        slug={data.slug}
      />

      <div className="relative max-w-4xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Related Guides */}
        {data.relatedGuides && data.relatedGuides.length > 0 && (
          <FadeIn delay={0.6}>
            <section className="py-12 border-t border-border mt-12">
              <h2 className="text-2xl font-bold mb-6 text-white">Related Guides</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.relatedGuides.map((slug, idx) => (
                  <Link
                    key={idx}
                    href={`/guides/${slug}`}
                    className="p-4 border border-border rounded-lg hover:border-accent hover:shadow-md transition-all group glass-card-2025"
                  >
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-success" />
                      <span className="text-sm font-medium text-text-primary capitalize flex-1">
                        {slug.replace(/-/g, ' ')}
                      </span>
                      <ArrowRight className="w-4 h-4 text-text-tertiary group-hover:text-success group-hover:translate-x-1 transition-all" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </FadeIn>
        )}

        {/* Related Tools */}
        {data.relatedTools && data.relatedTools.length > 0 && (
          <FadeIn delay={0.7}>
            <section className="py-12">
              <h2 className="text-2xl font-bold mb-6 text-white">Recommended Tools</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {data.relatedTools.map((slug, idx) => (
                  <Link
                    key={idx}
                    href={`/tools/${slug}`}
                    className="p-4 glass-card-2025 hover:bg-success/5 hover:border-success/20 transition-all"
                  >
                    <span className="text-sm font-medium text-text-primary capitalize">
                      {slug.replace(/-/g, ' ')}
                    </span>
                    <ArrowRight className="inline-block w-4 h-4 ml-1 text-text-tertiary" />
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
