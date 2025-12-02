import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getToolData, getAllToolSlugs } from '@/lib/seo/data-loader';

interface IToolPageProps {
  params: Promise<{ slug: string }>;
}

// Generate static paths at build time
export async function generateStaticParams() {
  const slugs = await getAllToolSlugs();
  return slugs.map(slug => ({ slug }));
}

// Generate metadata
export async function generateMetadata({ params }: IToolPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tool = await getToolData(slug);

  if (!tool) return {};

  return {
    title: tool.metaTitle,
    description: tool.metaDescription,
    keywords: tool.secondaryKeywords.join(', '),
    openGraph: {
      title: tool.metaTitle,
      description: tool.metaDescription,
      type: 'website',
      url: `https://pixelperfect.app/tools/${slug}`,
      images: [
        {
          url: tool.ogImage || 'https://pixelperfect.app/og/tools-default.png',
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
    },
    alternates: {
      canonical: `https://pixelperfect.app/tools/${slug}`,
    },
    robots: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  };
}

export default async function ToolPage({ params }: IToolPageProps) {
  const { slug } = await params;
  const tool = await getToolData(slug);

  if (!tool) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">{tool.h1}</h1>
      <p className="text-xl text-gray-600 mb-8">{tool.intro}</p>

      {/* Tool content will be rendered via templates in next implementation */}
      <div className="bg-gray-50 p-8 rounded-lg">
        <p className="text-gray-700">This is a placeholder for the {tool.toolName} tool page.</p>
        <p className="text-sm text-gray-500 mt-4">Primary keyword: {tool.primaryKeyword}</p>
      </div>
    </div>
  );
}
