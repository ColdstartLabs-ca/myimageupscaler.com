/**
 * Unit tests for useUpgradeAbandonmentDetector (Phase 5 — abandonment recovery)
 *
 * Verifies:
 * - Timer starts on upgrade_prompt_clicked
 * - Timer is cancelled on checkout_opened
 * - Eligibility endpoint called after 10-min timeout
 * - Hook is a no-op for paid users
 * - Fires only once per session (sessionStorage guard)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockOnAnalyticsEvent,
  mockOffAnalyticsEvent,
  mockSetIsEligible,
  mockSetOffer,
  mockSetCountdownEndTime,
  mockSetShowToast,
  mockSetHasCheckedEligibility,
  mockSetDiscountSource,
  mockFetch,
  mockGetSession,
} = vi.hoisted(() => ({
  mockOnAnalyticsEvent: vi.fn(),
  mockOffAnalyticsEvent: vi.fn(),
  mockSetIsEligible: vi.fn(),
  mockSetOffer: vi.fn(),
  mockSetCountdownEndTime: vi.fn(),
  mockSetShowToast: vi.fn(),
  mockSetHasCheckedEligibility: vi.fn(),
  mockSetDiscountSource: vi.fn(),
  mockFetch: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('@client/analytics/analyticsClient', () => ({
  onAnalyticsEvent: mockOnAnalyticsEvent,
  offAnalyticsEvent: mockOffAnalyticsEvent,
}));

vi.mock('@client/store/engagementDiscountStore', () => ({
  useEngagementDiscountStore: () => ({
    setIsEligible: mockSetIsEligible,
    setOffer: mockSetOffer,
    setCountdownEndTime: mockSetCountdownEndTime,
    setShowToast: mockSetShowToast,
    setHasCheckedEligibility: mockSetHasCheckedEligibility,
    setDiscountSource: mockSetDiscountSource,
    wasDismissed: false,
    hasCheckedEligibility: false,
  }),
}));

vi.mock('@shared/utils/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
    },
  }),
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { useUpgradeAbandonmentDetector } from '@client/hooks/useUpgradeAbandonmentDetector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ABANDONMENT_FIRED_KEY = 'abandonment_detector_fired';

const ELIGIBLE_RESPONSE = {
  eligible: true,
  discountExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  discountPercent: 20,
  targetPackKey: 'starter',
  originalPriceCents: 1000,
  discountedPriceCents: 800,
  couponId: 'coupon_test',
};

const NOT_ELIGIBLE_RESPONSE = { eligible: false };

/**
 * Helper: extract the registered listener for a given analytics event.
 * mockOnAnalyticsEvent is called as onAnalyticsEvent(eventName, handler).
 */
function getRegisteredListener(
  eventName: 'upgrade_prompt_clicked' | 'checkout_opened'
): (() => void) | undefined {
  const call = mockOnAnalyticsEvent.mock.calls.find(c => c[0] === eventName);
  return call?.[1] as (() => void) | undefined;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useUpgradeAbandonmentDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Clear session guard
    sessionStorage.removeItem(ABANDONMENT_FIRED_KEY);

    // Default: authenticated session
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test_token' } },
    });

    // Default: eligible response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ELIGIBLE_RESPONSE,
    });

    // Patch global fetch
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    sessionStorage.removeItem(ABANDONMENT_FIRED_KEY);
  });

  // -------------------------------------------------------------------------
  // Timer start
  // -------------------------------------------------------------------------

  describe('should start timer on upgrade_prompt_clicked', () => {
    it('registers upgrade_prompt_clicked listener on mount', () => {
      renderHook(() => useUpgradeAbandonmentDetector({ isFreeUser: true }));

      expect(mockOnAnalyticsEvent).toHaveBeenCalledWith(
        'upgrade_prompt_clicked',
        expect.any(Function)
      );
    });

    it('starts a 10-minute timeout when upgrade_prompt_clicked fires', () => {
      renderHook(() => useUpgradeAbandonmentDetector({ isFreeUser: true }));

      const listener = getRegisteredListener('upgrade_prompt_clicked');
      expect(listener).toBeDefined();

      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      listener!();

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 10 * 60 * 1000);
    });
  });

  // -------------------------------------------------------------------------
  // Timer cancellation
  // -------------------------------------------------------------------------

  describe('should cancel timer on checkout_opened', () => {
    it('registers checkout_opened listener on mount', () => {
      renderHook(() => useUpgradeAbandonmentDetector({ isFreeUser: true }));

      expect(mockOnAnalyticsEvent).toHaveBeenCalledWith('checkout_opened', expect.any(Function));
    });

    it('clears the timeout when checkout_opened fires', () => {
      renderHook(() => useUpgradeAbandonmentDetector({ isFreeUser: true }));

      const upgradeListener = getRegisteredListener('upgrade_prompt_clicked');
      const checkoutListener = getRegisteredListener('checkout_opened');

      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      // Start the timer
      upgradeListener!();

      // Cancel it
      checkoutListener!();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Eligibility endpoint after timeout
  // -------------------------------------------------------------------------

  describe('should call eligibility endpoint after 10 min timeout', () => {
    it('calls /api/engagement-discount/eligibility when timeout fires', async () => {
      renderHook(() => useUpgradeAbandonmentDetector({ isFreeUser: true, userId: 'user_123' }));

      const upgradeListener = getRegisteredListener('upgrade_prompt_clicked');
      upgradeListener!();

      // Fast-forward 10 minutes
      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/engagement-discount/eligibility',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Authorization: 'Bearer test_token' }),
        })
      );
    });

    it('shows the discount toast when eligible response received', async () => {
      renderHook(() => useUpgradeAbandonmentDetector({ isFreeUser: true, userId: 'user_123' }));

      const upgradeListener = getRegisteredListener('upgrade_prompt_clicked');
      upgradeListener!();

      await vi.runAllTimersAsync();

      expect(mockSetDiscountSource).toHaveBeenCalledWith('abandonment');
      expect(mockSetShowToast).toHaveBeenCalledWith(true);
      expect(mockSetIsEligible).toHaveBeenCalledWith(true);
    });

    it('does NOT show toast when eligibility response is not eligible', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => NOT_ELIGIBLE_RESPONSE,
      });

      renderHook(() => useUpgradeAbandonmentDetector({ isFreeUser: true }));

      const upgradeListener = getRegisteredListener('upgrade_prompt_clicked');
      upgradeListener!();

      await vi.runAllTimersAsync();

      expect(mockSetShowToast).not.toHaveBeenCalled();
      expect(mockSetIsEligible).toHaveBeenCalledWith(false);
    });

    it('does NOT call endpoint if response is not ok', async () => {
      mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });

      renderHook(() => useUpgradeAbandonmentDetector({ isFreeUser: true }));

      const upgradeListener = getRegisteredListener('upgrade_prompt_clicked');
      upgradeListener!();

      await vi.runAllTimersAsync();

      expect(mockSetShowToast).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Paid-user guard
  // -------------------------------------------------------------------------

  describe('should not run for paid users', () => {
    it('does NOT register listeners when isFreeUser=false', () => {
      renderHook(() => useUpgradeAbandonmentDetector({ isFreeUser: false }));

      expect(mockOnAnalyticsEvent).not.toHaveBeenCalled();
    });

    it('does NOT call fetch when isFreeUser=false', async () => {
      renderHook(() => useUpgradeAbandonmentDetector({ isFreeUser: false }));

      await vi.runAllTimersAsync();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Session guard (once per session)
  // -------------------------------------------------------------------------

  describe('should fire only once per session', () => {
    it('does NOT register listeners when session key already set', () => {
      sessionStorage.setItem(ABANDONMENT_FIRED_KEY, '1');

      renderHook(() => useUpgradeAbandonmentDetector({ isFreeUser: true }));

      expect(mockOnAnalyticsEvent).not.toHaveBeenCalled();
    });

    it('sets the session key after timeout fires', async () => {
      renderHook(() => useUpgradeAbandonmentDetector({ isFreeUser: true }));

      const upgradeListener = getRegisteredListener('upgrade_prompt_clicked');
      upgradeListener!();

      await vi.runAllTimersAsync();

      expect(sessionStorage.getItem(ABANDONMENT_FIRED_KEY)).toBe('1');
    });

    it('does NOT call fetch on second timeout if session key already set', async () => {
      // Simulate the key being set by a prior fire this session
      sessionStorage.setItem(ABANDONMENT_FIRED_KEY, '1');

      renderHook(() => useUpgradeAbandonmentDetector({ isFreeUser: true }));

      // Listeners should not have been registered
      expect(mockOnAnalyticsEvent).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup on unmount
  // -------------------------------------------------------------------------

  describe('cleanup', () => {
    it('unregisters listeners on unmount', () => {
      const { unmount } = renderHook(() => useUpgradeAbandonmentDetector({ isFreeUser: true }));

      unmount();

      expect(mockOffAnalyticsEvent).toHaveBeenCalledWith(
        'upgrade_prompt_clicked',
        expect.any(Function)
      );
      expect(mockOffAnalyticsEvent).toHaveBeenCalledWith('checkout_opened', expect.any(Function));
    });
  });
});
