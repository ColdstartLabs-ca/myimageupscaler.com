/**
 * Related Pages Section Component
 * Displays related pSEO pages for internal linking
 * Based on PRD Phase 6: Add Related Pages Section for Internal Linking
 */

import { FadeIn, StaggerContainer, StaggerItem } from '@/app/(pseo)/_components/ui/MotionWrappers';
import type { IRelatedPage } from '@/lib/seo/related-pages';
import { ArrowRight, Link2 } from 'lucide-react';
import Link from 'next/link';
import { ReactElement } from 'react';

interface IRelatedPagesSectionProps {
  relatedPages: IRelatedPage[];
  title?: string;
  subtitle?: string;
  maxPages?: number;
}

export function RelatedPagesSection({
  relatedPages,
  title = 'Related Pages',
  subtitle = 'Explore more tools and resources for image enhancement',
  maxPages = 6,
}: IRelatedPagesSectionProps): ReactElement {
  if (!relatedPages || relatedPages.length === 0) {
    return <></>;
  }

  const pages = relatedPages.slice(0, maxPages);

  return (
    <section className="py-16">
      <FadeIn>
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent text-sm font-medium mb-4">
            <Link2 className="w-4 h-4" />
            Related Resources
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">{title}</h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">{subtitle}</p>
        </div>
      </FadeIn>

      <StaggerContainer staggerDelay={0.1} className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pages.map((page, index) => (
          <StaggerItem key={page.slug}>
            <RelatedPageCard page={page} index={index} />
          </StaggerItem>
        ))}
      </StaggerContainer>
    </section>
  );
}

function RelatedPageCard({ page, index }: { page: IRelatedPage; index: number }): ReactElement {
  // Get category label
  const getCategoryLabel = (category: string): string => {
    const labels: Record<string, string> = {
      platforms: 'AI Platform',
      formats: 'Image Format',
      'format-scale': 'Format & Scale',
      'platform-format': 'Platform Format',
      'device-use': 'Device & Use',
      tools: 'Tool',
      content: 'Content Type',
      'camera-raw': 'Camera RAW',
      'bulk-tools': 'Bulk Tool',
      'device-optimization': 'Device Optimization',
      'industry-insights': 'Industry Insight',
      'photo-restoration': 'Photo Restoration',
    };
    return labels[category] || category;
  };

  // Get category color
  const getCategoryColor = (category: string): string => {
    const colors: Record<string, string> = {
      platforms: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      formats: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      'format-scale': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      'platform-format': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      'device-use': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
      tools: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
      content: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
      'camera-raw': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      'bulk-tools': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
      'device-optimization': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
      'industry-insights':
        'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
      'photo-restoration':
        'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
    };
    return colors[category] || 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
  };

  return (
    <Link
      href={page.url}
      className="group block bg-surface rounded-2xl p-6 border border-border hover:border-accent/50 hover:-translate-y-1 transition-all duration-300 h-full"
    >
      <div className="flex items-start justify-between mb-4">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getCategoryColor(page.category)}`}
        >
          {getCategoryLabel(page.category)}
        </span>
        <span
          className="text-accent opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 group-hover:gap-2 transition-all"
          style={{ transitionDelay: `${index * 50}ms` }}
        >
          View
          <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>

      <h3 className="font-semibold text-text-primary mb-3 line-clamp-2 group-hover:text-accent transition-colors leading-snug">
        {page.title}
      </h3>

      {page.description && (
        <p className="text-sm text-text-secondary line-clamp-3">{page.description}</p>
      )}
    </Link>
  );
}
