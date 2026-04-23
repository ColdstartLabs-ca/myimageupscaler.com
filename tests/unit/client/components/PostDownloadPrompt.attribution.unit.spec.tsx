import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const { mockSetCheckoutTrackingContext } = vi.hoisted(() => ({
  mockSetCheckoutTrackingContext: vi.fn(),
}));

vi.mock('@client/utils/checkoutTrackingContext', () => ({
  setCheckoutTrackingContext: mockSetCheckoutTrackingContext,
  getCheckoutTrackingContext: vi.fn(() => null),
}));

vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: { track: vi.fn(), isEnabled: () => true },
}));

vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: () => ({
    tier: 'standard',
    pricingRegion: 'standard',
    discountPercent: 0,
    isRestricted: false,
    isLoading: false,
  }),
}));

vi.mock('@client/utils/abTest', () => ({
  getVariant: () => 'value',
}));

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const map: Record<string, string> = {
      'workspace.postDownloadPrompt.title': 'See what other models can do',
      'workspace.postDownloadPrompt.body': 'Body text',
      'workspace.postDownloadPrompt.cta': 'Explore Models',
      'workspace.postDownloadPrompt.dismiss': 'Dismiss prompt',
      'workspace.postDownloadPrompt.maybeLater': 'Maybe Later',
    };
    return (key: string) => map[`workspace.postDownloadPrompt.${key}`] ?? key;
  },
}));

vi.mock('lucide-react', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const stub = (props: Record<string, unknown>) =>
    React.createElement('span', { 'data-testid': 'icon', ...props });
  return { ...actual, Sparkles: stub, X: stub };
});

vi.mock('@client/components/ui/Modal', () => ({
  Modal: ({
    isOpen,
    children,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    onClose?: () => void;
    size?: string;
    showCloseButton?: boolean;
    backdropClassName?: string;
    panelClassName?: string;
  }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

import { PostDownloadPrompt } from '@client/components/features/workspace/PostDownloadPrompt';

describe('PostDownloadPrompt — attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  test("should set originatingTrigger='post_download_explore' when explore CTA is clicked", async () => {
    const onExploreModels = vi.fn();

    const { rerender } = render(
      <PostDownloadPrompt isFreeUser={true} downloadCount={0} onExploreModels={onExploreModels} />
    );

    rerender(
      <PostDownloadPrompt isFreeUser={true} downloadCount={1} onExploreModels={onExploreModels} />
    );

    await waitFor(() => {
      expect(screen.getByText('See what other models can do')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Explore Models'));

    expect(mockSetCheckoutTrackingContext).toHaveBeenCalledWith({
      originatingTrigger: 'post_download_explore',
    });
  });

  test('should call setCheckoutTrackingContext before onExploreModels callback', async () => {
    const callOrder: string[] = [];
    const onExploreModels = vi.fn(() => callOrder.push('explore'));
    mockSetCheckoutTrackingContext.mockImplementation(() => callOrder.push('context'));

    const { rerender } = render(
      <PostDownloadPrompt isFreeUser={true} downloadCount={0} onExploreModels={onExploreModels} />
    );

    rerender(
      <PostDownloadPrompt isFreeUser={true} downloadCount={1} onExploreModels={onExploreModels} />
    );

    await waitFor(() => {
      expect(screen.getByText('See what other models can do')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Explore Models'));

    expect(callOrder).toEqual(['context', 'explore']);
  });
});
