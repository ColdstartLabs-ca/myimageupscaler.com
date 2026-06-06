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
      className={`group not-prose flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-gradient-to-r from-accent/15 via-accent/5 to-transparent p-3 shadow-md shadow-accent/10 hover:border-accent/70 hover:shadow-accent/20 transition-all duration-300 ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-secondary flex items-center justify-center shadow-md shadow-accent/30">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-0.5">
            Try it free
          </p>
          <p className="text-sm font-bold text-primary leading-tight truncate">{tool.title}</p>
        </div>
      </div>
      <div className="flex-shrink-0 flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-accent/30 group-hover:bg-accent/90 transition-colors">
        <span className="hidden sm:inline">{tool.ctaText}</span>
        <span className="sm:hidden">Try Free</span>
        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </Link>
  );
}
