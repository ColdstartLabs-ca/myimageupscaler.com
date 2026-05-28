/**
 * Generic pSEO Page Template
 * Template for pages that don't have a specific template yet
 * Works with any pSEO page type
 */

import type {
  IBenefit,
  IFAQ,
  IFeature,
  IHowItWorksStep,
  IUseCase,
  PSEOPage,
} from '@/lib/seo/pseo-types';
import type { IRelatedPage } from '@/lib/seo/related-pages';
import type { PSEOCategory } from '@/lib/seo/url-utils';
import { clientEnv } from '@shared/config/env';
import React from 'react';
import { PSEOPageTracker } from '../analytics/PSEOPageTracker';
import { ScrollTracker } from '../analytics/ScrollTracker';
import { BenefitsSection } from '../sections/BenefitsSection';
import { CTASection } from '../sections/CTASection';
import { FAQSection } from '../sections/FAQSection';
import { FeaturesSection } from '../sections/FeaturesSection';
import { HeroSection } from '../sections/HeroSection';
import { HowItWorksSection } from '../sections/HowItWorksSection';
import { RelatedPagesSection } from '../sections/RelatedPagesSection';
import { UseCasesSection } from '../sections/UseCasesSection';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';

interface IBreadcrumbItem {
  label: string;
  href: string;
}

interface IGenericPSEOPageTemplateProps {
  data: PSEOPage;
  relatedPages?: IRelatedPage[];
  locale?: string;
}

const BASE_URL = clientEnv.BASE_URL;

interface ITechnicalComparisonRow {
  model: string;
  bestUseCase: string;
  speed: string;
  artifactRisk: string;
  availability: string;
}

interface IModelCategory {
  category: string;
  description?: string;
  models?: Array<{
    name?: string;
    year?: string;
    architecture?: string;
    focus?: string;
    strengths?: string[];
    weaknesses?: string[];
    bestUseCases?: string[];
    bestFor?: string[];
  }>;
}

function hasTechnicalComparisonRows(data: PSEOPage): data is PSEOPage & {
  technicalComparisonRows: ITechnicalComparisonRow[];
} {
  return (
    'technicalComparisonRows' in data &&
    Array.isArray(data.technicalComparisonRows) &&
    data.technicalComparisonRows.length > 0
  );
}

function hasModelCategories(data: PSEOPage): data is PSEOPage & {
  modelCategories: IModelCategory[];
} {
  return (
    'modelCategories' in data &&
    Array.isArray(data.modelCategories) &&
    data.modelCategories.length > 0
  );
}

function TechnicalComparisonSection({ data }: { data: PSEOPage }): React.ReactElement | null {
  const answer =
    'technicalAnswer' in data ? (data.technicalAnswer as string | undefined) : undefined;
  const ctaText =
    'technicalCtaText' in data ? (data.technicalCtaText as string | undefined) : undefined;
  const ctaUrl =
    'technicalCtaUrl' in data ? (data.technicalCtaUrl as string | undefined) : undefined;

  if (!answer && !hasTechnicalComparisonRows(data) && !hasModelCategories(data)) {
    return null;
  }

  return (
    <section className="py-12 space-y-8">
      {answer && (
        <div className="rounded-lg border border-accent/30 bg-accent/10 p-6">
          <h2 className="font-display text-2xl font-bold text-white mb-3">
            ESRGAN vs Real-ESRGAN vs SwinIR vs Diffusion Upscalers
          </h2>
          <p className="text-text-secondary leading-relaxed">{answer}</p>
        </div>
      )}

      {hasTechnicalComparisonRows(data) && (
        <div>
          <h2 className="font-display text-2xl font-bold text-white mb-4">
            Model Comparison at a Glance
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full border-collapse">
              <thead className="bg-surface-light">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-primary">Model</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-primary">
                    Best Use Case
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-primary">Speed</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-primary">
                    Artifact Risk
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-primary">
                    Availability
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.technicalComparisonRows.map(row => (
                  <tr key={row.model} className="border-t border-border">
                    <td className="px-4 py-3 text-sm font-medium text-white">{row.model}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.bestUseCase}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.speed}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.artifactRisk}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.availability}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasModelCategories(data) && (
        <div>
          <h2 className="font-display text-2xl font-bold text-white mb-4">Model Families</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {data.modelCategories.slice(0, 4).map(category => (
              <section key={category.category} className="rounded-lg border border-border p-5">
                <h3 className="font-display text-xl font-semibold text-white mb-2">
                  {category.category}
                </h3>
                {category.description && (
                  <p className="text-sm text-text-secondary mb-4">{category.description}</p>
                )}
                <ul className="space-y-3">
                  {(category.models || []).slice(0, 3).map(model => (
                    <li key={model.name} className="text-sm text-text-secondary">
                      <strong className="text-primary">{model.name}</strong>
                      {model.architecture && ` - ${model.architecture}`}
                      {model.focus && ` - ${model.focus}`}
                      {(model.bestUseCases || model.bestFor) && (
                        <span className="block mt-1">
                          Best for: {(model.bestUseCases || model.bestFor || []).join(', ')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}

      {ctaText && ctaUrl && (
        <div className="rounded-lg border border-border bg-surface-light p-6">
          <p className="text-text-secondary mb-4">
            If you do not want to choose a model manually, use the automatic image upscaler.
          </p>
          <a
            href={ctaUrl}
            className="inline-flex items-center justify-center rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
          >
            {ctaText}
          </a>
        </div>
      )}
    </section>
  );
}

export function GenericPSEOPageTemplate({
  data,
  relatedPages = [],
  locale: _locale = 'en',
}: IGenericPSEOPageTemplateProps): React.ReactElement {
  const hasFeatures =
    'features' in data && Array.isArray(data.features) && data.features.length > 0;
  const hasBenefits =
    'benefits' in data && Array.isArray(data.benefits) && data.benefits.length > 0;
  // Check if useCases are proper IUseCase objects (with title property), not just strings
  const hasUseCases =
    'useCases' in data &&
    Array.isArray(data.useCases) &&
    data.useCases.length > 0 &&
    typeof data.useCases[0] === 'object' &&
    data.useCases[0] !== null &&
    'title' in data.useCases[0];
  const hasHowItWorks =
    'howItWorks' in data && Array.isArray(data.howItWorks) && data.howItWorks.length > 0;
  const hasFAQ = 'faq' in data && Array.isArray(data.faq) && data.faq.length > 0;
  const hasCTA = 'ctaText' in data && 'ctaUrl' in data && 'description' in data;

  // Build breadcrumb items
  const category = data.category as PSEOCategory;
  const breadcrumbItems: IBreadcrumbItem[] = [
    { label: 'Home', href: BASE_URL },
    {
      label: category.charAt(0).toUpperCase() + category.slice(1),
      href: `${BASE_URL}/${category}`,
    },
    { label: data.title, href: `${BASE_URL}/${category}/${data.slug}` },
  ];

  return (
    <main className="min-h-screen bg-main relative overflow-x-clip">
      <PSEOPageTracker
        pageType={category as unknown as Parameters<typeof PSEOPageTracker>[0]['pageType']}
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
      />
      <ScrollTracker
        pageType={category as unknown as Parameters<typeof ScrollTracker>[0]['pageType']}
        slug={data.slug}
      />

      {/* Full Width Hero Area */}
      <div className="relative">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative z-30 pt-6">
          <BreadcrumbNav items={breadcrumbItems} />
        </div>

        <div className="relative h-full">
          <HeroSection
            h1={data.h1}
            intro={data.intro}
            ctaText={
              ('ctaText' in data ? (data.ctaText as string) : undefined) || 'Get Started Free'
            }
            ctaUrl={('ctaUrl' in data ? (data.ctaUrl as string) : undefined) || '/?signup=1'}
            pageType={category as unknown as Parameters<typeof HeroSection>[0]['pageType']}
            slug={data.slug}
          />
        </div>
      </div>

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        <article>
          <TechnicalComparisonSection data={data} />

          {hasFeatures && (
            <div className="py-12">
              <FeaturesSection features={(data as { features: IFeature[] }).features} />
            </div>
          )}

          {hasBenefits && (
            <div className="py-12">
              <BenefitsSection benefits={(data as { benefits: IBenefit[] }).benefits} />
            </div>
          )}

          {hasHowItWorks && (
            <div className="py-12">
              <HowItWorksSection steps={(data as { howItWorks: IHowItWorksStep[] }).howItWorks} />
            </div>
          )}

          {hasUseCases && (
            <div className="py-12">
              <UseCasesSection useCases={(data as { useCases: IUseCase[] }).useCases} />
            </div>
          )}

          {hasFAQ && (
            <div className="py-12">
              <FAQSection
                faqs={(data as { faq: IFAQ[] }).faq}
                pageType={category as unknown as Parameters<typeof FAQSection>[0]['pageType']}
                slug={data.slug}
              />
            </div>
          )}

          {relatedPages.length > 0 && (
            <div className="py-12">
              <RelatedPagesSection relatedPages={relatedPages} />
            </div>
          )}
        </article>
      </div>

      {hasCTA && (
        <CTASection
          title={('description' in data ? (data.description as string) : undefined) || data.h1}
          description={
            ('description' in data ? (data.description as string) : undefined) || data.intro
          }
          ctaText={('ctaText' in data ? (data.ctaText as string) : undefined) || 'Get Started Free'}
          ctaUrl={('ctaUrl' in data ? (data.ctaUrl as string) : undefined) || '/?signup=1'}
          pageType={category as unknown as Parameters<typeof CTASection>[0]['pageType']}
          slug={data.slug}
        />
      )}

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Footer spacing */}
        <div className="pb-16" />
      </div>
    </main>
  );
}
