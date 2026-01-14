import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFreeData, getAllFreeSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { FreePageTemplate } from '@/app/(pseo)/_components/pseo/templates/FreePageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import { clientEnv } from '@shared/config/env';

interface IFreePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllFreeSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IFreePageProps): Promise<Metadata> {
  const { slug } = await params;
  const freeTool = await getFreeData(slug);

  if (!freeTool) return {};

  return generatePageMetadata(freeTool, 'free', 'en');
}

export default async function FreePage({ params }: IFreePageProps) {
  const { slug } = await params;
  const freeTool = await getFreeData(slug);

  if (!freeTool) {
    notFound();
  }

  const canonicalUrl = `${clientEnv.BASE_URL}/free/${slug}`;

  // Build the graph array with WebPage and optional FAQPage
  const graphItems: object[] = [
    {
      '@type': 'WebPage',
      '@id': `${canonicalUrl}#webpage`,
      name: freeTool.metaTitle,
      description: freeTool.metaDescription,
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
  if (freeTool.faq && freeTool.faq.length > 0) {
    graphItems.push({
      '@type': 'FAQPage',
      mainEntity: freeTool.faq.map(item => ({
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
        name: 'Free Tools',
        item: `${clientEnv.BASE_URL}/free`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: freeTool.title,
        item: canonicalUrl,
      },
    ],
  });

  const schema = {
    '@context': 'https://schema.org',
    '@graph': graphItems,
  };

  const path = `/free/${slug}`;

  return (
    <>
      {/* SEO meta tags - canonical and og:locale */}
      <SeoMetaTags path={path} locale="en" />
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path={path} />
      <SchemaMarkup schema={schema} />
      <FreePageTemplate data={freeTool} />
    </>
  );
}
