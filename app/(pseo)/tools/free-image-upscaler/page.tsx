import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { InteractiveToolPageTemplate } from '@/app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import { getAvailableLocalesForToolSlug } from '@/lib/seo/data-loader';
import {
  FREE_BROWSER_UPSCALER_PATH,
  FREE_BROWSER_UPSCALER_SLUG,
  generateFreeBrowserUpscalerSchema,
  getFreeBrowserUpscalerTool,
} from '@/lib/seo/free-browser-upscaler';
import { getCanonicalUrl } from '@/lib/seo/hreflang-generator';
import { getRelatedPages } from '@/lib/seo/related-pages';
import { clientEnv } from '@shared/config/env';

export const dynamic = 'force-static';
export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const tool = getFreeBrowserUpscalerTool();
  if (!tool) return {};

  const canonicalUrl = getCanonicalUrl(FREE_BROWSER_UPSCALER_PATH);
  const ogImage = tool.ogImage || '/og-image.png';

  return {
    title: tool.metaTitle,
    description: tool.metaDescription,
    keywords: [tool.primaryKeyword, ...tool.secondaryKeywords].join(', '),
    openGraph: {
      title: tool.metaTitle,
      description: tool.metaDescription,
      type: 'article',
      url: canonicalUrl,
      siteName: clientEnv.APP_NAME,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: tool.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: tool.metaTitle,
      description: tool.metaDescription,
      images: [ogImage],
      creator: `@${clientEnv.TWITTER_HANDLE}`,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function FreeImageUpscalerPage() {
  const tool = getFreeBrowserUpscalerTool();

  if (!tool) {
    notFound();
  }

  const [relatedPages, availableLocales] = await Promise.all([
    getRelatedPages('tools', FREE_BROWSER_UPSCALER_SLUG, 'en'),
    getAvailableLocalesForToolSlug(FREE_BROWSER_UPSCALER_SLUG),
  ]);
  const schema = generateFreeBrowserUpscalerSchema(tool, 'en');

  return (
    <>
      <SeoMetaTags path={FREE_BROWSER_UPSCALER_PATH} locale="en" />
      <HreflangLinks
        path={FREE_BROWSER_UPSCALER_PATH}
        category="tools"
        locale="en"
        availableLocales={availableLocales}
      />
      <SchemaMarkup schema={schema} />
      <InteractiveToolPageTemplate data={tool} locale="en" relatedPages={relatedPages} />
    </>
  );
}
