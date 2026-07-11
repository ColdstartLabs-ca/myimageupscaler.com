import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { trackMock, upgradeMock, contextMock, checkoutContextMock } = vi.hoisted(() => ({
  trackMock: vi.fn(),
  upgradeMock: vi.fn(),
  contextMock: vi.fn(),
  checkoutContextMock: vi.fn(),
}));

vi.mock('@client/analytics', () => ({ analytics: { track: trackMock } }));
vi.mock('@client/utils/purchaseModalDefaults', () => ({
  setRepeatPurchaseContext: contextMock,
}));
vi.mock('@client/utils/checkoutTrackingContext', () => ({
  setCheckoutTrackingContext: checkoutContextMock,
}));
vi.mock('@server/supabase/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }),
    },
  },
}));
vi.mock('@client/store/userStore', () => ({
  useCredits: () => ({ total: 3 }),
  useUserStore: () => ({
    isLoading: false,
    error: null,
    invalidate: vi.fn(),
    user: { id: 'user-1', profile: {} },
    isAuthenticated: true,
    lastFetched: 1,
  }),
}));
vi.mock('@client/components/ui/SmartTooltip', () => ({
  SmartTooltip: ({
    content,
    children,
  }: {
    content: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div>
      {children}
      {content}
    </div>
  ),
}));

import { CreditsDisplay } from '@client/components/stripe/CreditsDisplay';

describe('CreditsDisplay repeat purchase prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ repeatPackKey: 'medium' }),
      })
    );
  });

  it('shows the prior pack at low balance and tracks the short-flow click', async () => {
    render(<CreditsDisplay onUpgrade={upgradeMock} />);
    const prompt = await screen.findByRole('button', { name: /buy medium pack again/i });
    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith('repeat_purchase_prompt_shown', {
        packKey: 'medium',
        creditBalance: 3,
      })
    );
    expect(contextMock).toHaveBeenCalledWith('user-1', 'medium');
    fireEvent.click(prompt);
    expect(trackMock).toHaveBeenCalledWith('repeat_purchase_prompt_clicked', {
      packKey: 'medium',
      creditBalance: 3,
    });
    expect(checkoutContextMock).toHaveBeenCalledWith({ trigger: 'repeat_purchase_prompt' });
    expect(upgradeMock).toHaveBeenCalledTimes(1);
  });
});
