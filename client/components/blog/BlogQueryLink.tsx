'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

interface IBlogQueryLinkProps {
  query: string;
  className?: string;
  children: ReactNode;
}

/**
 * Blog search-result URLs (`/blog?q=...`) are noindex. Emitting crawlable
 * links to them spends crawl budget on pages we explicitly ask search engines
 * to drop, so these shortcuts navigate client-side instead.
 */
export function BlogQueryLink({ query, className, children }: IBlogQueryLinkProps): JSX.Element {
  const router = useRouter();

  return (
    <button
      type="button"
      className={className}
      onClick={() => router.push(`/blog?q=${encodeURIComponent(query)}`, { scroll: false })}
    >
      {children}
    </button>
  );
}
