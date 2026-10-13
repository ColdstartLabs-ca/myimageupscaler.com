'use client';

import { useRegionTier } from '@client/hooks/useRegionTier';
import { welcomeCreditOfferKey, welcomeCreditsForTier } from '@shared/config/product-capabilities';
import { useTranslations } from 'next-intl';

/**
 * The homepage is force-static, so the credit offer must come from the
 * visitor's tier on the client, not from a request header at build time.
 */
function useCreditOffer(): { credits: number | null; offer: string } {
  const t = useTranslations('homepage');
  const { tier } = useRegionTier();
  const credits = tier ? welcomeCreditsForTier(tier) : null;
  return { credits, offer: t(welcomeCreditOfferKey(credits), { credits: credits ?? 0 }) };
}

export function HeroCreditSubtext(): JSX.Element {
  const t = useTranslations('homepage');
  const { offer } = useCreditOffer();
  return <>{t('ctaSubtext', { creditOffer: offer })}</>;
}

export function HeroFreeToStart(): JSX.Element {
  const { credits, offer } = useCreditOffer();
  return <>{credits === 0 ? offer : 'Free to start'}</>;
}
