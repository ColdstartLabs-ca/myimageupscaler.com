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
    <main className="min-h-screen bg-main relative overflow-x-hidden">
      <PSEOPageTracker
        pageType={category as any}
        slug={data.slug}
        primaryKeyword={data.primaryKeyword}
      />
      <ScrollTracker pageType={category as any} slug={data.slug} />

      {/* Full Width Hero Area */}
      <div className="relative">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative z-30 pt-6">
          <BreadcrumbNav items={breadcrumbItems} />
        </div>

        <div className="relative h-full">
          <HeroSection
            h1={data.h1}
            intro={data.intro}
            ctaText={(data as any).ctaText || "Get Started Free"}
            ctaUrl={(data as any).ctaUrl || "/?signup=1"}
            pageType={category as any}
            slug={data.slug}
          />
        </div>
      </div>

      <div className="relative max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        <article>
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
              <FAQSection faqs={(data as { faq: IFAQ[] }).faq} pageType={category as any} slug={data.slug} />
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
          title={(data as any).description}
          description={(data as any).description}
          ctaText={(data as any).ctaText}
          ctaUrl={(data as any).ctaUrl}
          pageType={category as any}
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
