import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setCheckoutTrackingContext,
  getCheckoutTrackingContext,
  clearCheckoutTrackingContext,
} from '@client/utils/checkoutTrackingContext';

describe('upgrade-funnel-attribution', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  test('should propagate originatingTrigger from celebration_explore through model_gate', () => {
    // Step 1: celebration_explore sets the originating trigger
    setCheckoutTrackingContext({ originatingTrigger: 'celebration_explore' });

    // Step 2: model_gate click reads the originating trigger
    const ctxBeforeGate = getCheckoutTrackingContext();
    expect(ctxBeforeGate?.originatingTrigger).toBe('celebration_explore');

    // Step 3: model_gate sets its own trigger, preserving originatingTrigger
    setCheckoutTrackingContext({ trigger: 'model_gate' });

    const ctxAfterGate = getCheckoutTrackingContext();
    expect(ctxAfterGate?.trigger).toBe('model_gate');
    expect(ctxAfterGate?.originatingTrigger).toBe('celebration_explore');
  });

  test('should propagate originatingTrigger from post_download_explore through model_gate', () => {
    setCheckoutTrackingContext({ originatingTrigger: 'post_download_explore' });
    setCheckoutTrackingContext({ trigger: 'model_gate' });

    const ctx = getCheckoutTrackingContext();
    expect(ctx?.trigger).toBe('model_gate');
    expect(ctx?.originatingTrigger).toBe('post_download_explore');
  });

  test('should build attributionChain across multi-step funnel', () => {
    setCheckoutTrackingContext({ originatingTrigger: 'celebration_explore' });
    setCheckoutTrackingContext({
      trigger: 'model_gate',
      attributionChain: ['celebration_explore', 'model_gate'],
    });

    const ctx = getCheckoutTrackingContext();
    expect(ctx?.attributionChain).toEqual(['celebration_explore', 'model_gate']);
    expect(ctx?.originatingTrigger).toBe('celebration_explore');
    expect(ctx?.trigger).toBe('model_gate');
  });

  test('attribution chain should not exceed 5 entries', () => {
    const triggers = [
      'celebration_explore',
      'post_download_explore',
      'celebration_explore',
      'post_download_explore',
      'celebration_explore',
      'post_download_explore',
    ] as const;

    for (const t of triggers) {
      setCheckoutTrackingContext({ originatingTrigger: t });
    }

    const ctx = getCheckoutTrackingContext();
    expect(ctx?.attributionChain).toHaveLength(5);
  });

  test('checkout_opened event schema accepts originatingTrigger and attributionChain', async () => {
    const types = await import('@server/analytics/types');

    const props: types.ICheckoutOpenedProperties = {
      priceId: 'price_test_123',
      source: 'model_gate',
      originatingTrigger: 'celebration_explore',
      attributionChain: ['celebration_explore', 'model_gate'],
    };

    expect(props.originatingTrigger).toBe('celebration_explore');
    expect(props.attributionChain).toEqual(['celebration_explore', 'model_gate']);
  });

  test('upgrade_prompt_clicked event schema accepts originatingTrigger', async () => {
    const types = await import('@server/analytics/types');

    const props: types.IUpgradePromptClickedProperties = {
      trigger: 'model_gate',
      destination: 'checkout_direct',
      currentPlan: 'free',
      pricingRegion: 'standard',
      originatingTrigger: 'celebration_explore',
    };

    expect(props.originatingTrigger).toBe('celebration_explore');
  });

  test('context expires after 30 minutes clearing attribution', () => {
    setCheckoutTrackingContext({ originatingTrigger: 'celebration_explore' });
    setCheckoutTrackingContext({ trigger: 'model_gate' });

    vi.advanceTimersByTime(31 * 60 * 1000);

    const ctx = getCheckoutTrackingContext();
    expect(ctx).toBeNull();
  });

  test('upgrade prompt trigger union matches the supported trigger list', async () => {
    const types = await import('@server/analytics/types');

    const validTriggers: types.IUpgradePromptTrigger[] = [
      'premium_upsell',
      'out_of_credits',
      'insufficient_credits',
      'model_gate',
      'after_upscale',
      'after_download',
      'post_download_explore',
      'celebration_explore',
      'after_batch',
      'upgrade_card',
    ];

    expect(validTriggers).toHaveLength(10);
  });

  test('clearCheckoutTrackingContext removes attribution data', () => {
    setCheckoutTrackingContext({ originatingTrigger: 'celebration_explore' });
    clearCheckoutTrackingContext();

    expect(getCheckoutTrackingContext()).toBeNull();
  });
});
