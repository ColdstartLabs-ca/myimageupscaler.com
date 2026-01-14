/**
 * Guide Page Template Component
 * Template for guide/tutorial landing pages (how-to, tutorials, explainers)
 */

'use client';

import type { IGuidePage } from '@/lib/seo/pseo-types';
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
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import { BookOpen, Clock, BarChart3, Lightbulb, CheckCircle2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { Locale } from '@/i18n/config';

interface IGuidePageTemplateProps {
  data: IGuidePage;
  locale?: Locale;
  relatedPages?: IRelatedPage[];
}

export function GuidePageTemplate({ data, locale, relatedPages = [] }: IGuidePageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/guides/${data.slug}`);
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

  // Difficulty badge styling
  const difficultyStyles = {
    beginner: 'bg-surface-light text-success',
    intermediate: 'bg-warning/20 text-warning',
    advanced: 'bg-error/20 text-error',
  };

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
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 70%)',
        }}
      />

      <PSEOPageTracker
        pageType="guide"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="guide" slug={data.slug} />

      <div className="relative max-w-4xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Breadcrumb */}
        <div className="pt-6 pb-4">
          <BreadcrumbNav
            items={[
              { label: 'Home', href: '/' },
              { label: 'Guides', href: '/guides' },
              { label: data.title, href: `/guides/${data.slug}` },
            ]}
          />
        </div>

        <article>
          {/* Hero Section with Guide Badge */}
          <div className="relative">
            <div className="absolute -top-4 left-0 flex gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-success/20 text-success text-sm font-semibold rounded-full">
                <BookOpen className="w-4 h-4" />
                {data.guideType === 'how-to' ? 'How-To Guide' : 'Tutorial'}
              </span>
              {data.difficulty && (
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-full capitalize ${
                    difficultyStyles[data.difficulty]
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  {data.difficulty}
                </span>
              )}
            </div>
            <div className="pt-8">
              <HeroSection
                h1={data.h1}
                intro={data.intro}
                ctaText="Get Started"
                ctaUrl="/?signup=1"
                pageType="guide"
                slug={data.slug}
              />
            </div>
          </div>

          {/* Guide Meta */}
          {data.estimatedTime && (
            <FadeIn delay={0.2}>
              <div className="flex items-center justify-center gap-6 py-6 text-sm text-muted-foreground">
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
                  className="prose prose-invert prose-slate max-w-none prose-p:text-gray-300 dark:prose-p:text-gray-300"
                />
              </div>
            </FadeIn>
          )}

          {/* Before/After Slider */}
          <FadeIn delay={0.32}>
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

          {/* Step-by-Step Instructions */}
          {data.steps && data.steps.length > 0 && (
            <FadeIn delay={0.4}>
              <section className="py-12">
                <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
                  Step-by-Step Instructions
                </h2>
                <div className="space-y-8">
                  {data.steps.map((step, idx) => (
                    <div
                      key={idx}
                      id={`step-${idx + 1}`}
                      className="relative bg-surface border-2 border-border rounded-xl p-6 hover:border-accent transition-colors"
                    >
                      {/* Step Number Badge */}
                      <div className="absolute -top-4 -left-4 w-12 h-12 bg-success text-white rounded-full flex items-center justify-center text-xl font-bold shadow-lg">
                        {idx + 1}
                      </div>

                      <div className="ml-8">
                        <h3 className="text-xl font-bold mb-3">{step.title}</h3>
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
                <div className="bg-gradient-to-br from-success/10 to-success/5 rounded-xl p-8 border border-success/20">
                  <div className="flex items-center gap-2 mb-6">
                    <Lightbulb className="w-6 h-6 text-success" />
                    <h2 className="text-2xl font-bold">Pro Tips & Best Practices</h2>
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
            <FAQSection faqs={data.faq} pageType="guide" slug={data.slug} />
          )}

          {/* Related Pages */}
          {relatedPages.length > 0 && <RelatedPagesSection relatedPages={relatedPages} />}

          {/* CTA */}
          <div className="py-8">
            <FadeIn>
              <CTASection
                title="Ready to put this guide into action?"
                description="Start enhancing your images with AI technology. No credit card required to get started."
                ctaText="Try It Free"
                ctaUrl="/?signup=1"
                pageType="guide"
                slug={data.slug}
              />
            </FadeIn>
          </div>

          {/* Related Guides */}
          {data.relatedGuides && data.relatedGuides.length > 0 && (
            <FadeIn delay={0.6}>
              <section className="py-8 border-t border-border">
                <h2 className="text-2xl font-bold mb-6">Related Guides</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.relatedGuides.map((slug, idx) => (
                    <Link
                      key={idx}
                      href={`/guides/${slug}`}
                      className="p-4 border border-border rounded-lg hover:border-accent hover:shadow-md transition-all group bg-surface"
                    >
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-success" />
                        <span className="text-sm font-medium text-primary capitalize flex-1">
                          {slug.replace(/-/g, ' ')}
                        </span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-success group-hover:translate-x-1 transition-all" />
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
              <section className="py-8">
                <h2 className="text-2xl font-bold mb-6">Recommended Tools</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {data.relatedTools.map((slug, idx) => (
                    <Link
                      key={idx}
                      href={`/tools/${slug}`}
                      className="p-4 bg-surface rounded-lg hover:bg-success/10 hover:border-success/20 border border-transparent transition-all"
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
