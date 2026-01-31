import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPlatformData, getAllPlatformSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generatePSEOSchema } from '@/lib/seo/schema-generator';
import { PlatformPageTemplate } from '@/app/(pseo)/_components/pseo/templates/PlatformPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';

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

  const path = `/platforms/${slug}`;

  return (
    <>
      {/* SEO meta tags - canonical and og:locale */}
      <SeoMetaTags path={path} locale="en" />
      {/* Hreflang links - platforms is English-only, no locale variants */}
      <HreflangLinks path={path} category="platforms" locale="en" />
      <SchemaMarkup schema={schema} />
      <PlatformPageTemplate data={platform} locale="en" />
    </>
  );
}
