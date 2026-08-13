import Link from 'next/link';
import type { Metadata } from 'next';
import { getAllTools, getAllInteractiveTools } from '@/lib/seo/data-loader';
import { INTERACTIVE_TOOL_PATHS } from '@/lib/seo/interactive-tool-routes';
import { generateCategoryMetadata } from '@/lib/seo/metadata-factory';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import type { Locale } from '@/i18n/config';

interface IToolsHubPageProps {
  params: Promise<{ locale: Locale }>;
}

interface IToolCard {
  slug: string;
  title: string;
  description: string;
  href: string;
  isInteractive?: boolean;
}

const POPULAR_TOOL_SLUGS = [
  'ai-image-upscaler',
  'ai-photo-enhancer',
  'ai-background-remover',
  'image-resizer',
  'image-compressor',
] as const;

const CATEGORY_GROUPS: { label: string; description: string; slugs: string[] }[] = [
  {
    label: 'AI Image Tools',
    description: 'Upscale, sharpen, enhance, and clean up photos with AI-first tools.',
    slugs: [
      'ai-image-upscaler',
      'ai-photo-enhancer',
      'photo-quality-enhancer',
      'ai-background-remover',
      'remove-bg',
      'transparent-background-maker',
      'make-image-transparent',
      'image-cutout-tool',
      'smart-ai-enhancement',
    ],
  },
  {
    label: 'Format Converters',
    description:
      'Convert common image formats in the browser before upload, sharing, or publishing.',
    slugs: ['bmp-to-jpg', 'gif-to-jpg', 'svg-to-jpg', 'avif-to-jpg', 'heic-to-jpg', 'heic-to-png'],
  },
  {
    label: 'PDF Tools',
    description: 'Turn PDFs into images or package image files as PDFs for documents and delivery.',
    slugs: ['pdf-to-jpg', 'pdf-to-png', 'image-to-pdf', 'jpg-to-pdf'],
  },
  {
    label: 'Image Editing',
    description: 'Make quick visual edits, extract text, and prepare images for the next step.',
    slugs: ['background-changer', 'image-to-text', 'ocr-online'],
  },
  {
    label: 'Image Cropper',
    description: 'Crop photos for clean compositions, circles, thumbnails, and social platforms.',
    slugs: [
      'image-cropper',
      'crop-image-online-free',
      'crop-image-to-circle',
      'crop-image-for-instagram',
      'crop-image-for-youtube-thumbnail',
    ],
  },
];

function getToolHref(slug: string, locale: Locale): string {
  const path =
    INTERACTIVE_TOOL_PATHS[slug as keyof typeof INTERACTIVE_TOOL_PATHS] ?? `/tools/${slug}`;
  return locale === 'en' ? path : `/${locale}${path}`;
}

export async function generateMetadata({ params }: IToolsHubPageProps): Promise<Metadata> {
  const { locale } = await params;
  return generateCategoryMetadata('tools', locale);
}

export default async function ToolsHubPage({ params }: IToolsHubPageProps) {
  const { locale } = await params;
  const [staticTools, interactiveTools] = await Promise.all([
    getAllTools(),
    getAllInteractiveTools(),
  ]);

  const allTools = [...staticTools, ...interactiveTools];
  const toolMap = new Map<string, IToolCard>(
    allTools.map(t => [
      t.slug,
      {
        slug: t.slug,
        title: t.toolName || t.title,
        description: t.description,
        href: getToolHref(t.slug, locale),
        isInteractive: t.isInteractive,
      },
    ])
  );

  const groupedSlugs = new Set<string>();
  const groups = CATEGORY_GROUPS.map(g => ({
    label: g.label,
    description: g.description,
    tools: g.slugs.flatMap(slug => {
      const tool = toolMap.get(slug);
      if (tool) {
        groupedSlugs.add(slug);
        return [tool];
      }
      return [];
    }),
  })).filter(g => g.tools.length > 0);

  const otherTools = allTools
    .filter(t => !groupedSlugs.has(t.slug))
    .map(t => ({
      slug: t.slug,
      title: t.toolName || t.title,
      description: t.description,
      href: getToolHref(t.slug, locale),
      isInteractive: t.isInteractive,
    }));

  if (otherTools.length > 0) {
    groups.push({
      label: 'More Tools',
      description:
        'Additional utility tools for privacy, metadata, file cleanup, and niche workflows.',
      tools: otherTools,
    });
  }

  const popularTools = POPULAR_TOOL_SLUGS.flatMap(slug => {
    const tool = toolMap.get(slug);
    return tool ? [tool] : [];
  });

  return (
    <>
      {/* SEO meta tags for canonical URL and og:locale */}
      <SeoMetaTags path="/tools" locale={locale} />
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path="/tools" category="tools" locale={locale} />
      <div className="container mx-auto px-4 py-12 bg-base min-h-screen">
        <h1 className="text-4xl font-bold mb-4 text-text-primary">Free Image Tools</h1>
        <p className="text-xl text-text-secondary mb-12 max-w-2xl">
          Professional-grade image tools — converters, compressors, PDF tools, and AI enhancement.
          No signup required.
        </p>

        <section className="mb-14">
          <div className="flex items-end justify-between gap-4 border-b border-border pb-2 mb-5">
            <div>
              <h2 className="text-xl font-semibold text-text-primary">Popular Tools</h2>
              <p className="text-sm text-text-secondary mt-1">
                Start with the tools people use most for upscaling, enhancement, backgrounds, and
                file optimization.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {popularTools.map(tool => (
              <Link
                key={tool.slug}
                href={tool.href}
                className="block p-4 glass-card rounded-lg border border-border hover:border-accent hover:shadow-lg transition-all group"
              >
                <h3 className="text-base font-semibold mb-2 text-text-primary group-hover:text-accent transition-colors">
                  {tool.title}
                </h3>
                <p className="text-text-secondary text-sm line-clamp-2">{tool.description}</p>
                <span className="inline-block mt-3 text-accent text-sm font-medium group-hover:text-accent-hover transition-colors">
                  Open {tool.title} →
                </span>
              </Link>
            ))}
          </div>
        </section>

        {groups.map(group => (
          <section key={group.label} className="mb-14">
            <div className="border-b border-border pb-2 mb-5">
              <h2 className="text-xl font-semibold text-text-primary">{group.label}</h2>
              <p className="text-sm text-text-secondary mt-1">{group.description}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {group.tools.map(tool => (
                <Link
                  key={tool.slug}
                  href={tool.href}
                  className="block p-5 glass-card rounded-lg border border-border hover:border-accent hover:shadow-lg transition-all group"
                >
                  <h3 className="text-lg font-semibold mb-2 text-text-primary group-hover:text-accent transition-colors">
                    {tool.title}
                  </h3>
                  <p className="text-text-secondary text-sm line-clamp-2">{tool.description}</p>
                  <span className="inline-block mt-3 text-accent text-sm font-medium group-hover:text-accent-hover transition-colors">
                    {tool.isInteractive ? `Open ${tool.title} →` : `Learn about ${tool.title} →`}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
