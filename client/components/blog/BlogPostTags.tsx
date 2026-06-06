import Link from 'next/link';
import { blogTagLinkClass } from '@client/components/blog/blog-ui';

interface IBlogPostTagsProps {
  tags: string[];
  className?: string;
  placement?: 'top' | 'bottom';
}

const PLACEMENT_CLASS: Record<NonNullable<IBlogPostTagsProps['placement']>, string> = {
  top: 'mb-6 lg:mb-8',
  bottom: 'mt-10 border-t border-border/50 pt-5',
};

export function BlogPostTags({
  tags,
  className = '',
  placement = 'bottom',
}: IBlogPostTagsProps): JSX.Element | null {
  if (tags.length === 0) {
    return null;
  }

  const Wrapper = placement === 'top' ? 'nav' : 'footer';

  return (
    <Wrapper
      aria-label="Topics"
      className={`not-prose ${PLACEMENT_CLASS[placement]} ${className}`.trim()}
    >
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
    </Wrapper>
  );
}
