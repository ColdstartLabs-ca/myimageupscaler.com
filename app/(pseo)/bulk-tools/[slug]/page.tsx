import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getBulkToolsData, getAllBulkToolsSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generatePSEOSchema } from '@/lib/seo/schema-generator';
import { GenericPSEOPageTemplate } from '@/app/(pseo)/_components/pseo/templates/GenericPSEOPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';

interface IBulkToolsPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllBulkToolsSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IBulkToolsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getBulkToolsData(slug);

  if (!page) return {};

  return generatePageMetadata(page, 'bulk-tools', 'en');
}

export default async function BulkToolsPage({ params }: IBulkToolsPageProps) {
  const { slug } = await params;
  const page = await getBulkToolsData(slug);

  if (!page) {
    notFound();
  }

  // Generate schema markup
  const schema = generatePSEOSchema(page, 'article');

  const path = `/bulk-tools/${slug}`;

  return (
    <>
      <SeoMetaTags path={path} locale="en" />
      <HreflangLinks path={path} category="bulk-tools" locale="en" />
      <SchemaMarkup schema={schema} />
      <GenericPSEOPageTemplate data={page} />
    </>
  );
}
