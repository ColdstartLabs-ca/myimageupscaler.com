import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getUseCaseData, getAllUseCaseSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';

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

  return generatePageMetadata(useCase, 'use-cases');
}

export default async function UseCasePage({ params }: IUseCasePageProps) {
  const { slug } = await params;
  const useCase = await getUseCaseData(slug);

  if (!useCase) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">{useCase.h1}</h1>
      <p className="text-xl text-gray-600 mb-8">{useCase.intro}</p>
      <div className="bg-surface-light p-8 rounded-lg">
        <p className="text-gray-700">Use case content coming soon...</p>
      </div>
    </div>
  );
}
