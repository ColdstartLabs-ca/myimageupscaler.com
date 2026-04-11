import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const mockUseRegionTier = vi.fn();
vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: () => mockUseRegionTier(),
}));

const mockOpenAuthModal = vi.fn();
vi.mock('@client/store/modalStore', () => ({
  useModalStore: () => ({ openAuthModal: mockOpenAuthModal }),
}));

const mockUseUserStore = vi.fn();
vi.mock('@client/store/userStore', () => ({
  useUserStore: () => mockUseUserStore(),
}));

const mockPrepareAuthRedirect = vi.fn();
vi.mock('@client/utils/authRedirectManager', () => ({
  prepareAuthRedirect: (...args: unknown[]) => mockPrepareAuthRedirect(...args),
}));

vi.mock('lucide-react', async importOriginal => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return { ...actual };
});

import { GuestUpscaler } from '@/app/(pseo)/_components/tools/GuestUpscaler';

describe('GuestUpscaler CTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRegionTier.mockReturnValue({ isPaywalled: false, isLoading: false });
    mockUseUserStore.mockReturnValue({ isAuthenticated: false });
  });

  it('shows paywall state when region is paywalled', () => {
    mockUseRegionTier.mockReturnValue({ isPaywalled: true, isLoading: false });

    render(React.createElement(GuestUpscaler));

    expect(screen.getByText('Subscription Required')).toBeTruthy();
    expect(screen.getByText('View plans')).toBeTruthy();
  });

  it('opens auth modal for unauthenticated paywalled users', () => {
    mockUseRegionTier.mockReturnValue({ isPaywalled: true, isLoading: false });

    render(React.createElement(GuestUpscaler));
    fireEvent.click(screen.getByText('View plans'));

    expect(mockPrepareAuthRedirect).toHaveBeenCalledWith('paywall_pricing', { returnTo: '/pricing' });
    expect(mockOpenAuthModal).toHaveBeenCalledWith('register');
  });

  it('links standard-region visitors to account creation', () => {
    render(React.createElement(GuestUpscaler));

    expect(screen.queryByText('Subscription Required')).toBeNull();
    expect(screen.getByText('Create A Free Account To Upscale')).toBeTruthy();
    expect(screen.getByText('Create free account')).toBeTruthy();
  });

  it('shows workspace CTA for authenticated users', () => {
    mockUseUserStore.mockReturnValue({ isAuthenticated: true });

    render(React.createElement(GuestUpscaler));

    expect(screen.getByText('Open The Workspace')).toBeTruthy();
    expect(screen.getByText('Open workspace')).toBeTruthy();
  });
});
