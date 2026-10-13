import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPlatformData, getAllPlatformSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generatePSEOSchema } from '@/lib/seo/schema-generator';
import { PlatformPageTemplate } from '@/app/(pseo)/_components/pseo/templates/PlatformPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';

// Force static rendering for Cloudflare Workers 10ms CPU limit
// Prevents SSR timeouts on Googlebot requests
export const dynamic = 'force-static';
export const revalidate = 86400; // 24 hours

interface IPlatformPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllPlatformSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IPlatformPageProps): Promise<Metadata> {
  const { slug } = await params;
  const platform = await getPlatformData(slug);

  if (!platform) return {};

  return generatePageMetadata(platform, 'platforms', 'en');
}

export default async function PlatformPage({ params }: IPlatformPageProps) {
  const { slug } = await params;
  const platform = await getPlatformData(slug);

  if (!platform) {
    notFound();
  }

  // Generate rich schema markup with FAQPage and BreadcrumbList
  const schema = generatePSEOSchema(platform, 'platforms', 'en');

  return (
    <>
      <SchemaMarkup schema={schema} />
      <PlatformPageTemplate data={platform} locale="en" />
    </>
  );
}
