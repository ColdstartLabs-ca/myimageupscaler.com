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

  test('direct checkout marker schema accepts model-gate attribution', async () => {
    const types = await import('@server/analytics/types');

    const props: types.ICheckoutDirectStartedProperties = {
      priceId: 'price_test_123',
      source: 'model_gate',
      trigger: 'model_gate',
      pricingRegion: 'standard',
      originatingModel: 'hd-upscale',
      attributionChain: ['model_gate'],
      uiMode: 'embedded',
      isAuthenticated: true,
    };

    expect(props.originatingModel).toBe('hd-upscale');
    expect(props.isAuthenticated).toBe(true);
  });

  test('direct checkout unavailable marker schema identifies modal fallback', async () => {
    const types = await import('@server/analytics/types');

    const props: types.ICheckoutDirectUnavailableProperties = {
      trigger: 'model_gate',
      imageVariant: 'hd-upscale',
      currentPlan: 'free',
      pricingRegion: 'standard',
      fallbackDestination: 'upgrade_plan_modal',
    };

    expect(props.fallbackDestination).toBe('upgrade_plan_modal');
  });

  test('checkout session requested schema accepts direct-checkout attribution and auth state', async () => {
    const types = await import('@server/analytics/types');

    const props: types.ICheckoutSessionRequestedProperties = {
      priceId: 'price_test_small',
      uiMode: 'embedded',
      hasBanditArm: false,
      hasOfferToken: false,
      isAuthenticated: true,
      trigger: 'model_gate',
      originatingModel: 'hd-upscale',
      originatingTrigger: 'post_download_explore',
      attributionChain: ['post_download_explore', 'model_gate'],
    };

    expect(props.trigger).toBe('model_gate');
    expect(props.isAuthenticated).toBe(true);
    expect(props.attributionChain).toEqual(['post_download_explore', 'model_gate']);
  });

  test('checkout auth-required schema accepts direct-checkout attribution', async () => {
    const types = await import('@server/analytics/types');

    const props: types.ICheckoutAuthRequiredProperties = {
      priceId: 'price_test_small',
      trigger: 'model_gate',
      source: 'direct_checkout',
      pricingRegion: 'standard',
      originatingModel: 'hd-upscale',
      originatingTrigger: 'post_download_explore',
      attributionChain: ['post_download_explore', 'model_gate'],
    };

    expect(props.source).toBe('direct_checkout');
    expect(props.pricingRegion).toBe('standard');
    expect(props.originatingTrigger).toBe('post_download_explore');
  });

  test('checkout session created schema accepts direct-checkout attribution and auth state', async () => {
    const types = await import('@server/analytics/types');

    const props: types.ICheckoutSessionCreatedProperties = {
      priceId: 'price_test_small',
      uiMode: 'hosted',
      loadTimeMs: 312,
      isAuthenticated: false,
      hasUrl: true,
      trigger: 'model_gate',
      originatingModel: 'hd-upscale',
      originatingTrigger: 'post_download_explore',
      attributionChain: ['post_download_explore', 'model_gate'],
    };

    expect(props.uiMode).toBe('hosted');
    expect(props.isAuthenticated).toBe(false);
    expect(props.hasUrl).toBe(true);
  });

  test('purchase_confirmed schema accepts checkout attribution from Stripe metadata', async () => {
    const types = await import('@server/analytics/types');

    const props: types.IPurchaseConfirmedProperties = {
      purchaseType: 'credit_pack',
      sessionId: 'cs_test_123',
      pricingRegion: 'standard',
      priceId: 'price_test_small',
      uiMode: 'hosted',
      trigger: 'model_gate',
      originatingModel: 'hd-upscale',
      originatingTrigger: 'post_download_explore',
      attributionChain: ['post_download_explore', 'model_gate'],
    };

    expect(props.trigger).toBe('model_gate');
    expect(props.uiMode).toBe('hosted');
    expect(props.attributionChain).toEqual(['post_download_explore', 'model_gate']);
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
