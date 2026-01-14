import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatData, getAllFormatSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { FormatPageTemplate } from '@/app/(pseo)/_components/pseo/templates/FormatPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import { clientEnv } from '@shared/config/env';

interface IFormatPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllFormatSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IFormatPageProps): Promise<Metadata> {
  const { slug } = await params;
  const format = await getFormatData(slug);

  if (!format) return {};

  return generatePageMetadata(format, 'formats', 'en');
}

export default async function FormatPage({ params }: IFormatPageProps) {
  const { slug } = await params;
  const format = await getFormatData(slug);

  if (!format) {
    notFound();
  }

  const canonicalUrl = `${clientEnv.BASE_URL}/formats/${slug}`;

  // Build the graph array with WebPage and optional FAQPage
  const graphItems: object[] = [
    {
      '@type': 'WebPage',
      '@id': `${canonicalUrl}#webpage`,
      name: format.metaTitle,
      description: format.metaDescription,
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
  if (format.faq && format.faq.length > 0) {
    graphItems.push({
      '@type': 'FAQPage',
      mainEntity: format.faq.map(item => ({
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
        name: 'Formats',
        item: `${clientEnv.BASE_URL}/formats`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: format.formatName || format.title,
        item: canonicalUrl,
      },
    ],
  });

  const schema = {
    '@context': 'https://schema.org',
    '@graph': graphItems,
  };

  const path = `/formats/${slug}`;

  return (
    <>
      {/* SEO meta tags - canonical and og:locale */}
      <SeoMetaTags path={path} locale="en" />
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path={path} />
      <SchemaMarkup schema={schema} />
      <FormatPageTemplate data={format} locale="en" />
    </>
  );
}
