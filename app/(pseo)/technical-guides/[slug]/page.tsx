import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTechnicalGuidesData, getAllTechnicalGuidesSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generatePSEOSchema } from '@/lib/seo/schema-generator';
import type { PSEOPage } from '@/lib/seo/pseo-types';
import { GenericPSEOPageTemplate } from '@/app/(pseo)/_components/pseo/templates/GenericPSEOPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';

// Force static rendering for Cloudflare Workers 10ms CPU limit
// Prevents SSR timeouts on Googlebot requests
export const dynamic = 'force-static';
export const revalidate = 86400; // 24 hours

interface ITechnicalGuidesPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllTechnicalGuidesSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: ITechnicalGuidesPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getTechnicalGuidesData(slug);

  if (!page) return {};

  return generatePageMetadata(page as unknown as PSEOPage, 'technical-guides', 'en');
}

export default async function TechnicalGuidesPage({ params }: ITechnicalGuidesPageProps) {
  const { slug } = await params;
  const page = await getTechnicalGuidesData(slug);

  if (!page) {
    notFound();
  }

  // Generate schema markup
  const schema = generatePSEOSchema(
    page as unknown as Parameters<typeof generatePSEOSchema>[0],
    'article'
  );

  const path = `/technical-guides/${slug}`;

  return (
    <>
      <SeoMetaTags path={path} locale="en" />
      <HreflangLinks path={path} category="technical-guides" locale="en" />
      <SchemaMarkup schema={schema} />
      <GenericPSEOPageTemplate data={page as unknown as PSEOPage} />
    </>
  );
}
