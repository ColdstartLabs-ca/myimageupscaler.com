import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { InteractiveToolPageTemplate } from '@/app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import type { Locale } from '@/i18n/config';
import { SUPPORTED_LOCALES } from '@/i18n/config';
import { getAvailableLocalesForToolSlug, getToolDataWithLocale } from '@/lib/seo/data-loader';
import {
  FREE_BROWSER_UPSCALER_PATH,
  FREE_BROWSER_UPSCALER_SLUG,
  generateFreeBrowserUpscalerSchema,
} from '@/lib/seo/free-browser-upscaler';
import { getCanonicalUrl } from '@/lib/seo/hreflang-generator';
import { getRelatedPages } from '@/lib/seo/related-pages';
import { clientEnv } from '@shared/config/env';

export const dynamic = 'force-static';
export const revalidate = 86400;

interface IPageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateStaticParams() {
  return SUPPORTED_LOCALES.map(locale => ({ locale }));
}

export async function generateMetadata({ params }: IPageProps): Promise<Metadata> {
  const { locale } = await params;
  let result = await getToolDataWithLocale(FREE_BROWSER_UPSCALER_SLUG, locale);

  if (!result.data && locale !== 'en') {
    result = await getToolDataWithLocale(FREE_BROWSER_UPSCALER_SLUG, 'en');
  }

  if (!result.data) return {};

  const canonicalUrl = getCanonicalUrl(FREE_BROWSER_UPSCALER_PATH, locale);
  const ogImage = result.data.ogImage || '/og-image.png';

  return {
    title: result.data.metaTitle,
    description: result.data.metaDescription,
    keywords: [result.data.primaryKeyword, ...result.data.secondaryKeywords].join(', '),
    openGraph: {
      title: result.data.metaTitle,
      description: result.data.metaDescription,
      type: 'article',
      url: canonicalUrl,
      siteName: clientEnv.APP_NAME,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: result.data.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: result.data.metaTitle,
      description: result.data.metaDescription,
      images: [ogImage],
      creator: `@${clientEnv.TWITTER_HANDLE}`,
    },
    robots: result.hasTranslation ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function LocalizedFreeImageUpscalerPage({ params }: IPageProps) {
  const { locale } = await params;
  let result = await getToolDataWithLocale(FREE_BROWSER_UPSCALER_SLUG, locale);

  if (!result.data && locale !== 'en') {
    result = await getToolDataWithLocale(FREE_BROWSER_UPSCALER_SLUG, 'en');
  }

  if (!result.data) {
    notFound();
  }

  const [relatedPages, availableLocales] = await Promise.all([
    getRelatedPages('tools', FREE_BROWSER_UPSCALER_SLUG, locale),
    getAvailableLocalesForToolSlug(FREE_BROWSER_UPSCALER_SLUG),
  ]);
  const schema = generateFreeBrowserUpscalerSchema(result.data, locale);

  return (
    <>
      <SeoMetaTags path={FREE_BROWSER_UPSCALER_PATH} locale={locale} />
      <HreflangLinks
        path={FREE_BROWSER_UPSCALER_PATH}
        category="tools"
        locale={locale}
        availableLocales={availableLocales}
      />
      <SchemaMarkup schema={schema} />
      <InteractiveToolPageTemplate data={result.data} locale={locale} relatedPages={relatedPages} />
    </>
  );
}
