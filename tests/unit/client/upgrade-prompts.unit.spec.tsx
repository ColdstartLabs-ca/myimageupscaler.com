/**
 * Unit tests for upgrade prompt components: BatchLimitModal, UpgradeSuccessBanner, PostDownloadPrompt
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock next/link - render an <a> element forwarding all props (including data-testid)
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Mock next-intl - return a function that returns the key as-is
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  AlertTriangle: () => <span data-testid="alert-triangle-icon">AlertTriangle</span>,
  Sparkles: () => <span data-testid="sparkles-icon">Sparkles</span>,
  X: () => <span data-testid="x-icon">X</span>,
}));

// Mock @client/components/ui/Modal - render children when isOpen is true
vi.mock('@client/components/ui/Modal', () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div data-testid="modal">{children}</div> : null,
}));

// Mock @client/components/ui/Button - render a button with children
vi.mock('@client/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

// Mock analytics - use vi.hoisted to avoid "before initialization" error
const { mockAnalyticsTrack } = vi.hoisted(() => ({
  mockAnalyticsTrack: vi.fn(),
}));
vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: {
    track: mockAnalyticsTrack,
  },
}));

// Import components after mocks
import { BatchLimitModal } from '@client/components/features/workspace/BatchLimitModal';
import { UpgradeSuccessBanner } from '@client/components/features/workspace/UpgradeSuccessBanner';
import { PostDownloadPrompt } from '@client/components/features/workspace/PostDownloadPrompt';

describe('BatchLimitModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    limit: 1,
    attempted: 2,
    currentCount: 0,
    onAddPartial: vi.fn(),
    serverEnforced: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should show "Unlock Batch Processing" button text in BatchLimitModal', () => {
    render(<BatchLimitModal {...defaultProps} />);

    // The translation mock returns the key as-is, so t('unlockBatchButton') → 'unlockBatchButton'
    expect(screen.getByText('unlockBatchButton')).toBeInTheDocument();
  });

  it('should show free user specific copy when limit is 1', () => {
    render(<BatchLimitModal {...defaultProps} limit={1} />);

    // When limit === 1, the component renders a free user message box
    // The mock returns the key 'freeUserMessage' as text
    expect(screen.getByText('freeUserMessage')).toBeInTheDocument();
  });
});

describe('UpgradeSuccessBanner', () => {
  const defaultProps = {
    processedCount: 3,
    onDismiss: vi.fn(),
    hasSubscription: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear sessionStorage between tests so dismissed state doesn't carry over
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('upgrade-banner-dismissed');
    }
    // localStorage is a global mock (vi.fn()) — getItem returns undefined by default
    // after vi.clearAllMocks(), so canShowPrompt will return true (no cooldown set)
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should link to /dashboard/billing', () => {
    render(<UpgradeSuccessBanner {...defaultProps} />);

    const link = screen.getByRole('link', { name: /see plans/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/dashboard/billing');
  });

  it('should fire upgrade_prompt_shown on mount', async () => {
    render(<UpgradeSuccessBanner {...defaultProps} />);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_shown', {
        trigger: 'after_batch',
      });
    });
  });
});

describe('PostDownloadPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // localStorage is globally mocked as vi.fn() in vitest.setup.tsx.
    // vi.clearAllMocks() clears call history but NOT mockReturnValue implementations,
    // so we explicitly reset getItem to return null (no cooldown stored).
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    // Clear sessionStorage so session throttle passes.
    sessionStorage.removeItem('upgrade_prompt_shown_after_download');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should show PostDownloadPrompt after first download for free user', async () => {
    render(<PostDownloadPrompt isFreeUser={true} downloadCount={1} />);

    await waitFor(() => {
      expect(screen.getByTestId('post-download-prompt')).toBeInTheDocument();
    });
  });

  it('should NOT show PostDownloadPrompt for paid users', () => {
    render(<PostDownloadPrompt isFreeUser={false} downloadCount={1} />);

    expect(screen.queryByTestId('post-download-prompt')).not.toBeInTheDocument();
  });

  it('should NOT show PostDownloadPrompt when downloadCount is 0', () => {
    render(<PostDownloadPrompt isFreeUser={true} downloadCount={0} />);

    expect(screen.queryByTestId('post-download-prompt')).not.toBeInTheDocument();
  });

  it('should respect 72h localStorage cooldown', () => {
    // localStorage is mocked as vi.fn() globally. We mock getItem to return
    // a JSON with lastShown=now so canShowPrompt returns false (within cooldown).
    const recentTimestamp = Date.now();
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({ lastShown: recentTimestamp, weeklyCount: 1, weekStart: recentTimestamp })
    );

    render(<PostDownloadPrompt isFreeUser={true} downloadCount={1} />);

    // Component should NOT render — canShowPrompt blocks it
    expect(screen.queryByTestId('post-download-prompt')).not.toBeInTheDocument();
  });

  it('should fire upgrade_prompt_shown with trigger after_download', async () => {
    render(<PostDownloadPrompt isFreeUser={true} downloadCount={1} />);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_shown', {
        trigger: 'after_download',
      });
    });
  });

  it('should navigate to /dashboard/billing on CTA click', async () => {
    render(<PostDownloadPrompt isFreeUser={true} downloadCount={1} />);

    await waitFor(() => {
      expect(screen.getByTestId('post-download-prompt')).toBeInTheDocument();
    });

    const ctaLink = screen.getByTestId('post-download-prompt-cta');
    expect(ctaLink).toHaveAttribute('href', '/dashboard/billing');
  });
});
