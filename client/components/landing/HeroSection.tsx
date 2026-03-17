import { AmbientBackground } from '@client/components/landing/AmbientBackground';
import { ChatGPTBadge } from '@client/components/landing/ChatGPTBadge';
import { HeroActions } from '@client/components/landing/HeroActions';
import { HeroBeforeAfter } from '@client/components/landing/HeroBeforeAfter';
import { getFreeCreditsForTier, getRegionTier } from '@/lib/anti-freeloader/region-classifier';
import { clientEnv } from '@shared/config/env';
import type { IReferralSource } from '@server/analytics/types';
import { Layers, Maximize2, Sparkles, User, Wand2 } from 'lucide-react';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';

/**
 * AI search engine referral sources that should show a badge
 */
type IBadgeReferralSource = Extract<
  IReferralSource,
  'chatgpt' | 'perplexity' | 'claude' | 'google_sge'
>;

function isBadgeSource(source: IReferralSource | null): source is IBadgeReferralSource {
  return source !== null && ['chatgpt', 'perplexity', 'claude', 'google_sge'].includes(source);
}

export async function HeroSection(): Promise<JSX.Element> {
  const t = await getTranslations('homepage');
  const headersList = await headers();
  const country = headersList.get('CF-IPCountry') ?? headersList.get('cf-ipcountry') ?? '';
  const freeCredits = getFreeCreditsForTier(getRegionTier(country));

  // Get referral source from middleware header (server-rendered, zero CLS)
  const referralSource = headersList.get('x-referral-source') as IReferralSource | null;
  const showAiBadge = isBadgeSource(referralSource);

  return (
    <section className="relative pt-20 pb-16 lg:pt-32 lg:pb-24 hero-gradient-2025 z-20 animate-hero-fade-in">
      <AmbientBackground variant="hero" />

      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8 relative z-10">
        {/* AI Search Badge - shown for ChatGPT/Perplexity/Claude/SGE referrals */}
        {showAiBadge && (
          <div className="mb-4">
            <ChatGPTBadge source={referralSource} />
          </div>
        )}

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-strong text-xs font-semibold text-accent mb-8 cursor-default group">
          <Sparkles size={14} className="text-secondary animate-pulse" />
          <span>{t('badge')}</span>
          <span className="w-px h-3 bg-white/10 mx-1"></span>
          <span className="text-muted-foreground">
            {t('badgeVersion', { year: new Date().getFullYear() })}
          </span>
        </div>

        <h1 className="text-6xl font-black tracking-tight text-white sm:text-7xl md:text-8xl mb-6 max-w-5xl mx-auto leading-[1.05]">
          {t('heroTitle')} <span className="gradient-text-primary">{t('heroTitleHighlight')}</span>
        </h1>

        <h2 className="mx-auto mt-6 max-w-2xl text-2xl sm:text-3xl text-text-secondary leading-relaxed font-semibold">
          {t('heroSubtitle')}
          <br />
          <span className="text-white">{t('heroSubtitleHighlight')}</span>
        </h2>

        <p className="mx-auto mt-6 max-w-2xl text-xl sm:text-2xl text-text-secondary leading-relaxed font-light">
          {t('heroDescription')}{' '}
          <span className="text-white font-medium">{t('heroDescriptionHighlight')}</span>
          {t('heroDescriptionMiddle')}{' '}
          <span className="relative text-white font-bold decoration-secondary underline decoration-2 underline-offset-4">
            {t('heroDescriptionTextSharp')}
          </span>
          .
        </p>

        {/* CTA Buttons — client boundary */}
        <HeroActions />

        <p className="mt-4 text-sm text-text-muted-aa">{t('ctaSubtext', { freeCredits })}</p>

        {/* Before/After Slider — LCP-optimized loading */}
        <div className="mt-16">
          {/*
            Server renders a static "after" image so the LCP element is in the initial HTML.
            The client-side interactive slider overlays this image after hydration.
            Without this, the slider (client component) only renders after JS runs → LCP 8s.
            With this, the LCP element is visible immediately → LCP target <3s.
          */}
          <div className="glass-card-2025 p-2 animated-border-violet rounded-2xl max-w-3xl mx-auto relative">
            {/* Static "after" image: server-rendered LCP anchor */}
            <div className="aspect-[16/10] rounded-xl overflow-hidden">
              <img
                src="/before-after/bird-after-v2.webp"
                alt="AI-enhanced bird photo after upscaling"
                fetchPriority="high"
                decoding="async"
                className="w-full h-full object-cover rounded-xl"
              />
            </div>
            {/* Interactive slider: absolutely overlays the static image after hydration */}
            <div className="absolute inset-0 p-2">
              <HeroBeforeAfter />
            </div>
          </div>
        </div>

        {/* Definition Section */}
        <div className="mt-24 max-w-5xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
              What is <span className="gradient-text-primary">{clientEnv.APP_NAME}</span>?
            </h2>
            <p className="text-lg sm:text-xl text-text-secondary leading-relaxed max-w-3xl mx-auto font-light">
              Professional AI image enhancement that preserves real detail. No blur, no
              artifacts—just crisp, high-quality results.
            </p>
          </div>

          {/* Features List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {[
              {
                title: 'Image Upscaling',
                subtitle:
                  'Increase resolution up to 4x while maintaining quality. Perfect for printing, web display, and professional use.',
                icon: <Maximize2 className="text-accent" size={20} />,
              },
              {
                title: 'Photo Enhancement',
                subtitle:
                  'Automatically improve photo quality with AI. Fix blur, adjust colors, and restore details in seconds.',
                icon: <Wand2 className="text-secondary" size={20} />,
              },
              {
                title: 'Face Restoration',
                subtitle:
                  'Bring old or damaged photos back to life with AI-powered restoration technology.',
                icon: <User className="text-accent" size={20} />,
              },
              {
                title: 'Batch Processing',
                subtitle:
                  'Process multiple images at once with bulk tools. Save time on large projects.',
                icon: <Layers className="text-secondary" size={20} />,
              },
            ].map(feature => (
              <div
                key={feature.title}
                className="glass-card-2025 p-8 text-left h-full flex flex-col items-start gap-4 animated-border-violet"
              >
                <div className="p-3 bg-white/5 rounded-xl">{feature.icon}</div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
                  <p className="text-text-secondary leading-relaxed font-light">
                    {feature.subtitle}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
