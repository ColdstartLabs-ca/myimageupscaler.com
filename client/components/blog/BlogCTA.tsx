/**
 * Blog CTA Components
 *
 * Standardized Call-to-Action components for blog posts.
 * Designed to improve acquisition by placing CTAs strategically within content.
 *
 * CTA Types:
 * - try: Simple "try the tool" CTA (use mid-article)
 * - demo: Before/after demo CTA with visual appeal
 * - pricing: Focused on value proposition and pricing
 * - tool: Tool-specific CTA with feature highlights
 */

import { ArrowRight, Zap, Check } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { ReactElement } from 'react';
import { useTranslations } from 'next-intl';

export type BlogCTAType = 'try' | 'demo' | 'pricing' | 'tool';

interface IBlogCTAProps {
  type: BlogCTAType;
  /** Optional custom title override */
  title?: string;
  /** Optional custom description override */
  description?: string;
  /** Tool slug for tool-specific CTAs */
  toolSlug?: string;
  /** Tool name for display */
  toolName?: string;
}

const CTA_HREF: Record<BlogCTAType, string> = {
  try: '/?signup=1',
  demo: '/?signup=1',
  pricing: '/pricing',
  tool: '/?signup=1',
};

export function BlogCTA({
  type,
  title,
  description,
  toolSlug,
  toolName,
}: IBlogCTAProps): ReactElement {
  const t = useTranslations('blog.cta');
  const trustIndicators = t.raw('trustIndicators') as string[];

  const displayTitle = title || t(`${type}.title`);
  const displayDescription = description || t(`${type}.description`);
  const href = toolSlug ? `/tools/${toolSlug}` : CTA_HREF[type];
  const buttonText = toolName ? `Try ${toolName} Free` : t(`${type}.button`);

  if (type === 'try' || type === 'tool') {
    return (
      <InlineCTA
        title={displayTitle}
        description={displayDescription}
        buttonText={buttonText}
        href={href}
      />
    );
  }

  if (type === 'demo') {
    return (
      <DemoCTA
        title={displayTitle}
        description={displayDescription}
        buttonText={buttonText}
        href={href}
      />
    );
  }

  return (
    <FullCTA
      title={displayTitle}
      description={displayDescription}
      buttonText={buttonText}
      href={href}
      trustIndicators={trustIndicators}
    />
  );
}

/** Inline CTA - Compact with logo, fits within content flow */
function InlineCTA({
  title,
  description,
  buttonText,
  href,
}: {
  title: string;
  description: string;
  buttonText: string;
  href: string;
}): ReactElement {
  return (
    <div className="not-prose my-8 rounded-2xl overflow-hidden border border-accent/30 bg-gradient-to-r from-accent/5 via-surface to-accent/5">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Image
              src="/logo/horizontal-logo-compact.png"
              alt="MyImageUpscaler"
              width={80}
              height={32}
              className="h-8 w-auto"
            />
          </div>

          {/* Content */}
          <div className="flex-grow min-w-0">
            <h3 className="font-bold text-primary text-lg">{title}</h3>
            <p className="text-muted-foreground text-sm mt-0.5">{description}</p>
          </div>

          {/* Button */}
          <Link
            href={href}
            className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 gradient-cta text-white font-semibold rounded-xl hover:opacity-90 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-accent/25 group"
          >
            <Zap className="w-4 h-4" />
            {buttonText}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Demo CTA - Highlights the before/after capability with logo */
function DemoCTA({
  title,
  description,
  buttonText,
  href,
}: {
  title: string;
  description: string;
  buttonText: string;
  href: string;
}): ReactElement {
  const t = useTranslations('blog.cta.demo');

  return (
    <div className="not-prose my-10 rounded-2xl overflow-hidden border border-border bg-surface">
      <div className="p-6 sm:p-8">
        {/* Header with Logo */}
        <div className="flex items-center gap-4 mb-5">
          <Image
            src="/logo/horizontal-logo-compact.png"
            alt="MyImageUpscaler"
            width={100}
            height={40}
            className="h-10 w-auto"
          />
          <div className="h-8 w-px bg-border" />
          <h3 className="font-bold text-primary text-xl">{title}</h3>
        </div>

        <p className="text-muted-foreground mb-6 max-w-xl">{description}</p>

        {/* Feature highlights */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="w-4 h-4 text-success" />
            <span>{t('feature2x4x')}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="w-4 h-4 text-success" />
            <span>{t('featureText')}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="w-4 h-4 text-success" />
            <span>{t('featureSpeed')}</span>
          </div>
        </div>

        <Link
          href={href}
          className="inline-flex items-center gap-2 px-6 py-3 gradient-cta text-white font-semibold rounded-xl hover:opacity-90 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-accent/25 group"
        >
          <Zap className="w-5 h-5" />
          {buttonText}
          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
}

/** Full CTA - High impact with logo, use at end of articles */
function FullCTA({
  title,
  description,
  buttonText,
  href,
  trustIndicators,
}: {
  title: string;
  description: string;
  buttonText: string;
  href: string;
  trustIndicators: string[];
}): ReactElement {
  return (
    <div className="not-prose my-12 rounded-2xl overflow-hidden relative">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent via-tertiary to-accent opacity-95" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_50%)]" />

      <div className="relative p-8 sm:p-10">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2">
            <Image
              src="/logo/horizontal-logo-compact.png"
              alt="MyImageUpscaler"
              width={120}
              height={48}
              className="h-10 w-auto brightness-0 invert"
            />
          </div>
        </div>

        <div className="text-center">
          <h3 className="font-bold text-white text-2xl sm:text-3xl mb-4">{title}</h3>
          <p className="text-white/80 mb-8 max-w-lg mx-auto">{description}</p>

          <Link
            href={href}
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-accent font-bold rounded-xl hover:bg-white/90 hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg group"
          >
            <Zap className="w-5 h-5" />
            {buttonText}
            <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          {/* Trust indicators */}
          <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-white/70">
            {trustIndicators.map(indicator => (
              <div key={indicator} className="flex items-center gap-2">
                <Check className="w-4 h-4 text-white/80" />
                <span>{indicator}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Parses CTA markers from markdown content and returns the CTA type.
 * Markers: [!CTA_TRY], [!CTA_DEMO], [!CTA_PRICING], [!CTA_TOOL:slug]
 */
export function parseCTAMarker(text: string): { type: BlogCTAType; toolSlug?: string } | null {
  const trimmed = text.trim();

  if (trimmed.match(/^\[!CTA_TRY\]$/)) return { type: 'try' };
  if (trimmed.match(/^\[!CTA_DEMO\]$/)) return { type: 'demo' };
  if (trimmed.match(/^\[!CTA_PRICING\]$/)) return { type: 'pricing' };

  const toolMatch = trimmed.match(/^\[!CTA_TOOL(?::([^\]]+))?\]$/);
  if (toolMatch) return { type: 'tool', toolSlug: toolMatch[1] };

  return null;
}
