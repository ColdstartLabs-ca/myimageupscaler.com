import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setCheckoutTrackingContext,
  getCheckoutTrackingContext,
  clearCheckoutTrackingContext,
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
});
