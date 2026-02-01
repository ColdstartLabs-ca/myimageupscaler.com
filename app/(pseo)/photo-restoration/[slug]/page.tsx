import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPhotoRestorationData, getAllPhotoRestorationSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generatePSEOSchema } from '@/lib/seo/schema-generator';
import { GenericPSEOPageTemplate } from '@/app/(pseo)/_components/pseo/templates/GenericPSEOPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';

interface IPhotoRestorationPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllPhotoRestorationSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IPhotoRestorationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPhotoRestorationData(slug);

  if (!page) return {};

  return generatePageMetadata(page, 'photo-restoration', 'en');
}

export default async function PhotoRestorationPage({ params }: IPhotoRestorationPageProps) {
  const { slug } = await params;
  const page = await getPhotoRestorationData(slug);

  if (!page) {
    notFound();
  }

  // Generate schema markup
  const schema = generatePSEOSchema(page, 'article');

  const path = `/photo-restoration/${slug}`;

  return (
    <>
      <SeoMetaTags path={path} locale="en" />
      <HreflangLinks path={path} category="photo-restoration" locale="en" />
      <SchemaMarkup schema={schema} />
      <GenericPSEOPageTemplate data={page} />
    </>
  );
}
