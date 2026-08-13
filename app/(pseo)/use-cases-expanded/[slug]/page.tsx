import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAllUseCasesExpandedSlugs, getUseCasesExpandedData } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generatePSEOSchema } from '@/lib/seo/schema-generator';
import type { PSEOPage } from '@/lib/seo/pseo-types';
import { GenericPSEOPageTemplate } from '@/app/(pseo)/_components/pseo/templates/GenericPSEOPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';

export const dynamic = 'force-static';
export const revalidate = 86400;

type IUseCasesExpandedRawPage = PSEOPage & {
  benefits?: unknown[];
  faqs?: unknown[];
};

function normalizeUseCasesExpandedPage(page: PSEOPage): PSEOPage {
  const rawPage = page as IUseCasesExpandedRawPage;
  const benefits = Array.isArray(rawPage.benefits)
    ? rawPage.benefits
        .filter((benefit): benefit is string => typeof benefit === 'string')
        .map(benefit => ({ title: benefit, description: benefit }))
    : undefined;
  const faq = Array.isArray(rawPage.faqs)
    ? rawPage.faqs.filter(
        (item): item is { question: string; answer: string } =>
          typeof item === 'object' &&
          item !== null &&
          'question' in item &&
          'answer' in item &&
          typeof item.question === 'string' &&
          typeof item.answer === 'string'
      )
    : undefined;

  return {
    ...rawPage,
    ...(benefits ? { benefits } : {}),
    ...(faq ? { faq } : {}),
    category: 'use-cases-expanded' as PSEOPage['category'],
  } as PSEOPage;
}

interface IUseCasesExpandedPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllUseCasesExpandedSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IUseCasesExpandedPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getUseCasesExpandedData(slug);

  if (!page) return {};

  return generatePageMetadata(page as unknown as PSEOPage, 'use-cases-expanded', 'en');
}

export default async function UseCasesExpandedPage({ params }: IUseCasesExpandedPageProps) {
  const { slug } = await params;
  const page = await getUseCasesExpandedData(slug);

  if (!page) {
    notFound();
  }

  const pageWithCategory = normalizeUseCasesExpandedPage(page as unknown as PSEOPage);
  const schema = generatePSEOSchema(
    pageWithCategory as unknown as Parameters<typeof generatePSEOSchema>[0],
    'use-cases-expanded'
  );
  const path = `/use-cases-expanded/${slug}`;

  return (
    <>
      <SeoMetaTags path={path} locale="en" />
      <HreflangLinks path={path} category="use-cases-expanded" locale="en" />
      <SchemaMarkup schema={schema} />
      <GenericPSEOPageTemplate data={pageWithCategory} />
    </>
  );
}
