import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { mockTrack, mockSavePendingCheckout } = vi.hoisted(() => ({
  mockTrack: vi.fn(),
  mockSavePendingCheckout: vi.fn(),
}));

vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: {
    track: mockTrack,
  },
}));

vi.mock('@client/hooks/useCartPersistence', () => ({
  useCartPersistence: () => ({
    savePendingCheckout: mockSavePendingCheckout,
  }),
}));

const mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

import { useRecoveryCheckout } from '@/client/hooks/useRecoveryCheckout';

describe('useRecoveryCheckout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.delete('recover');
  });

  it('starts in loading state when recover param is present', () => {
    mockSearchParams.set('recover', 'checkout-123');
    global.fetch = vi.fn();

    const { result } = renderHook(() => useRecoveryCheckout());

    expect(result.current.isLoading).toBe(true);
  });

  it('returns not loading when no recover param', () => {
    const { result } = renderHook(() => useRecoveryCheckout());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.isValid).toBe(false);
  });

  it('recovers checkout and saves to localStorage on success', async () => {
    mockSearchParams.set('recover', 'checkout-123');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          cartData: {
            priceId: 'price_123',
            purchaseType: 'subscription',
            planKey: 'pro',
            pricingRegion: 'standard',
            discountPercent: 0,
          },
          discountCode: 'RECOVER-ABC123',
          isValid: true,
        },
      }),
    });

    const { result } = renderHook(() => useRecoveryCheckout());

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.isValid).toBe(true);
    expect(result.current.discountCode).toBe('RECOVER-ABC123');
    expect(mockSavePendingCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        priceId: 'price_123',
        recoveryCode: 'RECOVER-ABC123',
      })
    );
    expect(mockTrack).toHaveBeenCalledWith(
      'checkout_recovered',
      expect.objectContaining({ checkoutId: 'checkout-123' })
    );
  });

  it('handles failed recovery gracefully', async () => {
    mockSearchParams.set('recover', 'checkout-123');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        success: false,
        error: { message: 'Checkout not found' },
      }),
    });

    const { result } = renderHook(() => useRecoveryCheckout());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isSuccess).toBe(false);
    expect(result.current.error).toBe('Checkout not found');
    expect(result.current.isValid).toBe(false);
  });

  it('handles network errors gracefully', async () => {
    mockSearchParams.set('recover', 'checkout-123');
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useRecoveryCheckout());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isSuccess).toBe(false);
    expect(result.current.error).toBe('Network error');
    expect(result.current.isValid).toBe(false);
  });
});
