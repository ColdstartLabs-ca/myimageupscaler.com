import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getGuideData, getAllGuideSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { GuidePageTemplate } from '@/app/(pseo)/_components/pseo/templates/GuidePageTemplate';
import type { Locale } from '@/i18n/config';
import { SUPPORTED_LOCALES } from '@/i18n/config';

interface IGuidePageProps {
  params: Promise<{ slug: string; locale: Locale }>;
}

export async function generateStaticParams() {
  const slugs = await getAllGuideSlugs();
  return SUPPORTED_LOCALES.flatMap(locale => slugs.map(slug => ({ slug, locale })));
}

export async function generateMetadata({ params }: IGuidePageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const guide = await getGuideData(slug);

  if (!guide) return {};

  return generatePageMetadata(guide, 'guides', locale);
}

export default async function GuidePage({ params }: IGuidePageProps) {
  const { slug, locale } = await params;
  const guide = await getGuideData(slug);

  if (!guide) {
    notFound();
  }

  return <GuidePageTemplate data={guide} locale={locale} />;
}
