import Link from 'next/link';
import { ArrowRight, ListChecks } from 'lucide-react';
import { BlogSectionHeader } from '@client/components/blog/BlogSectionHeader';
import { blogCardClass, blogCompactPrimaryButtonClass } from '@client/components/blog/blog-ui';

export interface ITableOfContentsItem {
  id: string;
  title: string;
}

interface IBlogGuideSidebarProps {
  items: ITableOfContentsItem[];
  readingTime: string;
  ctaLabel: string;
  className?: string;
}

export function BlogGuideSidebar({
  items,
  readingTime,
  ctaLabel,
  className = '',
}: IBlogGuideSidebarProps): JSX.Element {
  return (
    <div className={`${blogCardClass} p-6 ${className}`.trim()}>
      <BlogSectionHeader icon={ListChecks} title="In This Guide" subtitle={readingTime} />

      {items.length > 0 ? (
        <nav className="mt-5 grid gap-1" aria-label="Table of contents">
          {items.map((item, index) => (
            <Link
              key={item.id}
              href={`#${item.id}`}
              className="group flex items-start gap-3 rounded-lg px-2 py-2 transition-all hover:bg-accent/10"
            >
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-accent/10 text-xs font-semibold text-accent">
                {index + 1}
              </span>
              <span className="text-sm leading-snug text-text-secondary transition-colors group-hover:text-accent">
                {item.title}
              </span>
            </Link>
          ))}
        </nav>
      ) : (
        <p className="mt-5 text-sm leading-relaxed text-text-secondary">
          Follow the guide from setup through the final image check.
        </p>
      )}

      <div className="mt-5 border-t border-border pt-5">
        <Link href="/?signup=1" className={`w-full ${blogCompactPrimaryButtonClass}`}>
          {ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
