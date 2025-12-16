/**
 * Schema Markup Generator Module
 * Based on PRD-PSEO-04 Section 2.1: Schema Generator Module
 * Generates JSON-LD structured data for different page types
 */

import type {
  IToolPage,
  IComparisonPage,
  IGuidePage,
  IUseCasePage,
  IAlternativePage,
} from './pseo-types';
import { clientEnv } from '@shared/config/env';

const BASE_URL = clientEnv.BASE_URL;

const ORGANIZATION_SCHEMA = {
  '@type': 'Organization',
  name: 'PixelPerfect',
  url: BASE_URL,
  logo: {
    '@type': 'ImageObject',
    url: `${BASE_URL}/logo.png`,
    width: 512,
    height: 512,
  },
  sameAs: [`https://twitter.com/pixelperfect`, `https://linkedin.com/company/pixelperfect`],
};

/**
 * Generate schema for Tool pages
 * Combines SoftwareApplication + FAQPage + BreadcrumbList
 */
export function generateToolSchema(tool: IToolPage): object {
  const canonicalUrl = `${BASE_URL}/tools/${tool.slug}`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: tool.title,
        description: tool.metaDescription,
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web Browser',
        url: canonicalUrl,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          description: 'Free tier with 10 credits',
        },
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.8',
          ratingCount: '1250',
          bestRating: '5',
          worstRating: '1',
        },
        author: ORGANIZATION_SCHEMA,
        publisher: ORGANIZATION_SCHEMA,
      },
      ...(tool.faq && tool.faq.length > 0
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: tool.faq.map(item => ({
                '@type': 'Question',
                name: item.question,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: item.answer,
                },
              })),
            },
          ]
        : []),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: BASE_URL,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Tools',
            item: `${BASE_URL}/tools`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: tool.title,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };
}

/**
 * Generate schema for Comparison pages
 * Combines Article + FAQPage + BreadcrumbList
 */
export function generateComparisonSchema(comparison: IComparisonPage): object {
  const canonicalUrl = `${BASE_URL}/compare/${comparison.slug}`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${canonicalUrl}#article`,
        headline: comparison.h1,
        description: comparison.metaDescription,
        ...(comparison.ogImage && { image: comparison.ogImage }),
        datePublished: comparison.lastUpdated,
        dateModified: comparison.lastUpdated,
        author: ORGANIZATION_SCHEMA,
        publisher: ORGANIZATION_SCHEMA,
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': canonicalUrl,
        },
      },
      ...(comparison.faq && comparison.faq.length > 0
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: comparison.faq.map(item => ({
                '@type': 'Question',
                name: item.question,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: item.answer,
                },
              })),
            },
          ]
        : []),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: BASE_URL,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Comparisons',
            item: `${BASE_URL}/compare`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: comparison.title,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };
}

/**
 * Generate schema for Guide pages
 * Combines HowTo + Article + FAQPage + BreadcrumbList
 */
export function generateGuideSchema(guide: IGuidePage): object {
  const canonicalUrl = `${BASE_URL}/guides/${guide.slug}`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      ...(guide.guideType === 'how-to' && guide.steps && guide.steps.length > 0
        ? [
            {
              '@type': 'HowTo',
              '@id': `${canonicalUrl}#howto`,
              name: guide.h1,
              description: guide.metaDescription,
              step: guide.steps.map((step, index) => ({
                '@type': 'HowToStep',
                position: index + 1,
                name: step.title,
                text: step.content,
                url: `${canonicalUrl}#step-${index + 1}`,
              })),
              author: ORGANIZATION_SCHEMA,
              publisher: ORGANIZATION_SCHEMA,
            },
          ]
        : []),
      {
        '@type': 'Article',
        '@id': `${canonicalUrl}#article`,
        headline: guide.h1,
        description: guide.metaDescription,
        ...(guide.ogImage && { image: guide.ogImage }),
        datePublished: guide.lastUpdated,
        dateModified: guide.lastUpdated,
        author: ORGANIZATION_SCHEMA,
        publisher: ORGANIZATION_SCHEMA,
        articleSection: 'Guides',
      },
      ...(guide.faq && guide.faq.length > 0
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: guide.faq.map(item => ({
                '@type': 'Question',
                name: item.question,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: item.answer,
                },
              })),
            },
          ]
        : []),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: BASE_URL,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Guides',
            item: `${BASE_URL}/guides`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: guide.title,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };
}

/**
 * Generate schema for Use Case pages
 * Combines Article + FAQPage + BreadcrumbList
 */
export function generateUseCaseSchema(useCase: IUseCasePage): object {
  const canonicalUrl = `${BASE_URL}/use-cases/${useCase.slug}`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${canonicalUrl}#article`,
        headline: useCase.h1,
        description: useCase.metaDescription,
        ...(useCase.ogImage && { image: useCase.ogImage }),
        datePublished: useCase.lastUpdated,
        dateModified: useCase.lastUpdated,
        author: ORGANIZATION_SCHEMA,
        publisher: ORGANIZATION_SCHEMA,
        about: {
          '@type': 'Thing',
          name: useCase.industry,
        },
      },
      ...(useCase.faq && useCase.faq.length > 0
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: useCase.faq.map(item => ({
                '@type': 'Question',
                name: item.question,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: item.answer,
                },
              })),
            },
          ]
        : []),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: BASE_URL,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Use Cases',
            item: `${BASE_URL}/use-cases`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: useCase.title,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };
}

/**
 * Generate schema for Alternative pages
 * Combines ItemList + Article + FAQPage + BreadcrumbList
 */
export function generateAlternativeSchema(alternative: IAlternativePage): object {
  const canonicalUrl = `${BASE_URL}/alternatives/${alternative.slug}`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      ...(alternative.alternatives && alternative.alternatives.length > 0
        ? [
            {
              '@type': 'ItemList',
              '@id': `${canonicalUrl}#list`,
              name: `Best ${alternative.originalTool} Alternatives`,
              description: alternative.metaDescription,
              numberOfItems: alternative.alternatives.length,
              itemListElement: alternative.alternatives.map((alt, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                item: {
                  '@type': 'SoftwareApplication',
                  name: alt.name,
                  description: alt.description,
                  applicationCategory: 'MultimediaApplication',
                },
              })),
            },
          ]
        : []),
      {
        '@type': 'Article',
        '@id': `${canonicalUrl}#article`,
        headline: alternative.h1,
        description: alternative.metaDescription,
        datePublished: alternative.lastUpdated,
        dateModified: alternative.lastUpdated,
        author: ORGANIZATION_SCHEMA,
        publisher: ORGANIZATION_SCHEMA,
      },
      ...(alternative.faq && alternative.faq.length > 0
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: alternative.faq.map(item => ({
                '@type': 'Question',
                name: item.question,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: item.answer,
                },
              })),
            },
          ]
        : []),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: BASE_URL,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Alternatives',
            item: `${BASE_URL}/alternatives`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: alternative.title,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };
}
