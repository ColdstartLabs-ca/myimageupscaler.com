import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyReferralSource, getBrowserReferralSource } from '@client/analytics/referralSource';

describe('browser referral attribution', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });

  it.each([
    ['https://chatgpt.com/c/abc', 'chatgpt'],
    ['https://www.perplexity.ai/search', 'perplexity'],
    ['https://claude.ai/chat/abc', 'claude'],
    ['https://www.google.com/search?q=upscaler', 'google'],
  ])('should classify %s as %s', (referrer, expected) => {
    expect(classifyReferralSource(referrer, null)).toBe(expected);
  });

  it('should prefer an explicit AI UTM source', () => {
    expect(classifyReferralSource('https://google.com', 'ChatGPT')).toBe('chatgpt');
  });

  it('should preserve first-touch attribution in browser storage', () => {
    localStorage.setItem('miu_referral_source', 'perplexity');
    expect(getBrowserReferralSource('chatgpt')).toBe('perplexity');
  });
});
