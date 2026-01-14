import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDeviceUseData, getAllDeviceUseSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generatePSEOSchema } from '@/lib/seo/schema-generator';
import { DeviceUsePageTemplate } from '@/app/(pseo)/_components/pseo/templates/DeviceUsePageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';

interface IDeviceUsePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllDeviceUseSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IDeviceUsePageProps): Promise<Metadata> {
  const { slug } = await params;
  const deviceUse = await getDeviceUseData(slug);

  if (!deviceUse) return {};

  return generatePageMetadata(deviceUse, 'device-use', 'en');
}

export default async function DeviceUsePage({ params }: IDeviceUsePageProps) {
  const { slug } = await params;
  const deviceUse = await getDeviceUseData(slug);

  if (!deviceUse) {
    notFound();
  }

  // Generate rich schema markup with FAQPage and BreadcrumbList
  const schema = generatePSEOSchema(deviceUse, 'device-use', 'en');

  const path = `/device-use/${slug}`;

  return (
    <>
      {/* SEO meta tags - canonical and og:locale */}
      <SeoMetaTags path={path} locale="en" />
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path={path} />
      <SchemaMarkup schema={schema} />
      <DeviceUsePageTemplate data={deviceUse} locale="en" />
    </>
  );
}
