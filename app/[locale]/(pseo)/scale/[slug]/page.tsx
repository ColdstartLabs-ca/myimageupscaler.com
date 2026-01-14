import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getScaleData, getAllScaleSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { getRelatedPages } from '@/lib/seo/related-pages';
import { ScalePageTemplate } from '@/app/(pseo)/_components/pseo/templates/ScalePageTemplate';
import type { Locale } from '@/i18n/config';
import { SUPPORTED_LOCALES } from '@/i18n/config';

interface IScalePageProps {
  params: Promise<{ slug: string; locale: Locale }>;
}

export async function generateStaticParams() {
  const slugs = await getAllScaleSlugs();
  return SUPPORTED_LOCALES.flatMap(locale => slugs.map(slug => ({ slug, locale })));
}

export async function generateMetadata({ params }: IScalePageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const scale = await getScaleData(slug);

  if (!scale) return {};

  return generatePageMetadata(scale, 'scale', locale);
}

export default async function ScalePage({ params }: IScalePageProps) {
  const { slug, locale } = await params;
  const scale = await getScaleData(slug);

  if (!scale) {
    notFound();
  }

  // Fetch related pages for internal linking
  const relatedPages = await getRelatedPages('scale', slug, locale);

  return <ScalePageTemplate data={scale} locale={locale} relatedPages={relatedPages} />;
}
