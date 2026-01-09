import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getToolDataWithLocale,
  getAllToolSlugs,
  generateMetadata as generatePageMetadata,
} from '@/lib/seo';
import { ToolPageTemplate } from '@/app/(pseo)/_components/pseo/templates/ToolPageTemplate';
import { InteractiveToolPageTemplate } from '@/app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate';
import { LocalizedPageTemplate } from '@/app/[locale]/(pseo)/_components/pseo/templates/LocalizedPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { generateToolSchema } from '@/lib/seo';
import type { Locale } from '@/i18n/config';

interface IToolPageProps {
  params: Promise<{ slug: string; locale: Locale }>;
}

// Generate static paths at build time
export async function generateStaticParams() {
  const slugs = await getAllToolSlugs();
  return slugs.map(slug => ({ slug }));
}

// Generate metadata using factory
export async function generateMetadata({ params }: IToolPageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const result = await getToolDataWithLocale(slug, locale);

  if (!result.data) return {};

  return generatePageMetadata(result.data, 'tools', locale);
}

export default async function ToolPage({ params }: IToolPageProps) {
  const { slug, locale } = await params;
  const result = await getToolDataWithLocale(slug, locale);

  // If no translation for this locale (but category is localized), show banner
  if (!result.data && locale !== 'en') {
    return (
      <LocalizedPageTemplate locale={locale} pageData={null} category="tools" slug={slug}>
        <></>
      </LocalizedPageTemplate>
    );
  }

  // If no data even in English, 404
  if (!result.data) {
    notFound();
  }

  const schema = generateToolSchema(result.data, locale);

  // Use InteractiveToolPageTemplate for tools with embedded functionality
  const Template = result.data.isInteractive ? InteractiveToolPageTemplate : ToolPageTemplate;

  return (
    <>
      <SchemaMarkup schema={schema} />
      <Template data={result.data} />
    </>
  );
}
