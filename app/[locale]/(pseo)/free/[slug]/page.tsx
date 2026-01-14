import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFreeData, getAllFreeSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { FreePageTemplate } from '@/app/(pseo)/_components/pseo/templates/FreePageTemplate';
import type { Locale } from '@/i18n/config';
import { SUPPORTED_LOCALES } from '@/i18n/config';

interface IFreePageProps {
  params: Promise<{ slug: string; locale: Locale }>;
}

export async function generateStaticParams() {
  const slugs = await getAllFreeSlugs();
  return SUPPORTED_LOCALES.flatMap(locale => slugs.map(slug => ({ slug, locale })));
}

export async function generateMetadata({ params }: IFreePageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const freeTool = await getFreeData(slug);

  if (!freeTool) return {};

  return generatePageMetadata(freeTool, 'free', locale);
}

export default async function FreePage({ params }: IFreePageProps) {
  const { slug, locale } = await params;
  const freeTool = await getFreeData(slug);

  if (!freeTool) {
    notFound();
  }

  return <FreePageTemplate data={freeTool} locale={locale} />;
}
