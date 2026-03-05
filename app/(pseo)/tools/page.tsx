import Link from 'next/link';
import type { Metadata } from 'next';
import { getAllTools, getAllInteractiveTools } from '@/lib/seo/data-loader';
import { generateCategoryMetadata } from '@/lib/seo/metadata-factory';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';

export async function generateMetadata(): Promise<Metadata> {
  return generateCategoryMetadata('tools', 'en');
}

interface IToolCard {
  slug: string;
  title: string;
  description: string;
  href: string;
  isInteractive?: boolean;
}

const CATEGORY_GROUPS: { label: string; slugs: string[] }[] = [
  {
    label: 'AI Image Tools',
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
    slugs: ['bmp-to-jpg', 'gif-to-jpg', 'svg-to-jpg', 'avif-to-jpg', 'heic-to-jpg', 'heic-to-png'],
  },
  {
    label: 'PDF Tools',
    slugs: ['pdf-to-jpg', 'pdf-to-png', 'image-to-pdf', 'jpg-to-pdf'],
  },
  {
    label: 'Image Editing',
    slugs: ['background-changer', 'image-to-text', 'ocr-online'],
  },
];

export default async function ToolsHubPage() {
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
        href: `/tools/${t.slug}`,
        isInteractive: t.isInteractive,
      },
    ])
  );

  // Build grouped sections; collect slugs that appear in a group
  const groupedSlugs = new Set<string>();
  const groups = CATEGORY_GROUPS.map(g => ({
    label: g.label,
    tools: g.slugs.flatMap(slug => {
      const tool = toolMap.get(slug);
      if (tool) {
        groupedSlugs.add(slug);
        return [tool];
      }
      return [];
    }),
  })).filter(g => g.tools.length > 0);

  // Remaining tools not in any group
  const otherTools = allTools
    .filter(t => !groupedSlugs.has(t.slug))
    .map(t => ({
      slug: t.slug,
      title: t.toolName || t.title,
      description: t.description,
      href: `/tools/${t.slug}`,
      isInteractive: t.isInteractive,
    }));

  if (otherTools.length > 0) {
    groups.push({ label: 'More Tools', tools: otherTools });
  }

  return (
    <>
      <SeoMetaTags path="/tools" locale="en" />
      <HreflangLinks path="/tools" category="tools" locale="en" />
      <div className="container mx-auto px-4 py-12 bg-base min-h-screen">
        <h1 className="text-4xl font-bold mb-4 text-text-primary">Free Image Tools</h1>
        <p className="text-xl text-text-secondary mb-12 max-w-2xl">
          Professional-grade image tools — converters, compressors, PDF tools, and AI enhancement.
          No signup required.
        </p>

        {groups.map(group => (
          <section key={group.label} className="mb-14">
            <h2 className="text-xl font-semibold mb-5 text-text-primary border-b border-border pb-2">
              {group.label}
            </h2>
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
                    {tool.isInteractive ? 'Use free tool →' : 'Learn more →'}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}

        {/* Upgrade CTA */}
        <div className="mt-8 p-6 rounded-xl border border-accent/30 bg-accent/5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <p className="font-semibold text-text-primary">Need higher quality?</p>
            <p className="text-sm text-text-secondary mt-1">
              Upscale any image 2–4× with AI. Better detail, sharper results than standard tools.
            </p>
          </div>
          <Link
            href="/?signup=1"
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 transition-colors"
          >
            Try AI Upscaler Free →
          </Link>
        </div>
      </div>
    </>
  );
}
