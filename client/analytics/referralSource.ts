import type { IReferralSource } from '@server/analytics/types';

const REFERRAL_SOURCE_STORAGE_KEY = 'miu_referral_source';
const VALID_SOURCES: readonly IReferralSource[] = [
  'chatgpt',
  'perplexity',
  'claude',
  'google_sge',
  'google',
  'direct',
  'other',
];

export function classifyReferralSource(
  referrer: string | null,
  utmSource: string | null
): IReferralSource {
  const normalizedUtm = utmSource?.toLowerCase();
  if (
    normalizedUtm &&
    ['chatgpt', 'perplexity', 'claude', 'google_sge', 'google'].includes(normalizedUtm)
  ) {
    return normalizedUtm as IReferralSource;
  }

  if (referrer) {
    try {
      const domain = new URL(referrer).hostname.toLowerCase();
      if (
        domain === 'chatgpt.com' ||
        domain.endsWith('.chatgpt.com') ||
        domain === 'chat.openai.com' ||
        domain.endsWith('.chat.openai.com')
      ) {
        return 'chatgpt';
      }
      if (domain === 'perplexity.ai' || domain.endsWith('.perplexity.ai')) return 'perplexity';
      if (domain === 'claude.ai' || domain.endsWith('.claude.ai')) return 'claude';
      if (domain === 'google.com' || domain.endsWith('.google.com')) return 'google';
    } catch {
      return 'other';
    }
  }

  return referrer ? 'other' : 'direct';
}

export function getBrowserReferralSource(utmSource?: string | null): IReferralSource | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = globalThis.localStorage.getItem(
      REFERRAL_SOURCE_STORAGE_KEY
    ) as IReferralSource | null;
    if (stored && VALID_SOURCES.includes(stored)) return stored;

    const queryUtm = new URLSearchParams(window.location.search).get('utm_source');
    const referralSource = classifyReferralSource(document.referrer || null, utmSource ?? queryUtm);
    globalThis.localStorage.setItem(REFERRAL_SOURCE_STORAGE_KEY, referralSource);
    return referralSource;
  } catch {
    return classifyReferralSource(document.referrer || null, utmSource ?? null);
  }
}
