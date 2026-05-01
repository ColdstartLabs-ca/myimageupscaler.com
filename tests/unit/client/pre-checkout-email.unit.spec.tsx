import React, { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';

const { mockTrack } = vi.hoisted(() => ({
  mockTrack: vi.fn(),
}));

vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: {
    track: mockTrack,
  },
}));

import { PreCheckoutEmailCapture } from '@/client/components/features/checkout/PreCheckoutEmailCapture';

describe('pre-checkout email capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('tracks the shown event once on mount in StrictMode', async () => {
    const onShown = vi.fn();

    render(
      <StrictMode>
        <PreCheckoutEmailCapture source="pricing_page" planId="pro" onShown={onShown} />
      </StrictMode>
    );

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith('pre_checkout_email_shown', {
        source: 'pricing_page',
        hasPlanId: true,
      });
    });

    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(onShown).toHaveBeenCalledTimes(1);
  });

  it('persists saved emails in hook state and storage', async () => {
    const { usePreCheckoutEmail } = await import('@/client/hooks/usePreCheckoutEmail');
    const { result } = renderHook(() => usePreCheckoutEmail());

    act(() => {
      result.current.saveEmail('stored@example.com', true);
    });

    await waitFor(() => {
      expect(result.current.email).toBe('stored@example.com');
    });

    expect(result.current.hasEmail).toBe(true);
    expect(mockTrack).toHaveBeenCalledWith('pre_checkout_email_captured', {
      consent: true,
    });
  });
});
