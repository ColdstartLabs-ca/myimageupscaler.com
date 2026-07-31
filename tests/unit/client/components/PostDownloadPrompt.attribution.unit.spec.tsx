import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const {
  mockAnalyticsTrack,
  mockGetUserId,
  mockGetVariantForIdentity,
  mockSetCheckoutTrackingContext,
} = vi.hoisted(() => ({
  mockAnalyticsTrack: vi.fn(),
  mockGetUserId: vi.fn(() => 'device-123'),
  mockGetVariantForIdentity: vi.fn(() => 'blocking_modal_control'),
  mockSetCheckoutTrackingContext: vi.fn(),
}));

vi.mock('@client/utils/checkoutTrackingContext', () => ({
  setCheckoutTrackingContext: mockSetCheckoutTrackingContext,
  getCheckoutTrackingContext: vi.fn(() => null),
}));

vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: { track: mockAnalyticsTrack, isEnabled: () => true },
}));

vi.mock('@client/store/userStore', () => ({
  useUserStore: (selector: (state: { user: { id: string } | null }) => unknown) =>
    selector({ user: { id: 'user-123' } }),
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
  getUserId: mockGetUserId,
  getVariantForIdentity: mockGetVariantForIdentity,
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
    localStorage.clear();
    sessionStorage.clear();
    mockGetVariantForIdentity.mockReturnValue('blocking_modal_control');
    mockSetCheckoutTrackingContext.mockReturnValue({
      funnelAttemptId: 'fa_post_download_123',
      entrySurface: 'post_download_explore',
      trigger: 'post_download_explore',
      attributionChain: ['post_download_explore'],
    });
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  test('uses the authenticated user for a stable fixed A/B assignment', () => {
    render(<PostDownloadPrompt isFreeUser={true} downloadCount={0} onExploreModels={vi.fn()} />);

    expect(mockGetVariantForIdentity).toHaveBeenCalledWith(
      'post_download_surface',
      ['blocking_modal_control', 'inline_explore_treatment'],
      'user:user-123'
    );
    expect(mockGetUserId).not.toHaveBeenCalled();
  });

  test('renders the blocking modal only for the control arm', async () => {
    const { rerender } = render(
      <PostDownloadPrompt isFreeUser={true} downloadCount={0} onExploreModels={vi.fn()} />
    );

    rerender(<PostDownloadPrompt isFreeUser={true} downloadCount={1} onExploreModels={vi.fn()} />);

    expect(await screen.findByTestId('modal')).toBeInTheDocument();
    expect(screen.queryByTestId('post-download-inline-action')).not.toBeInTheDocument();
  });

  test('renders an inline action and never opens the modal for the treatment arm', async () => {
    mockGetVariantForIdentity.mockReturnValue('inline_explore_treatment');
    const { rerender } = render(
      <PostDownloadPrompt isFreeUser={true} downloadCount={0} onExploreModels={vi.fn()} />
    );

    rerender(<PostDownloadPrompt isFreeUser={true} downloadCount={1} onExploreModels={vi.fn()} />);

    expect(await screen.findByTestId('post-download-inline-action')).toBeInTheDocument();
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  test('keeps treatment CTA attribution analytics-only before opening the gallery', async () => {
    mockGetVariantForIdentity.mockReturnValue('inline_explore_treatment');
    const onExploreModels = vi.fn();
    const { rerender } = render(
      <PostDownloadPrompt isFreeUser={true} downloadCount={0} onExploreModels={onExploreModels} />
    );

    rerender(
      <PostDownloadPrompt isFreeUser={true} downloadCount={1} onExploreModels={onExploreModels} />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Explore Models' }));

    expect(mockSetCheckoutTrackingContext).toHaveBeenLastCalledWith({
      originatingTrigger: 'post_download_explore',
    });
    expect(mockSetCheckoutTrackingContext).not.toHaveBeenCalledWith(
      expect.objectContaining({ experimentKey: expect.anything() })
    );
    expect(mockAnalyticsTrack).toHaveBeenCalledWith(
      'upgrade_prompt_clicked',
      expect.objectContaining({
        experimentKey: 'post_download_surface',
        experimentVariant: 'inline_explore_treatment',
        funnelAttemptId: 'fa_post_download_123',
        attributionChain: ['post_download_explore'],
      })
    );
    expect(onExploreModels).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
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

    expect(mockSetCheckoutTrackingContext).toHaveBeenLastCalledWith({
      originatingTrigger: 'post_download_explore',
    });
    expect(mockSetCheckoutTrackingContext).not.toHaveBeenCalledWith(
      expect.objectContaining({ experimentKey: expect.anything() })
    );
    expect(mockAnalyticsTrack).toHaveBeenCalledWith(
      'upgrade_prompt_clicked',
      expect.objectContaining({
        experimentKey: 'post_download_surface',
        experimentVariant: 'blocking_modal_control',
        funnelAttemptId: 'fa_post_download_123',
      })
    );
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

    expect(callOrder).toEqual(['context', 'context', 'explore']);
  });
});
