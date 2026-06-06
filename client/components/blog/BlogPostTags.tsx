import Link from 'next/link';
import { blogTagLinkClass } from '@client/components/blog/blog-ui';

interface IBlogPostTagsProps {
  tags: string[];
  className?: string;
}

export function BlogPostTags({ tags, className = '' }: IBlogPostTagsProps): JSX.Element | null {
  if (tags.length === 0) {
    return null;
  }

  return (
    <footer className={`not-prose border-t border-border/50 pt-5 ${className}`.trim()}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Topics
      </p>
      <p className="flex flex-wrap items-center gap-y-1 text-xs leading-relaxed">
        {tags.map((tag, index) => (
          <span key={tag} className="inline-flex items-center">
            {index > 0 && (
              <span className="mx-1.5 text-text-muted" aria-hidden="true">
                ·
              </span>
            )}
            <Link href={`/blog?q=${encodeURIComponent(tag)}`} className={blogTagLinkClass}>
              {tag}
            </Link>
          </span>
        ))}
      </p>
    </footer>
  );
}
