import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getScaleData, getAllScaleSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { getRelatedPages } from '@/lib/seo/related-pages';
import { ScalePageTemplate } from '@/app/(pseo)/_components/pseo/templates/ScalePageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import { clientEnv } from '@shared/config/env';

// Force static rendering for Cloudflare Workers 10ms CPU limit
// Prevents SSR timeouts on Googlebot requests
export const dynamic = 'force-static';
export const revalidate = 86400; // 24 hours

interface IScalePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllScaleSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IScalePageProps): Promise<Metadata> {
  const { slug } = await params;
  const scale = await getScaleData(slug);

  if (!scale) return {};

  return generatePageMetadata(scale, 'scale', 'en');
}

export default async function ScalePage({ params }: IScalePageProps) {
  const { slug } = await params;
  const scale = await getScaleData(slug);

  if (!scale) {
    notFound();
  }

  const canonicalUrl = `${clientEnv.BASE_URL}/scale/${slug}`;

  // Get related pages for internal linking
  const relatedPages = await getRelatedPages('scale', slug, 'en');

  // Build the graph array with WebPage and optional FAQPage
  const graphItems: object[] = [
    {
      '@type': 'WebPage',
      '@id': `${canonicalUrl}#webpage`,
      name: scale.metaTitle,
      description: scale.metaDescription,
      url: canonicalUrl,
      inLanguage: 'en',
      isPartOf: {
        '@type': 'WebSite',
        name: clientEnv.APP_NAME,
        url: clientEnv.BASE_URL,
      },
    },
  ];

  // Add FAQPage schema if FAQ data exists
  if (scale.faq && scale.faq.length > 0) {
    graphItems.push({
      '@type': 'FAQPage',
      mainEntity: scale.faq.map(item => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    });
  }

  // Add BreadcrumbList schema
  graphItems.push({
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: clientEnv.BASE_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Scale',
        item: `${clientEnv.BASE_URL}/scale`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: scale.resolution || scale.title,
        item: canonicalUrl,
      },
    ],
  });

  const schema = {
    '@context': 'https://schema.org',
    '@graph': graphItems,
  };

  const path = `/scale/${slug}`;

  return (
    <>
      {/* SEO meta tags - canonical and og:locale */}
      <SeoMetaTags path={path} locale="en" />
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path={path} category="scale" locale="en" />
      <SchemaMarkup schema={schema} />
      <ScalePageTemplate data={scale} relatedPages={relatedPages} />
    </>
  );
}
