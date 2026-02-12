import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPlatformFormatData, getAllPlatformFormatSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generatePSEOSchema } from '@/lib/seo/schema-generator';
import { getRelatedPages } from '@/lib/seo/related-pages';
import { PlatformFormatPageTemplate } from '@/app/(pseo)/_components/pseo/templates/PlatformFormatPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';

// Force static rendering for Cloudflare Workers 10ms CPU limit
// Prevents SSR timeouts on Googlebot requests
export const dynamic = 'force-static';
export const revalidate = 86400; // 24 hours

interface IPlatformFormatPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllPlatformFormatSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IPlatformFormatPageProps): Promise<Metadata> {
  const { slug } = await params;
  const platformFormat = await getPlatformFormatData(slug);

  if (!platformFormat) return {};

  return generatePageMetadata(platformFormat, 'platform-format', 'en');
}

export default async function PlatformFormatPage({ params }: IPlatformFormatPageProps) {
  const { slug } = await params;
  const platformFormat = await getPlatformFormatData(slug);

  if (!platformFormat) {
    notFound();
  }

  // Get related pages for internal linking
  const relatedPages = await getRelatedPages('platform-format', slug, 'en');

  // Generate rich schema markup with FAQPage and BreadcrumbList
  const schema = generatePSEOSchema(platformFormat, 'platform-format', 'en');

  const path = `/platform-format/${slug}`;

  return (
    <>
      {/* SEO meta tags - canonical and og:locale */}
      <SeoMetaTags path={path} locale="en" />
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path={path} category="platform-format" locale="en" />
      <SchemaMarkup schema={schema} />
      <PlatformFormatPageTemplate data={platformFormat} locale="en" relatedPages={relatedPages} />
    </>
  );
}
