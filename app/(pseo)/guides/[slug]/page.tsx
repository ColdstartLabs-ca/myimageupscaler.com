import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getGuideData, getAllGuideSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generateGuideSchema } from '@/lib/seo/schema-generator';
import { GuidePageTemplate } from '@/app/(pseo)/_components/pseo/templates/GuidePageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';

// Force static rendering for Cloudflare Workers 10ms CPU limit
// Prevents SSR timeouts on Googlebot requests
export const dynamic = 'force-static';
export const revalidate = 86400; // 24 hours

interface IGuidePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllGuideSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IGuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getGuideData(slug);

  if (!guide) return {};

  return generatePageMetadata(guide, 'guides', 'en');
}

export default async function GuidePage({ params }: IGuidePageProps) {
  const { slug } = await params;
  const guide = await getGuideData(slug);

  if (!guide) {
    notFound();
  }

  // Generate rich schema markup with HowTo, Article, FAQPage, and BreadcrumbList
  const schema = generateGuideSchema(guide);

  return (
    <>
      <SchemaMarkup schema={schema} />
      <GuidePageTemplate data={guide} />
    </>
  );
}
