/**
 * Compact in-article tool banner for blog posts
 */

import { getToolsForBlogPost } from '@/lib/seo/data-loader';
import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

interface ICompactToolsBannerProps {
  blogSlug: string;
  className?: string;
}

export async function CompactToolsBanner({
  blogSlug,
  className = 'mb-10',
}: ICompactToolsBannerProps) {
  const tools = await getToolsForBlogPost(blogSlug);
  if (tools.length === 0) return null;
  const tool = tools[0];

  return (
    <Link
      href={`/tools/${tool.slug}`}
      className={`group not-prose flex items-center justify-between gap-4 rounded-2xl border border-accent/40 bg-gradient-to-r from-accent/15 via-accent/5 to-transparent p-4 shadow-lg shadow-accent/10 hover:border-accent/70 hover:shadow-accent/20 transition-all duration-300 ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-secondary flex items-center justify-center shadow-md shadow-accent/30">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-accent uppercase tracking-widest mb-0.5">
            Try it free
          </p>
          <p className="font-bold text-primary leading-tight truncate">{tool.title}</p>
        </div>
      </div>
      <div className="flex-shrink-0 flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-md shadow-accent/30 group-hover:bg-accent/90 transition-colors">
        <span className="hidden sm:inline">{tool.ctaText}</span>
        <span className="sm:hidden">Try Free</span>
        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </Link>
  );
}
