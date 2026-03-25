import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock guest-fingerprint
vi.mock('@/client/utils/guest-fingerprint', () => ({
  getVisitorId: vi.fn().mockResolvedValue('test-visitor-id'),
  getGuestUsage: vi.fn().mockReturnValue({ count: 0, date: new Date().toISOString() }),
  canProcessAsGuest: vi.fn().mockReturnValue(true),
  incrementGuestUsage: vi.fn(),
  getRemainingUses: vi.fn().mockReturnValue(3),
}));

// Mock useRegionTier
const mockUseRegionTier = vi.fn();
vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: () => mockUseRegionTier(),
}));

// Mock modalStore
const mockOpenAuthModal = vi.fn();
vi.mock('@client/store/modalStore', () => ({
  useModalStore: () => ({ openAuthModal: mockOpenAuthModal }),
}));

// Mock userStore
const mockUseUserStore = vi.fn();
vi.mock('@client/store/userStore', () => ({
  useUserStore: () => mockUseUserStore(),
}));

// Mock authRedirectManager
const mockPrepareAuthRedirect = vi.fn();
vi.mock('@client/utils/authRedirectManager', () => ({
  prepareAuthRedirect: (...args: unknown[]) => mockPrepareAuthRedirect(...args),
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => React.createElement('img', { alt }),
}));

// Mock lucide-react with passthrough to avoid "no export" errors
vi.mock('lucide-react', async importOriginal => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return { ...actual };
});

// Mock FileUpload
vi.mock('@/app/(pseo)/_components/ui/FileUpload', () => ({
  FileUpload: () => React.createElement('div', { 'data-testid': 'file-upload' }),
}));

import { GuestUpscaler } from '@/app/(pseo)/_components/tools/GuestUpscaler';

describe('GuestUpscaler paywall CTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: initialized, not geo loading
    mockUseRegionTier.mockReturnValue({ isPaywalled: false, isLoading: false });
    mockUseUserStore.mockReturnValue({ isAuthenticated: false });
  });

  it('shows paywall state when isPaywalled is true', async () => {
    mockUseRegionTier.mockReturnValue({ isPaywalled: true, isLoading: false });

    render(React.createElement(GuestUpscaler));

    // Wait for init
    await vi.waitFor(() => {
      expect(screen.getByText('Subscription Required')).toBeTruthy();
    });

    expect(screen.getByText('View plans')).toBeTruthy();
  });

  it('opens auth modal with pricing redirect when unauthenticated user clicks View plans', async () => {
    mockUseRegionTier.mockReturnValue({ isPaywalled: true, isLoading: false });
    mockUseUserStore.mockReturnValue({ isAuthenticated: false });

    render(React.createElement(GuestUpscaler));

    await vi.waitFor(() => {
      expect(screen.getByText('View plans')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('View plans'));

    expect(mockPrepareAuthRedirect).toHaveBeenCalledWith('paywall_pricing', { returnTo: '/pricing' });
    expect(mockOpenAuthModal).toHaveBeenCalledWith('register');
  });

  it('navigates directly to /pricing when authenticated user clicks View plans', async () => {
    mockUseRegionTier.mockReturnValue({ isPaywalled: true, isLoading: false });
    mockUseUserStore.mockReturnValue({ isAuthenticated: true });

    // Mock window.location.href
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });

    render(React.createElement(GuestUpscaler));

    await vi.waitFor(() => {
      expect(screen.getByText('View plans')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('View plans'));

    expect(window.location.href).toBe('/pricing');
    expect(mockPrepareAuthRedirect).not.toHaveBeenCalled();
    expect(mockOpenAuthModal).not.toHaveBeenCalled();

    Object.defineProperty(window, 'location', { value: originalLocation });
  });

  it('does not show paywall CTA when isPaywalled is false', async () => {
    mockUseRegionTier.mockReturnValue({ isPaywalled: false, isLoading: false });

    render(React.createElement(GuestUpscaler));

    await vi.waitFor(() => {
      expect(screen.queryByText('Subscription Required')).toBeNull();
    });
  });
});
