/**
 * Related Tools Section for Blog Posts
 * Displays tool pages related to the current blog post
 */

import { getToolsForBlogPost } from '@/lib/seo/data-loader';
import type { IToolPage } from '@/lib/seo/pseo-types';
import { ArrowRight, Sparkles, Wand2 } from 'lucide-react';
import Link from 'next/link';

interface IRelatedToolsSectionProps {
  blogSlug: string;
}

export async function RelatedToolsSection({ blogSlug }: IRelatedToolsSectionProps) {
  const tools = await getToolsForBlogPost(blogSlug);

  if (tools.length === 0) {
    return null;
  }

  return (
    <section className="py-16 bg-surface border-t border-b border-border">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Wand2 className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-primary">Try It Yourself</h2>
            <p className="text-sm text-muted-foreground">
              Use our AI tools to put these techniques into practice
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          {tools.map(tool => (
            <ToolCard key={tool.slug} tool={tool} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ToolCard({ tool }: { tool: IToolPage }) {
  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="group flex items-center gap-4 p-5 bg-surface-light rounded-2xl border border-border hover:border-accent/50 transition-all duration-300"
    >
      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-secondary flex items-center justify-center">
        <Sparkles className="w-6 h-6 text-white" />
      </div>
      <div className="flex-grow min-w-0">
        <h3 className="font-semibold text-primary group-hover:text-accent transition-colors">
          {tool.title}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-1">{tool.intro}</p>
      </div>
      <div className="flex-shrink-0 text-accent flex items-center gap-1 group-hover:gap-2 transition-all">
        <span className="hidden sm:inline text-sm font-medium">Try Free</span>
        <ArrowRight className="w-4 h-4" />
      </div>
    </Link>
  );
}
