/**
 * Use Case Page Template Component
 * Template for industry-specific use case landing pages
 */

import type { IUseCasePage } from '@/lib/seo/pseo-types';
import { getPageMappingByUrl } from '@/lib/seo/keyword-mappings';
import { ReactElement } from 'react';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { HeroSection } from '../sections/HeroSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';
import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';

interface IUseCasePageTemplateProps {
  data: IUseCasePage & {
    // Extended fields from actual JSON data
    platformRequirements?: Array<{
      platform: string;
      minimumSize: string;
      recommendedSize: string;
      maxFileSize: string;
      aspectRatio: string;
      format: string;
      background: string;
      notes: string;
    }>;
    commonProblems?: Array<{
      problem: string;
      solution: string;
      howTo: string;
    }>;
    workflow?: Array<{
      step: number;
      title: string;
      description: string;
    }>;
  };
  locale?: string;
}

export function UseCasePageTemplate({ data, locale }: IUseCasePageTemplateProps): ReactElement {
  // Look up tier from keyword mappings
  const pageMapping = getPageMappingByUrl(`/use-cases/${data.slug}`);
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
          background: 'radial-gradient(circle, rgba(45, 129, 255, 0.08) 0%, transparent 70%)',
        }}
      />

      <PSEOPageTracker
        pageType="use-case"
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
        tier={tier}
      />
      <ScrollTracker pageType="use-case" slug={data.slug} />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Breadcrumb */}
        <div className="pt-6 pb-4">
          <BreadcrumbNav
            items={[
              { label: 'Home', href: locale ? `/${locale}` : '/' },
              { label: 'Use Cases', href: locale ? `/${locale}/use-cases` : '/use-cases' },
              {
                label: data.industry || data.title,
                href: locale ? `/${locale}/use-cases/${data.slug}` : `/use-cases/${data.slug}`,
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
            pageType="use-case"
            slug={data.slug}
          />

          {/* Description */}
          {data.description && (
            <FadeIn delay={0.2}>
              <div className="max-w-3xl mx-auto py-8">
                <p className="text-lg text-text-secondary leading-relaxed text-center">
                  {data.description}
                </p>
              </div>
            </FadeIn>
          )}

          {/* Platform Requirements */}
          {data.platformRequirements && data.platformRequirements.length > 0 && (
            <FadeIn delay={0.3}>
              <section className="py-12">
                <h2 className="text-2xl font-semibold text-text-primary text-center mb-8">
                  Platform Requirements
                </h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {data.platformRequirements.map((req, index) => (
                    <div
                      key={index}
                      className="bg-surface-light rounded-xl p-6 border border-border-default"
                    >
                      <h3 className="text-lg font-semibold text-text-primary mb-4">
                        {req.platform}
                      </h3>
                      <div className="space-y-2 text-sm text-text-secondary">
                        <div className="flex justify-between">
                          <span>Minimum:</span>
                          <span className="font-medium text-text-primary">{req.minimumSize}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Recommended:</span>
                          <span className="font-medium text-text-primary">
                            {req.recommendedSize}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Max File:</span>
                          <span className="font-medium text-text-primary">{req.maxFileSize}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Aspect Ratio:</span>
                          <span className="font-medium text-text-primary">{req.aspectRatio}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Format:</span>
                          <span className="font-medium text-text-primary">{req.format}</span>
                        </div>
                      </div>
                      {req.notes && (
                        <p className="mt-4 text-xs text-text-tertiary border-t border-border-default pt-3">
                          {req.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* Common Problems */}
          {data.commonProblems && data.commonProblems.length > 0 && (
            <FadeIn delay={0.4}>
              <section className="py-12">
                <h2 className="text-2xl font-semibold text-text-primary text-center mb-8">
                  Common Problems & Solutions
                </h2>
                <div className="space-y-6">
                  {data.commonProblems.map((item, index) => (
                    <div
                      key={index}
                      className="bg-surface-light rounded-xl p-6 border border-border-default"
                    >
                      <h3 className="text-lg font-semibold text-text-primary mb-2">
                        {item.problem}
                      </h3>
                      <p className="text-text-secondary mb-3">{item.solution}</p>
                      {item.howTo && (
                        <div className="bg-surface-dark rounded-lg p-4 text-sm">
                          <span className="font-medium text-accent-primary">How to: </span>
                          <span className="text-text-secondary">{item.howTo}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* Workflow Steps */}
          {data.workflow && data.workflow.length > 0 && (
            <FadeIn delay={0.5}>
              <section className="py-12">
                <h2 className="text-2xl font-semibold text-text-primary text-center mb-8">
                  Step-by-Step Workflow
                </h2>
                <div className="max-w-3xl mx-auto space-y-4">
                  {data.workflow.map((step, index) => (
                    <div key={index} className="flex gap-4 items-start">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent-primary text-white flex items-center justify-center text-sm font-semibold">
                        {step.step}
                      </div>
                      <div className="flex-1 pb-4 border-b border-border-default last:border-0">
                        <h3 className="font-semibold text-text-primary mb-1">{step.title}</h3>
                        <p className="text-text-secondary text-sm">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </FadeIn>
          )}

          {/* Challenges (from type definition) */}
          {data.challenges && data.challenges.length > 0 && (
            <FadeIn delay={0.4}>
              <section className="py-12">
                <h2 className="text-2xl font-semibold text-text-primary text-center mb-8">
                  Key Challenges
                </h2>
                <div className="max-w-3xl mx-auto">
                  <ul className="space-y-3">
                    {data.challenges.map((challenge, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className="text-accent-primary mt-1">•</span>
                        <span className="text-text-secondary">{challenge}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </FadeIn>
          )}

          {/* FAQ */}
          {data.faq && data.faq.length > 0 && (
            <FAQSection faqs={data.faq} pageType="use-case" slug={data.slug} />
          )}

          {/* Final CTA */}
          <div className="py-8">
            <FadeIn>
              <CTASection
                title={`Ready to optimize your ${data.industry || 'images'}?`}
                description="Start enhancing images with AI today. No credit card required."
                ctaText="Try Free"
                ctaUrl="/"
                pageType="use-case"
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
