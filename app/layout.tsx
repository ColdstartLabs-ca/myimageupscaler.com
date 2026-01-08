import type { ReactNode } from 'react';

/**
 * Root layout - minimal passthrough for i18n
 *
 * The actual layout with html/body/providers is in app/[locale]/layout.tsx
 * This exists to satisfy Next.js requirement for a root layout.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
