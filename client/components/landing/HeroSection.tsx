import { ChatGPTBadge } from '@client/components/landing/ChatGPTBadge';
import { HeroActions } from '@client/components/landing/HeroActions';
import { HeroBeforeAfter } from '@client/components/landing/HeroBeforeAfter';
import { HeroTrustBar } from '@client/components/landing/HeroTrustBar';
import { HERO_COMPARISON_IMAGES } from '@client/components/landing/heroAssets';
import { getFreeCreditsForTier, getRegionTier } from '@/lib/anti-freeloader/region-classifier';
import type { IReferralSource } from '@server/analytics/types';
import { Check } from 'lucide-react';
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

  const heroSlider = (
    <div className="relative overflow-hidden rounded-2xl border border-white/25 bg-white/[0.04] shadow-2xl shadow-accent/10">
      {/*
        Server renders a static "after" image so the LCP element is in the initial HTML.
        The client-side interactive slider overlays this image after hydration.
      */}
      <div className="aspect-[3/2] overflow-hidden rounded-2xl lg:aspect-[4/3]">
        <img
          src={HERO_COMPARISON_IMAGES.after}
          alt="AI-enhanced mountain photo after upscaling"
          fetchPriority="high"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>
      <div className="absolute inset-0">
        <HeroBeforeAfter />
      </div>
    </div>
  );

  return (
    <section className="relative animate-hero-fade-in pb-8 pt-6 lg:pb-16 lg:pt-12">
      <div className="relative z-10 mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
        {/* AI Search Badge - shown for ChatGPT/Perplexity/Claude/SGE referrals */}
        {showAiBadge && (
          <div className="mb-3 lg:mb-5 lg:ml-1">
            <ChatGPTBadge source={referralSource} />
          </div>
        )}

        {/*
          Mobile: compact headline → slider → CTAs (slider above the fold).
          Desktop: unchanged two-column grid with copy left, slider right.
        */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[590px_minmax(0,1fr)] lg:items-center lg:gap-16">
          <div className="contents lg:col-start-1 lg:row-start-1 lg:block">
            <div className="order-1 text-left lg:order-none">
              <h1 className="text-[1.875rem] font-black leading-[1.1] tracking-tight text-white sm:text-6xl lg:text-[3.8rem] lg:leading-[1.08]">
                {t('heroTitle')}{' '}
                <span className="mt-1 block gradient-text-primary lg:mt-3">
                  {t('heroTitleHighlight')}
                </span>
              </h1>

              <h2 className="mt-2 max-w-xl text-base font-semibold leading-snug text-text-secondary sm:text-3xl lg:mt-6 lg:text-2xl lg:leading-relaxed">
                {t('heroSubtitle')}
                <br />
                <span className="text-white">{t('heroSubtitleHighlight')}</span>
              </h2>
            </div>

            <div className="order-3 text-left lg:order-none">
              <div className="[&>div]:justify-start">
                <HeroActions className="mt-4 lg:mt-10" compact />
              </div>

              <p className="mt-3 flex items-center gap-2 text-xs text-text-muted-aa lg:mt-4 lg:text-sm">
                <Check size={15} className="shrink-0 text-accent lg:h-[17px] lg:w-[17px]" />
                {t('ctaSubtext', { freeCredits })}
              </p>

              <p className="mt-4 max-w-xl text-sm font-light leading-relaxed text-text-secondary sm:text-xl lg:mt-7 lg:text-lg">
                {t('heroDescription')}{' '}
                <span className="font-medium text-white">{t('heroDescriptionHighlight')}</span>
                {t('heroDescriptionMiddle')}{' '}
                <span className="relative font-bold text-white decoration-secondary underline decoration-2 underline-offset-4">
                  {t('heroDescriptionTextSharp')}
                </span>
                .
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-secondary sm:text-base lg:mt-9 lg:gap-x-7 lg:gap-y-3 lg:text-sm">
                {heroTrustItems.map(item => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span className="text-accent">{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="relative order-2 lg:order-none">{heroSlider}</div>
        </div>

        <HeroTrustBar />
      </div>
    </section>
  );
}
