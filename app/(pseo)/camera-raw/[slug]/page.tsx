import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCameraRawData, getAllCameraRawSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generatePSEOSchema } from '@/lib/seo/schema-generator';
import { GenericPSEOPageTemplate } from '@/app/(pseo)/_components/pseo/templates/GenericPSEOPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';

// Force static rendering for Cloudflare Workers 10ms CPU limit
// Prevents SSR timeouts on Googlebot requests
export const dynamic = 'force-static';
export const revalidate = 86400; // 24 hours

interface ICameraRawPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllCameraRawSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: ICameraRawPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getCameraRawData(slug);

  if (!page) return {};

  return generatePageMetadata(page, 'camera-raw', 'en');
}

export default async function CameraRawPage({ params }: ICameraRawPageProps) {
  const { slug } = await params;
  const page = await getCameraRawData(slug);

  if (!page) {
    notFound();
  }

  // Generate schema markup
  const schema = generatePSEOSchema(page, 'article');

  const path = `/camera-raw/${slug}`;

  return (
    <>
      <SeoMetaTags path={path} locale="en" />
      <HreflangLinks path={path} category="camera-raw" locale="en" />
      <SchemaMarkup schema={schema} />
      <GenericPSEOPageTemplate data={page} />
    </>
  );
}
