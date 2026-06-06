import { ChatGPTBadge } from '@client/components/landing/ChatGPTBadge';
import { HeroActions } from '@client/components/landing/HeroActions';
import { HeroBeforeAfter } from '@client/components/landing/HeroBeforeAfter';
import { HeroTrustBar } from '@client/components/landing/HeroTrustBar';
import { HERO_COMPARISON_IMAGES } from '@client/components/landing/heroAssets';
import { getFreeCreditsForTier, getRegionTier } from '@/lib/anti-freeloader/region-classifier';
import type { IReferralSource } from '@server/analytics/types';
import { Check, Sparkles } from 'lucide-react';
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
  const heroTrustItems = [
    { label: 'Free to start', icon: <Check size={18} /> },
    { label: 'No watermarks', icon: <Check size={18} /> },
    { label: 'Instant results', icon: <Check size={18} /> },
  ];

  return (
    <section className="relative pb-12 pt-12 animate-hero-fade-in lg:pb-16 lg:pt-12">
      <div className="relative z-10 mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
        {/* AI Search Badge - shown for ChatGPT/Perplexity/Claude/SGE referrals */}
        {showAiBadge && (
          <div className="mb-5 lg:ml-1">
            <ChatGPTBadge source={referralSource} />
          </div>
        )}

        <div className="grid items-center gap-10 lg:grid-cols-[590px_minmax(0,1fr)] lg:gap-16">
          <div className="text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-strong text-xs font-semibold text-accent mb-8 cursor-default group">
              <Sparkles size={14} className="text-secondary animate-pulse" />
              <span>{t('badge')}</span>
              <span className="w-px h-3 bg-white/10 mx-1"></span>
              <span className="text-muted-foreground">
                {t('badgeVersion', { year: new Date().getFullYear() })}
              </span>
            </div>

            <h1 className="text-[2.75rem] font-black tracking-tight text-white sm:text-6xl lg:text-[3.8rem] leading-[1.08]">
              {t('heroTitle')}{' '}
              <span className="mt-3 block gradient-text-primary">{t('heroTitleHighlight')}</span>
            </h1>

            <h2 className="mt-6 max-w-xl text-2xl sm:text-3xl text-text-secondary leading-relaxed font-semibold">
              {t('heroSubtitle')}
              <br />
              <span className="text-white">{t('heroSubtitleHighlight')}</span>
            </h2>

            <p className="mt-7 max-w-xl text-lg sm:text-xl text-text-secondary leading-relaxed font-light">
              {t('heroDescription')}{' '}
              <span className="text-white font-medium">{t('heroDescriptionHighlight')}</span>
              {t('heroDescriptionMiddle')}{' '}
              <span className="relative text-white font-bold decoration-secondary underline decoration-2 underline-offset-4">
                {t('heroDescriptionTextSharp')}
              </span>
              .
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-3 text-sm sm:text-base text-text-secondary">
              {heroTrustItems.map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className="text-accent">{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            <div className="[&>div]:justify-start">
              <HeroActions />
            </div>

            <p className="mt-4 flex items-center gap-2 text-sm text-text-muted-aa">
              <Check size={17} className="text-accent" />
              {t('ctaSubtext', { freeCredits })}
            </p>
          </div>

          {/* Before/After Slider - LCP-optimized loading */}
          <div className="relative">
            {/*
              Server renders a static "after" image so the LCP element is in the initial HTML.
              The client-side interactive slider overlays this image after hydration.
            */}
            <div className="relative overflow-hidden rounded-2xl border border-white/25 bg-white/[0.04] shadow-2xl shadow-accent/10">
              <div className="aspect-[4/3] rounded-2xl overflow-hidden">
                <img
                  src={HERO_COMPARISON_IMAGES.after}
                  alt="AI-enhanced mountain photo after upscaling"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute inset-0">
                <HeroBeforeAfter />
              </div>
            </div>
          </div>
        </div>

        <HeroTrustBar />
      </div>
    </section>
  );
}
