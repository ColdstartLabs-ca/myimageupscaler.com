import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setCheckoutTrackingContext,
  getCheckoutTrackingContext,
  clearCheckoutTrackingContext,
  getCheckoutFunnelMetadata,
} from '@client/utils/checkoutTrackingContext';

const SESSION_KEY = 'miu_checkout_tracking_context';

function writeRawContext(data: object) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

describe('checkoutTrackingContext — attribution chain', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  test('should append originatingTrigger to attributionChain', () => {
    setCheckoutTrackingContext({ originatingTrigger: 'celebration_explore' });
    const ctx = getCheckoutTrackingContext();

    expect(ctx).not.toBeNull();
    expect(ctx?.originatingTrigger).toBe('celebration_explore');
    expect(ctx?.attributionChain).toEqual(['celebration_explore']);
  });

  test('should accumulate attributionChain across multiple calls', () => {
    setCheckoutTrackingContext({ originatingTrigger: 'celebration_explore' });
    setCheckoutTrackingContext({ originatingTrigger: 'post_download_explore' });

    const ctx = getCheckoutTrackingContext();
    expect(ctx?.attributionChain).toEqual(['celebration_explore', 'post_download_explore']);
    expect(ctx?.originatingTrigger).toBe('post_download_explore');
  });

  test('should cap attributionChain length at 5', () => {
    for (let i = 0; i < 7; i++) {
      setCheckoutTrackingContext({ originatingTrigger: 'celebration_explore' });
    }

    const ctx = getCheckoutTrackingContext();
    expect(ctx?.attributionChain).toHaveLength(5);
  });

  test('should expire after 30 min', () => {
    setCheckoutTrackingContext({ originatingTrigger: 'celebration_explore' });

    vi.advanceTimersByTime(31 * 60 * 1000);

    const ctx = getCheckoutTrackingContext();
    expect(ctx).toBeNull();
  });

  test('should preserve existing originatingTrigger if already set and new call has none', () => {
    setCheckoutTrackingContext({ originatingTrigger: 'celebration_explore' });
    setCheckoutTrackingContext({ trigger: 'model_gate' });

    const ctx = getCheckoutTrackingContext();
    expect(ctx?.originatingTrigger).toBe('celebration_explore');
    expect(ctx?.trigger).toBe('model_gate');
  });

  test('should return null when no context has been set', () => {
    const ctx = getCheckoutTrackingContext();
    expect(ctx).toBeNull();
  });

  test('should allow callers to persist a full assisted attribution chain', () => {
    setCheckoutTrackingContext({ originatingTrigger: 'celebration_explore' });
    setCheckoutTrackingContext({
      trigger: 'model_gate',
      attributionChain: ['celebration_explore', 'model_gate'],
    });

    const ctx = getCheckoutTrackingContext();
    expect(ctx?.attributionChain).toEqual(['celebration_explore', 'model_gate']);
  });

  test('should clear all context including attributionChain', () => {
    setCheckoutTrackingContext({ originatingTrigger: 'celebration_explore' });
    clearCheckoutTrackingContext();

    const ctx = getCheckoutTrackingContext();
    expect(ctx).toBeNull();
  });

  test('should preserve experiment metadata', () => {
    setCheckoutTrackingContext({
      trigger: 'model_gate',
      experimentKey: 'model_gate_purchase_path',
      experimentContextKey: 'global',
      experimentArmId: 20,
      experimentArmKey: 'direct_small_pack_control',
      experimentAssignmentKey: 'session:abc',
    });

    const ctx = getCheckoutTrackingContext();
    expect(ctx).toEqual(
      expect.objectContaining({
        experimentKey: 'model_gate_purchase_path',
        experimentContextKey: 'global',
        experimentArmId: 20,
        experimentArmKey: 'direct_small_pack_control',
        experimentAssignmentKey: 'session:abc',
      })
    );
  });

  test('should create one stable non-PII funnel attempt at the first monetization surface', () => {
    const first = setCheckoutTrackingContext({
      trigger: 'insufficient_credits',
      entrySurface: 'insufficient_credits',
    });
    const second = setCheckoutTrackingContext({
      trigger: 'purchase_modal',
    });

    expect(first?.funnelAttemptId).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(first?.funnelAttemptId).not.toContain('user');
    expect(second?.funnelAttemptId).toBe(first?.funnelAttemptId);
    expect(second?.entrySurface).toBe('insufficient_credits');
  });

  test('should not silently replace an existing checkout-owning experiment assignment', () => {
    setCheckoutTrackingContext({
      trigger: 'model_gate',
      experimentKey: 'model_gate_purchase_path',
      experimentContextKey: 'global',
      experimentArmId: 20,
      experimentArmKey: 'direct_small_pack_control',
      experimentAssignmentKey: 'session:model-gate',
    });

    const context = setCheckoutTrackingContext({
      trigger: 'purchase_modal',
      experimentKey: 'purchase_modal_default_selection',
      experimentContextKey: 'global',
      experimentArmId: 10,
      experimentArmKey: 'current_modal_control',
      experimentAssignmentKey: 'session:purchase-modal',
    });

    expect(context).toEqual(
      expect.objectContaining({
        experimentKey: 'model_gate_purchase_path',
        experimentArmId: 20,
        experimentArmKey: 'direct_small_pack_control',
        experimentAssignmentKey: 'session:model-gate',
      })
    );
  });

  test('should keep one attempt and assignment when the same visible surface rerenders', () => {
    const first = setCheckoutTrackingContext({
      entrySurface: 'purchase_modal',
      trigger: 'purchase_modal',
      experimentKey: 'purchase_modal_default_selection',
      experimentContextKey: 'global',
      experimentArmId: 10,
      experimentArmKey: 'compact_credit_picker',
      experimentAssignmentKey: 'session:visible',
    });
    const rerender = setCheckoutTrackingContext({
      entrySurface: 'purchase_modal',
      trigger: 'purchase_modal',
      experimentKey: 'purchase_modal_default_selection',
      experimentContextKey: 'global',
      experimentArmId: 11,
      experimentArmKey: 'different_arm',
      experimentAssignmentKey: 'session:changed',
    });

    expect(rerender?.funnelAttemptId).toBe(first?.funnelAttemptId);
    expect(rerender?.experimentAssignmentKey).toBe('session:visible');
    expect(rerender?.experimentArmId).toBe(10);
  });

  test('should preserve acquisition and landing-page fields through checkout', () => {
    vi.mocked(window.localStorage.getItem).mockImplementation(key =>
      key === 'miu_first_touch_utm'
        ? JSON.stringify({
            utmSource: 'google',
            utmMedium: 'cpc',
            landingPage: '/tools/ai-image-upscaler',
          })
        : null
    );
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

    expect(getCheckoutFunnelMetadata()).toEqual({
      funnel_schema_version: '1',
      first_touch_source: 'google',
      first_touch_medium: 'cpc',
      first_touch_landing_page: '/tools/ai-image-upscaler',
      landing_page_family: 'tools',
      device_type: 'mobile',
      is_pseo_landing: 'true',
    });
  });
});
