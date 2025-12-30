/**
 * Breadcrumb Navigation Component
 * Based on PRD-PSEO-05 Section 4.4: Breadcrumb Navigation
 */

import Link from 'next/link';
import { ReactElement } from 'react';

interface IBreadcrumbItem {
  label: string;
  href: string;
}

interface IBreadcrumbNavProps {
  items: IBreadcrumbItem[];
}

export function BreadcrumbNav({ items }: IBreadcrumbNavProps): ReactElement {
  return (
    <nav aria-label="Breadcrumb" className="mb-8">
      <ol className="flex items-center gap-2 text-sm">
        {items.map((item, index) => (
          <li key={item.href} className="flex items-center gap-2">
            {index > 0 && (
              <svg
                className="w-4 h-4 text-text-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
            {index === items.length - 1 ? (
              <span className="text-text-secondary" aria-current="page">
                {item.label}
              </span>
            ) : (
              <Link href={item.href} className="text-accent hover:underline">
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
