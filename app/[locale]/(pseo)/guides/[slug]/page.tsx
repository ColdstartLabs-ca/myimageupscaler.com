import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getGuideData, getAllGuideSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { GuidePageTemplate } from '@/app/(pseo)/_components/pseo/templates/GuidePageTemplate';

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

  return generatePageMetadata(guide, 'guides');
}

export default async function GuidePage({ params }: IGuidePageProps) {
  const { slug } = await params;
  const guide = await getGuideData(slug);

  if (!guide) {
    notFound();
  }

  return <GuidePageTemplate data={guide} />;
}
