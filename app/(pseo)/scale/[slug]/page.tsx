import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getScaleData, getAllScaleSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { ScalePageTemplate } from '@/components/pseo/templates/ScalePageTemplate';

interface IScalePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllScaleSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IScalePageProps): Promise<Metadata> {
  const { slug } = await params;
  const scale = await getScaleData(slug);

  if (!scale) return {};

  return generatePageMetadata(scale, 'scale');
}

export default async function ScalePage({ params }: IScalePageProps) {
  const { slug } = await params;
  const scale = await getScaleData(slug);

  if (!scale) {
    notFound();
  }

  return <ScalePageTemplate data={scale} />;
}
