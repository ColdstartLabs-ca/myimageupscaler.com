import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDeviceOptimizationData, getAllDeviceOptimizationSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generatePSEOSchema } from '@/lib/seo/schema-generator';
import { GenericPSEOPageTemplate } from '@/app/(pseo)/_components/pseo/templates/GenericPSEOPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';

interface IDeviceOptimizationPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllDeviceOptimizationSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({
  params,
}: IDeviceOptimizationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getDeviceOptimizationData(slug);

  if (!page) return {};

  return generatePageMetadata(page, 'device-optimization', 'en');
}

export default async function DeviceOptimizationPage({ params }: IDeviceOptimizationPageProps) {
  const { slug } = await params;
  const page = await getDeviceOptimizationData(slug);

  if (!page) {
    notFound();
  }

  // Generate schema markup
  const schema = generatePSEOSchema(page, 'article');

  const path = `/device-optimization/${slug}`;

  return (
    <>
      <SeoMetaTags path={path} locale="en" />
      <HreflangLinks path={path} />
      <SchemaMarkup schema={schema} />
      <GenericPSEOPageTemplate data={page} />
    </>
  );
}
