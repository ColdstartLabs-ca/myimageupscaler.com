import type { ReactNode } from 'react';

interface ILocalePSEOLayoutProps {
  children: ReactNode;
}

/**
 * Layout for locale-specific pSEO (programmatic SEO) pages
 *
 * This layout is a passthrough that inherits from the parent [locale] layout.
 * The (pseo) route group is just for organization and doesn't need its own layout.
 */
export default function LocalePSEOLayout({ children }: ILocalePSEOLayoutProps) {
  return <>{children}</>;
}
