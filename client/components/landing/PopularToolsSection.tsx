'use client';

import { LandingSection } from '@client/components/landing/LandingSection';
import { POPULAR_TOOLS } from '@client/components/landing/popularTools.data';
import { useRegionTier } from '@client/hooks/useRegionTier';
import { getFreeCreditsForTier } from '@/lib/anti-freeloader/region-classifier';
import { DEFAULT_LOCALE } from '@/i18n/config';
import { Eraser, FileImage, Gift, Layers, Sparkles, type LucideIcon, ZoomIn } from 'lucide-react';
import { useLocale } from 'next-intl';
import Link from 'next/link';

const TOOL_ICONS: Record<(typeof POPULAR_TOOLS)[number]['href'], LucideIcon> = {
  '/tools/ai-image-upscaler': ZoomIn,
  '/tools/ai-photo-enhancer': Sparkles,
  '/tools/transparent-background-maker': Layers,
  '/formats/upscale-avif-images': FileImage,
  '/free': Gift,
  '/tools/ai-background-remover': Eraser,
};

interface IPopularToolsSectionProps {
  freeCredits?: number;
}

export function PopularToolsSection({
  freeCredits: freeCreditsProp,
}: IPopularToolsSectionProps): JSX.Element {
  const locale = useLocale();
  const { tier } = useRegionTier();
  const freeCredits = freeCreditsProp ?? getFreeCreditsForTier(tier ?? 'standard');
  const localizeHref = (href: string) => (locale === DEFAULT_LOCALE ? href : `/${locale}${href}`);

  return (
    <LandingSection
      ambient
      fadeTop
      fadeBottom
      className="py-8 sm:py-16 lg:py-20"
      innerClassName="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
    >
      <div className="mb-6 text-center sm:mb-12">
        <p className="mb-2 text-sm font-bold uppercase tracking-widest text-secondary sm:mb-3">Tools</p>
        <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
          Start enhancing — <span className="gradient-text-primary">pick a tool</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg font-light text-text-secondary">
          Professional AI tools for every image task. Try free with {freeCredits} credits.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {POPULAR_TOOLS.map(tool => {
          const Icon = TOOL_ICONS[tool.href];

          return (
            <Link
              key={tool.href}
              href={localizeHref(tool.href)}
              className="group flex h-full flex-col rounded-xl border border-surface-light bg-surface/60 p-5 transition-colors duration-200 hover:border-accent/40 hover:bg-surface"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-accent/20 to-secondary/20 text-accent transition-transform duration-200 group-hover:scale-105">
                <Icon size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <h3 className="text-base font-bold text-white transition-colors group-hover:gradient-text-secondary">
                {tool.label}
              </h3>
              <p className="mt-1.5 text-sm font-light leading-snug text-text-secondary">
                {tool.desc}
              </p>
            </Link>
          );
        })}
      </div>
    </LandingSection>
  );
}
