/**
 * External Sources Section Component
 * Displays authoritative outbound links for E-E-A-T signals
 * Links open in a new tab with rel="noopener noreferrer" for security
 */

import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';
import type { IExternalSource } from '@/lib/seo/pseo-types';
import { ExternalLink } from 'lucide-react';
import { ReactElement } from 'react';

interface IExternalSourcesSectionProps {
  sources: IExternalSource[];
  title?: string;
}

export function ExternalSourcesSection({
  sources,
  title = 'Further Reading',
}: IExternalSourcesSectionProps): ReactElement {
  if (!sources || sources.length === 0) {
    return <></>;
  }

  return (
    <section className="py-16">
      <FadeIn>
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">{title}</h2>
          <p className="text-text-secondary">
            Authoritative references and technical documentation
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {sources.map(source => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 p-5 rounded-xl border border-white/10 hover:border-accent/40 bg-white/5 hover:bg-white/8 transition-all duration-200"
            >
              <ExternalLink
                size={16}
                className="text-text-muted shrink-0 mt-0.5 group-hover:text-accent transition-colors"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white group-hover:text-accent transition-colors truncate">
                  {source.title}
                </p>
                {source.description && (
                  <p className="text-xs text-text-muted mt-0.5 leading-relaxed line-clamp-2">
                    {source.description}
                  </p>
                )}
              </div>
            </a>
          ))}
        </div>
      </FadeIn>
    </section>
  );
}
