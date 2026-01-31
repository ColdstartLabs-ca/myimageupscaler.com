import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getUseCaseData, getAllUseCaseSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { getRelatedPages } from '@/lib/seo/related-pages';
import { generateUseCaseSchema } from '@/lib/seo/schema-generator';
import { UseCasePageTemplate } from '@/app/(pseo)/_components/pseo/templates/UseCasePageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';

interface IUseCasePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllUseCaseSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IUseCasePageProps): Promise<Metadata> {
  const { slug } = await params;
  const useCase = await getUseCaseData(slug);

  if (!useCase) return {};

  return generatePageMetadata(useCase, 'use-cases', 'en');
}

export default async function UseCasePage({ params }: IUseCasePageProps) {
  const { slug } = await params;
  const useCase = await getUseCaseData(slug);

  if (!useCase) {
    notFound();
  }

  // Get related pages for internal linking
  const relatedPages = await getRelatedPages('use-cases', slug, 'en');

  // Generate rich schema markup with FAQPage and BreadcrumbList
  const schema = generateUseCaseSchema(useCase);

  const path = `/use-cases/${slug}`;

  return (
    <>
      {/* SEO meta tags - canonical and og:locale */}
      <SeoMetaTags path={path} locale="en" />
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path={path} category="use-cases" locale="en" />
      <SchemaMarkup schema={schema} />
      <UseCasePageTemplate data={useCase} locale="en" relatedPages={relatedPages} />
    </>
  );
}
