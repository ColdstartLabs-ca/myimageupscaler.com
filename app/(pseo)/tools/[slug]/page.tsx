import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getToolData, getAllToolSlugs } from '@/lib/seo';
import { ToolPageTemplate } from '@/app/(pseo)/_components/pseo/templates/ToolPageTemplate';
import { InteractiveToolPageTemplate } from '@/app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { generateToolSchema } from '@/lib/seo';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import { getCanonicalUrl } from '@/lib/seo/hreflang-generator';
import { clientEnv } from '@shared/config/env';

interface IToolPageProps {
  params: Promise<{ slug: string }>;
}

// Generate static paths at build time
export async function generateStaticParams() {
  const slugs = await getAllToolSlugs();
  return slugs.map(slug => ({ slug }));
}

// Generate metadata using factory
// NOTE: canonical and og:locale are rendered via SeoMetaTags component to ensure they appear in <head>
// NOTE: hreflang links are rendered via HreflangLinks component to ensure they appear in <head>
export async function generateMetadata({ params }: IToolPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tool = await getToolData(slug);

  if (!tool) return {};

  const path = `/tools/${slug}`;
  const canonicalUrl = getCanonicalUrl(path);

  // Default og:image for all tool pages
  const ogImage = tool.ogImage || '/og-image.png';

  return {
    title: tool.metaTitle,
    description: tool.metaDescription,
    openGraph: {
      title: tool.metaTitle,
      description: tool.metaDescription,
      type: 'website',
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
      // NOTE: og:locale is rendered via SeoMetaTags component
    },
    twitter: {
      card: 'summary_large_image',
      title: tool.metaTitle,
      description: tool.metaDescription,
      images: [ogImage],
      creator: `@${clientEnv.TWITTER_HANDLE}`,
    },
    // NOTE: canonical is rendered via SeoMetaTags component
    // NOTE: hreflang links are rendered via HreflangLinks component
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function ToolPage({ params }: IToolPageProps) {
  const { slug } = await params;
  const tool = await getToolData(slug);

  if (!tool) {
    notFound();
  }

  const schema = generateToolSchema(tool, 'en');
  const path = `/tools/${slug}`;

  // Use InteractiveToolPageTemplate for tools with embedded functionality
  const Template = tool.isInteractive ? InteractiveToolPageTemplate : ToolPageTemplate;

  return (
    <>
      {/* SEO meta tags - canonical and og:locale */}
      <SeoMetaTags path={path} locale="en" />
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path={path} category="tools" locale="en" />
      <SchemaMarkup schema={schema} />
      <Template data={tool} />
    </>
  );
}
