import Link from 'next/link';
import type { ITableOfContentsItem } from '@client/components/blog/BlogGuideSidebar';

interface IBlogGuideNavProps {
  items: ITableOfContentsItem[];
  readingTime: string;
  className?: string;
}

export function BlogGuideNav({
  items,
  readingTime,
  className = '',
}: IBlogGuideNavProps): JSX.Element | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Jump to section" className={`not-prose ${className}`.trim()}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          In this guide
        </span>
        <span className="text-xs text-text-muted">{readingTime}</span>
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item, index) => (
          <Link
            key={item.id}
            href={`#${item.id}`}
            className="flex-shrink-0 rounded-full border border-border bg-surface-light px-3 py-1 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
          >
            {index + 1}. {item.title}
          </Link>
        ))}
      </div>
    </nav>
  );
}
