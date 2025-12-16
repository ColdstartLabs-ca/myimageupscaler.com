import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFreeData, getAllFreeSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { FreePageTemplate } from '@/components/pseo/templates/FreePageTemplate';

interface IFreePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllFreeSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IFreePageProps): Promise<Metadata> {
  const { slug } = await params;
  const freeTool = await getFreeData(slug);

  if (!freeTool) return {};

  return generatePageMetadata(freeTool, 'free');
}

export default async function FreePage({ params }: IFreePageProps) {
  const { slug } = await params;
  const freeTool = await getFreeData(slug);

  if (!freeTool) {
    notFound();
  }

  return <FreePageTemplate data={freeTool} />;
}
