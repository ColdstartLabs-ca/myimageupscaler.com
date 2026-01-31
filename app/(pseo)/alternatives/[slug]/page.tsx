import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAlternativeData, getAllAlternativeSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { getRelatedPages } from '@/lib/seo/related-pages';
import { generateAlternativeSchema } from '@/lib/seo/schema-generator';
import { AlternativePageTemplate } from '@/app/(pseo)/_components/pseo/templates/AlternativePageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';

interface IAlternativePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllAlternativeSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IAlternativePageProps): Promise<Metadata> {
  const { slug } = await params;
  const alternative = await getAlternativeData(slug);

  if (!alternative) return {};

  return generatePageMetadata(alternative, 'alternatives', 'en');
}

export default async function AlternativePage({ params }: IAlternativePageProps) {
  const { slug } = await params;
  const alternative = await getAlternativeData(slug);

  if (!alternative) {
    notFound();
  }

  // Get related pages for internal linking
  const relatedPages = await getRelatedPages('alternatives', slug, 'en');

  // Generate rich schema markup with FAQPage, ItemList, and BreadcrumbList
  const schema = generateAlternativeSchema(alternative);

  const path = `/alternatives/${slug}`;

  return (
    <>
      {/* SEO meta tags - canonical and og:locale */}
      <SeoMetaTags path={path} locale="en" />
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path={path} category="alternatives" locale="en" />
      <SchemaMarkup schema={schema} />
      <AlternativePageTemplate data={alternative} locale="en" relatedPages={relatedPages} />
    </>
  );
}
