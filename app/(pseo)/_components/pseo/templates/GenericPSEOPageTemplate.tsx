/**
 * Generic pSEO Page Template
 * Template for pages that don't have a specific template yet
 * Works with any pSEO page type
 */

import type {
  PSEOPage,
  IFeature,
  IBenefit,
  IHowItWorksStep,
  IUseCase,
  IFAQ,
} from '@/lib/seo/pseo-types';
import type { PSEOCategory } from '@/lib/seo/url-utils';
import React from 'react';
import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';
import { BreadcrumbNav } from '../ui/BreadcrumbNav';
import { FAQSection } from '../sections/FAQSection';
import { CTASection } from '../sections/CTASection';
import { FeaturesSection } from '../sections/FeaturesSection';
import { BenefitsSection } from '../sections/BenefitsSection';
import { UseCasesSection } from '../sections/UseCasesSection';
import { HowItWorksSection } from '../sections/HowItWorksSection';
import { clientEnv } from '@shared/config/env';
import { RelatedPagesSection } from '../sections/RelatedPagesSection';
import type { IRelatedPage } from '@/lib/seo/related-pages';

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
    <main className="min-h-screen">
      <BreadcrumbNav items={breadcrumbItems} />

      <section className="py-12 md:py-20">
        <div className="container mx-auto px-4">
          <FadeIn>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-center">
              {data.h1}
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 text-center max-w-3xl mx-auto">
              {data.intro}
            </p>
          </FadeIn>
        </div>
      </section>

      {hasFeatures && <FeaturesSection features={(data as { features: IFeature[] }).features} />}

      {hasBenefits && <BenefitsSection benefits={(data as { benefits: IBenefit[] }).benefits} />}

      {hasHowItWorks && (
        <HowItWorksSection steps={(data as { howItWorks: IHowItWorksStep[] }).howItWorks} />
      )}

      {hasUseCases && <UseCasesSection useCases={(data as { useCases: IUseCase[] }).useCases} />}

      {hasFAQ && <FAQSection faqs={(data as { faq: IFAQ[] }).faq} />}

      {hasCTA && (
        <CTASection
          title={(data as { description: string }).description}
          description={(data as { description: string }).description}
          ctaText={(data as { ctaText: string }).ctaText}
          ctaUrl={(data as { ctaUrl: string }).ctaUrl}
        />
      )}

      {relatedPages.length > 0 && <RelatedPagesSection relatedPages={relatedPages} />}
    </main>
  );
}
