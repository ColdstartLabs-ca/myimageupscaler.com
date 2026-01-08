/**
 * Schema Markup Generator Module
 * Based on PRD-PSEO-04 Section 2.1: Schema Generator Module
 * Generates JSON-LD structured data for different page types
 * Phase 5: Added inLanguage property for multi-language SEO
 */

import type {
  IToolPage,
  IComparisonPage,
  IGuidePage,
  IUseCasePage,
  IAlternativePage,
  IProduct,
} from './pseo-types';
import { clientEnv } from '@shared/config/env';
import type { Locale } from '../../i18n/config';

const BASE_URL = clientEnv.BASE_URL;
const APP_NAME = clientEnv.APP_NAME;
const TWITTER_HANDLE = clientEnv.TWITTER_HANDLE;

/**
 * Get ISO 639-1 language code from locale
 * Maps our locale codes to Schema.org inLanguage format
 *
 * @param locale - The locale code
 * @returns ISO 639-1 language code
 *
 * @example
 * ```ts
 * getLanguageCode('en'); // 'en'
 * getLanguageCode('es'); // 'es'
 * ```
 */
function getLanguageCode(locale: Locale): string {
  const languageMap: Record<Locale, string> = {
    en: 'en',
    es: 'es',
  };

  return languageMap[locale] || 'en';
}

const ORGANIZATION_SCHEMA = {
  '@type': 'Organization',
  name: APP_NAME,
  url: BASE_URL,
  logo: {
    '@type': 'ImageObject',
    url: `${BASE_URL}/logo/vertical-logo-compact.png`,
    width: 201,
    height: 133,
  },
  sameAs: [
    `https://twitter.com/${TWITTER_HANDLE}`,
    `https://linkedin.com/company/${TWITTER_HANDLE.toLowerCase()}`,
  ],
};

/**
 * Generate Review schema for comparison pages
 * Creates Review schemas for each product being compared
 */
export function generateReviewSchemas(products: IProduct[]): object[] {
  return products.map((product, index) => ({
    '@type': 'Review',
    '@id': `${BASE_URL}/compare#review-${index + 1}`,
    itemReviewed: {
      '@type': 'SoftwareApplication',
      name: product.name,
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Web Browser',
      ...(product.description && { description: product.description }),
    },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: product.rating?.toString() || '4.8',
      bestRating: '5',
      worstRating: '1',
    },
    author: {
      '@type': 'Organization',
      name: `${APP_NAME} Team`,
      url: BASE_URL,
    },
    publisher: ORGANIZATION_SCHEMA,
    datePublished: new Date().toISOString().split('T')[0],
    reviewBody: `${product.name} is ${
      product.isRecommended ? 'recommended' : 'an alternative option'
    } for AI image upscaling. ${
      product.pros && product.pros.length > 0
        ? `Key strengths include: ${product.pros.slice(0, 3).join(', ')}.`
        : ''
    }${
      product.cons && product.cons.length > 0
        ? ` Considerations: ${product.cons.slice(0, 2).join(', ')}.`
        : ''
    }`,
  }));
}

/**
 * Generate schema for Tool pages
 * Combines SoftwareApplication + FAQPage + BreadcrumbList
 * Phase 5: Added inLanguage property
 *
 * @param tool - The tool page data
 * @param locale - The locale for this page instance (default: 'en')
 */
export function generateToolSchema(tool: IToolPage, locale: Locale = 'en'): object {
  const canonicalUrl = `${BASE_URL}/tools/${tool.slug}`;
  const language = getLanguageCode(locale);

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
        inLanguage: language,
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
 * Combines Article + Review + FAQPage + BreadcrumbList
 */
export function generateComparisonSchema(comparison: IComparisonPage): object {
  const canonicalUrl = `${BASE_URL}/compare/${comparison.slug}`;

  const graphItems = [
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
    ...(comparison.products && comparison.products.length > 0
      ? generateReviewSchemas(comparison.products)
      : []),
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
  ];

  return {
    '@context': 'https://schema.org',
    '@graph': graphItems,
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

/**
 * Generate schema for Homepage
 * Combines WebApplication with AggregateRating + FAQPage
 */
export function generateHomepageSchema(): Record<string, unknown> {
  const canonicalUrl = BASE_URL;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: APP_NAME,
        description:
          'Transform your images with cutting-edge AI. Upscale, enhance, and restore details with professional quality.',
        url: canonicalUrl,
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web Browser',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          description: 'Free tier with 10 credits',
        },
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.8',
          reviewCount: '1250',
          bestRating: '5',
          worstRating: '1',
        },
        author: ORGANIZATION_SCHEMA,
        publisher: ORGANIZATION_SCHEMA,
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'How do I upscale an image without losing quality?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Our AI-powered upscaler uses advanced neural networks to intelligently enlarge images while preserving details, edges, and text clarity. Unlike traditional bicubic upscaling that creates blurry pixels, our AI reconstructs realistic details based on millions of high-quality image pairs, resulting in sharp, professional-looking 4K upscales.',
            },
          },
          {
            '@type': 'Question',
            name: 'What is the best AI image upscaler?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'MyImageUpscaler combines web-based convenience, superior text preservation, and affordable pricing to deliver professional-quality results. Unlike desktop software that costs $99+, our online solution delivers comparable quality with no installation, free credits to start, and unique algorithms that keep text sharp—making it the best choice for most users.',
            },
          },
          {
            '@type': 'Question',
            name: 'How to upscale images for free?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'You can upscale images for free by signing up for an account, which gives you 10 free credits. Each credit processes one image at 2x upscaling. Simply upload your image, select your enhancement level, and download your upscaled result. No credit card required for the free tier.',
            },
          },
          {
            '@type': 'Question',
            name: 'Is AI upscaling better than traditional upscaling?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes, AI upscaling is significantly better than traditional methods. Traditional upscaling uses interpolation to estimate new pixels, resulting in blurry images. AI upscaling uses deep learning trained on millions of images to intelligently reconstruct realistic details, edges, and textures, producing sharp, professional results that are nearly indistinguishable from native high-resolution images.',
            },
          },
        ],
      },
    ],
  };
}

/**
 * Generate schema for Pricing page
 * Combines Product with AggregateOffer + FAQPage + BreadcrumbList
 */
export function generatePricingSchema(): object {
  const canonicalUrl = `${BASE_URL}/pricing`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        '@id': `${canonicalUrl}#product`,
        name: `${APP_NAME} Subscription Plans`,
        description:
          'Choose the subscription plan that fits your needs. Get monthly credits with automatic rollover for AI image upscaling and enhancement.',
        category: 'Software',
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web Browser',
        url: canonicalUrl,
        brand: ORGANIZATION_SCHEMA,
        offers: {
          '@type': 'AggregateOffer',
          name: 'Subscription Plans',
          description: 'Multiple subscription tiers with different credit allowances and features',
          priceCurrency: 'USD',
          lowPrice: '9.00',
          highPrice: '149.00',
          offerCount: '4',
          offers: [
            {
              '@type': 'Offer',
              name: 'Starter Plan',
              description: 'Perfect for getting started with 100 credits per month',
              price: '9.00',
              priceCurrency: 'USD',
              priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0],
              availability: 'https://schema.org/InStock',
              seller: ORGANIZATION_SCHEMA,
            },
            {
              '@type': 'Offer',
              name: 'Hobby Plan',
              description: 'For personal projects with 200 credits per month',
              price: '19.00',
              priceCurrency: 'USD',
              priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0],
              availability: 'https://schema.org/InStock',
              seller: ORGANIZATION_SCHEMA,
            },
            {
              '@type': 'Offer',
              name: 'Pro Plan',
              description: 'For professionals with 1000 credits per month',
              price: '49.00',
              priceCurrency: 'USD',
              priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0],
              availability: 'https://schema.org/InStock',
              seller: ORGANIZATION_SCHEMA,
              recommended: true,
            },
            {
              '@type': 'Offer',
              name: 'Business Plan',
              description: 'For teams and agencies with 5000 credits per month',
              price: '149.00',
              priceCurrency: 'USD',
              priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0],
              availability: 'https://schema.org/InStock',
              seller: ORGANIZATION_SCHEMA,
            },
          ],
        },
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.8',
          ratingCount: '1250',
          bestRating: '5',
          worstRating: '1',
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What are credits used for?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Credits are used for image processing actions. Each image processed consumes a certain number of credits based on the upscaling factor and features used.',
            },
          },
          {
            '@type': 'Question',
            name: 'Do credits expire?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Subscription credits roll over month-to-month up to your plan's maximum limit as long as your subscription is active.",
            },
          },
          {
            '@type': 'Question',
            name: 'Can I cancel my subscription anytime?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Yes! You can cancel your subscription at any time. You'll continue to have access until the end of your billing period, and any remaining credits will stay in your account.",
            },
          },
          {
            '@type': 'Question',
            name: 'Is there a free plan?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes! Free users get initial credits to try the service. However, batch processing and advanced features require a paid subscription. Free users can process one image at a time.',
            },
          },
        ],
      },
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
            name: 'Pricing',
            item: canonicalUrl,
          },
        ],
      },
    ],
  };
}
