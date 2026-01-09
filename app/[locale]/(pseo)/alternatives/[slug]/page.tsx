import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAlternativeDataWithLocale, getAllAlternativeSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { LocalizedPageTemplate } from '@/app/[locale]/(pseo)/_components/pseo/templates/LocalizedPageTemplate';
import type { Locale } from '@/i18n/config';

interface IAlternativePageProps {
  params: Promise<{ slug: string; locale: Locale }>;
}

export async function generateStaticParams() {
  const slugs = await getAllAlternativeSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IAlternativePageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const result = await getAlternativeDataWithLocale(slug, locale);

  if (!result.data) return {};

  return generatePageMetadata(result.data, 'alternatives', locale);
}

export default async function AlternativePage({ params }: IAlternativePageProps) {
  const { slug, locale } = await params;
  const result = await getAlternativeDataWithLocale(slug, locale);

  // If no data and not English locale, show localized template with banner
  if (!result.data && locale !== 'en') {
    return (
      <LocalizedPageTemplate locale={locale} pageData={null} category="alternatives" slug={slug}>
        <></>
      </LocalizedPageTemplate>
    );
  }

  // If no data even in English, 404
  if (!result.data) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">{result.data.h1}</h1>
      <p className="text-xl text-gray-600 mb-8">{result.data.intro}</p>
      <div className="bg-surface-light p-8 rounded-lg">
        <p className="text-gray-700">Alternatives content coming soon...</p>
      </div>
    </div>
  );
}
