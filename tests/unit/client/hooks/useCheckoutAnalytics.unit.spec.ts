import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockTrack, mockDetectDeviceType } = vi.hoisted(() => ({
  mockTrack: vi.fn(),
  mockDetectDeviceType: vi.fn().mockReturnValue('desktop'),
}));

vi.mock('@client/analytics', () => ({
  analytics: { track: mockTrack },
}));

vi.mock('@client/utils/detectDeviceType', () => ({
  detectDeviceType: mockDetectDeviceType,
}));

vi.mock('@shared/config/stripe', () => ({
  STRIPE_PRICES: {
    STARTER_MONTHLY: 'price_starter',
    HOBBY_MONTHLY: 'price_hobby',
    PRO_MONTHLY: 'price_pro',
    BUSINESS_MONTHLY: 'price_business',
  },
  determinePlanFromPriceId: vi.fn((priceId: string) => {
    const map: Record<string, string> = {
      price_starter: 'starter',
      price_hobby: 'hobby',
      price_pro: 'pro',
      price_business: 'business',
    };
    return map[priceId] ?? 'hobby';
  }),
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { useCheckoutAnalytics } from '@client/hooks/useCheckoutAnalytics';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const PRICE_ID = 'price_pro';
const PRICING_REGION = 'standard';

describe('useCheckoutAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectDeviceType.mockReturnValue('desktop');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should track checkout_step_viewed with plan_selection on mount', () => {
    renderHook(() => useCheckoutAnalytics(PRICE_ID, PRICING_REGION));

    expect(mockTrack).toHaveBeenCalledWith(
      'checkout_step_viewed',
      expect.objectContaining({ step: 'plan_selection', priceId: PRICE_ID })
    );
  });

  it('should include deviceType in checkout_step_viewed', () => {
    mockDetectDeviceType.mockReturnValue('mobile');
    renderHook(() => useCheckoutAnalytics(PRICE_ID, PRICING_REGION));

    expect(mockTrack).toHaveBeenCalledWith(
      'checkout_step_viewed',
      expect.objectContaining({ deviceType: 'mobile' })
    );
  });

  it('should track checkout_exit_intent on unmount when not completed', () => {
    const { unmount } = renderHook(() => useCheckoutAnalytics(PRICE_ID, PRICING_REGION));

    // Clear the mount-time track call
    mockTrack.mockClear();

    unmount();

    expect(mockTrack).toHaveBeenCalledWith(
      'checkout_exit_intent',
      expect.objectContaining({ priceId: PRICE_ID })
    );
  });

  it('should NOT track checkout_exit_intent on unmount when completed (markCompleted called)', () => {
    const { result, unmount } = renderHook(() => useCheckoutAnalytics(PRICE_ID, PRICING_REGION));

    act(() => {
      result.current.markCompleted();
    });

    mockTrack.mockClear();
    unmount();

    expect(mockTrack).not.toHaveBeenCalledWith('checkout_exit_intent', expect.anything());
  });

  it('should sanitize card numbers in trackError errorMessage', () => {
    const { result } = renderHook(() => useCheckoutAnalytics(PRICE_ID, PRICING_REGION));

    act(() => {
      result.current.trackError('network_error', 'Card 4242424242424242 declined', 'plan_selection');
    });

    const call = mockTrack.mock.calls.find(c => c[0] === 'checkout_error');
    expect(call?.[1].errorMessage).not.toContain('4242424242424242');
    expect(call?.[1].errorMessage).toContain('[CARD]');
  });

  it('should sanitize CVC mentions in trackError errorMessage', () => {
    const { result } = renderHook(() => useCheckoutAnalytics(PRICE_ID, PRICING_REGION));

    act(() => {
      result.current.trackError('network_error', 'Invalid cvv code entered', 'plan_selection');
    });

    const call = mockTrack.mock.calls.find(c => c[0] === 'checkout_error');
    // 'cvv' should be replaced with '[CVC]', raw 'cvv' must not appear
    expect(call?.[1].errorMessage).not.toContain('cvv');
    expect(call?.[1].errorMessage).toContain('[CVC]');
  });

  it('should track checkout_step_time every 5 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });

    renderHook(() => useCheckoutAnalytics(PRICE_ID, PRICING_REGION));
    mockTrack.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(5100);
    });

    expect(mockTrack).toHaveBeenCalledWith(
      'checkout_step_time',
      expect.objectContaining({ priceId: PRICE_ID })
    );
  });

  it('trackCheckoutAbandoned should include pricingRegion', () => {
    const { result } = renderHook(() => useCheckoutAnalytics(PRICE_ID, PRICING_REGION));

    act(() => {
      result.current.trackCheckoutAbandoned('stripe_embed');
    });

    expect(mockTrack).toHaveBeenCalledWith(
      'checkout_abandoned',
      expect.objectContaining({ pricingRegion: PRICING_REGION, priceId: PRICE_ID })
    );
  });
});
