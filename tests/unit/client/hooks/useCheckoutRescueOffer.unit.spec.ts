import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockGetStoredOffer,
  mockStoreOffer,
  mockClearStoredOffer,
  mockShouldShow,
  mockCreateRescueOffer,
} = vi.hoisted(() => ({
  mockGetStoredOffer: vi.fn().mockReturnValue(null),
  mockStoreOffer: vi.fn(),
  mockClearStoredOffer: vi.fn(),
  mockShouldShow: vi.fn().mockReturnValue(false),
  mockCreateRescueOffer: vi.fn(),
}));

vi.mock('@client/utils/checkoutRescueOfferStorage', () => ({
  getStoredCheckoutRescueOffer: mockGetStoredOffer,
  storeCheckoutRescueOffer: mockStoreOffer,
  clearStoredCheckoutRescueOffer: mockClearStoredOffer,
}));

vi.mock('@client/utils/checkoutRescueOfferVisibility', () => ({
  shouldShowCheckoutRescueOffer: mockShouldShow,
}));

vi.mock('@client/services/stripeService', () => ({
  StripeService: {
    createCheckoutRescueOffer: mockCreateRescueOffer,
  },
}));

// ---------------------------------------------------------------------------
// Import under test (after all mocks)
// ---------------------------------------------------------------------------
import { useCheckoutRescueOffer } from '@client/hooks/useCheckoutRescueOffer';
import type { ICheckoutRescueOffer } from '@shared/types/checkout-offer';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PRICE_ID = 'price_test_123';

const mockOffer: ICheckoutRescueOffer = {
  offerToken: 'tok_rescue_abc',
  priceId: PRICE_ID,
  discountPercent: 20,
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCheckoutRescueOffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStoredOffer.mockReturnValue(null);
    mockShouldShow.mockReturnValue(false);
  });

  it('should hydrate rescueOffer from sessionStorage on mount', () => {
    mockGetStoredOffer.mockReturnValue(mockOffer);
    const { result } = renderHook(() => useCheckoutRescueOffer(PRICE_ID));
    expect(result.current.rescueOffer).toEqual(mockOffer);
  });

  it('should set appliedOfferToken when claimOffer is called', () => {
    mockGetStoredOffer.mockReturnValue(mockOffer);
    const { result } = renderHook(() => useCheckoutRescueOffer(PRICE_ID));

    const rescueOfferAppliedRef = { current: false };
    const resetLoadStart = vi.fn();
    const retry = vi.fn();

    act(() => {
      result.current.claimOffer({ rescueOfferAppliedRef, resetLoadStart, retry });
    });

    expect(result.current.appliedOfferToken).toBe(mockOffer.offerToken);
  });

  it('should call dismissOffer callbacks', () => {
    const { result } = renderHook(() => useCheckoutRescueOffer(PRICE_ID));

    const trackCheckoutAbandoned = vi.fn();
    const onClose = vi.fn();

    act(() => {
      result.current.dismissOffer({ trackCheckoutAbandoned, onClose });
    });

    expect(trackCheckoutAbandoned).toHaveBeenCalledWith('stripe_embed');
    expect(onClose).toHaveBeenCalled();
  });

  it('should return true from tryShowRescueOffer when eligible and stored offer exists', async () => {
    mockGetStoredOffer.mockReturnValue(mockOffer);
    mockShouldShow.mockReturnValue(true);

    const { result } = renderHook(() => useCheckoutRescueOffer(PRICE_ID));

    const exitIntentTrackedRef = { current: false };
    const trackExitIntent = vi.fn();

    let returned: boolean = false;
    await act(async () => {
      returned = await result.current.tryShowRescueOffer({
        step: 'stripe_embed',
        rescueOfferEligible: true,
        rescueOfferApplied: false,
        engagementDiscountApplied: false,
        method: 'close_button',
        exitIntentTrackedRef,
        trackExitIntent,
      });
    });

    expect(returned).toBe(true);
    expect(result.current.showRescueOffer).toBe(true);
    expect(trackExitIntent).toHaveBeenCalled();
  });

  it('should return false from tryShowRescueOffer when not eligible', async () => {
    mockShouldShow.mockReturnValue(false);

    const { result } = renderHook(() => useCheckoutRescueOffer(PRICE_ID));

    const exitIntentTrackedRef = { current: false };
    const trackExitIntent = vi.fn();

    let returned: boolean = true;
    await act(async () => {
      returned = await result.current.tryShowRescueOffer({
        step: 'stripe_embed',
        rescueOfferEligible: false,
        rescueOfferApplied: false,
        engagementDiscountApplied: false,
        method: 'close_button',
        exitIntentTrackedRef,
        trackExitIntent,
      });
    });

    expect(returned).toBe(false);
    expect(result.current.showRescueOffer).toBe(false);
  });

  it('should call createCheckoutRescueOffer when no stored offer', async () => {
    mockGetStoredOffer.mockReturnValue(null);
    mockShouldShow.mockReturnValue(true);
    mockCreateRescueOffer.mockResolvedValue(mockOffer);

    const { result } = renderHook(() => useCheckoutRescueOffer(PRICE_ID));

    const exitIntentTrackedRef = { current: false };
    const trackExitIntent = vi.fn();

    let returned: boolean = false;
    await act(async () => {
      returned = await result.current.tryShowRescueOffer({
        step: 'stripe_embed',
        rescueOfferEligible: true,
        rescueOfferApplied: false,
        engagementDiscountApplied: false,
        method: 'close_button',
        exitIntentTrackedRef,
        trackExitIntent,
      });
    });

    expect(mockCreateRescueOffer).toHaveBeenCalledWith(PRICE_ID);
    expect(returned).toBe(true);
  });

  it('should return false and not show offer when createCheckoutRescueOffer throws', async () => {
    mockGetStoredOffer.mockReturnValue(null);
    mockShouldShow.mockReturnValue(true);
    mockCreateRescueOffer.mockRejectedValue(new Error('API error'));

    const { result } = renderHook(() => useCheckoutRescueOffer(PRICE_ID));

    const exitIntentTrackedRef = { current: false };
    const trackExitIntent = vi.fn();

    let returned: boolean = true;
    await act(async () => {
      returned = await result.current.tryShowRescueOffer({
        step: 'stripe_embed',
        rescueOfferEligible: true,
        rescueOfferApplied: false,
        engagementDiscountApplied: false,
        method: 'close_button',
        exitIntentTrackedRef,
        trackExitIntent,
      });
    });

    expect(returned).toBe(false);
    expect(result.current.showRescueOffer).toBe(false);
  });

  it('should clear offer on clearOffer()', () => {
    mockGetStoredOffer.mockReturnValue(mockOffer);
    const { result } = renderHook(() => useCheckoutRescueOffer(PRICE_ID));

    // First set an applied token
    const rescueOfferAppliedRef = { current: false };
    act(() => {
      result.current.claimOffer({ rescueOfferAppliedRef, resetLoadStart: vi.fn(), retry: vi.fn() });
    });
    expect(result.current.appliedOfferToken).toBe(mockOffer.offerToken);

    // Now clear
    act(() => {
      result.current.clearOffer();
    });

    expect(result.current.appliedOfferToken).toBeNull();
    expect(mockClearStoredOffer).toHaveBeenCalledWith(PRICE_ID);
  });
});
