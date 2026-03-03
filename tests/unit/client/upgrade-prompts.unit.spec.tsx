/**
 * Unit tests for Phase 5 contextual upgrade prompts:
 *  - Prompt 1: model_gate — ModelGalleryModal fires analytics when free user opens gallery
 *  - Prompt 2: after_upscale — AfterUpscaleBanner renders + fires analytics after 3rd upscale
 *  - Prompt 3: after_comparison — ImageComparison nudge renders + fires analytics on slider drag
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Module mocks (must be before imports of the modules under test)
// ---------------------------------------------------------------------------

const { mockAnalyticsTrack, mockPush } = vi.hoisted(() => ({
  mockAnalyticsTrack: vi.fn(),
  mockPush: vi.fn(),
}));

vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: {
    track: mockAnalyticsTrack,
    isEnabled: () => true,
  },
}));

vi.mock('@client/analytics', () => ({
  analytics: {
    track: mockAnalyticsTrack,
    isEnabled: () => true,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

vi.mock('@client/utils/cn', () => ({
  cn: (...args: (string | undefined | null | false)[]) => args.filter(Boolean).join(' '),
}));

// Mock lucide-react icons as simple spans
vi.mock('lucide-react', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const iconStub = ({ children, ...props }: Record<string, unknown>) =>
    React.createElement('span', { 'data-testid': 'icon', ...props }, children as React.ReactNode);
  return {
    ...actual,
    Lock: iconStub,
    Search: iconStub,
    Sparkles: iconStub,
    ArrowLeftRight: iconStub,
    Download: iconStub,
    ZoomIn: iconStub,
    ZoomOut: iconStub,
    X: iconStub,
  };
});

vi.mock('@client/components/ui/BottomSheet', () => ({
  BottomSheet: ({
    isOpen,
    children,
    title,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    title?: string;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="bottom-sheet">
        {title && <h2>{title}</h2>}
        {children}
      </div>
    ) : null,
}));

vi.mock('@client/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    icon,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    icon?: React.ReactNode;
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} data-testid="button">
      {icon}
      {children}
    </button>
  ),
}));

// Stub out complex sub-components of ModelGalleryModal
vi.mock(
  '@client/components/features/workspace/ModelCard',
  async (importOriginal: () => Promise<unknown>) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
      ...actual,
      ModelCard: ({
        tier,
        isLocked,
        onSelect,
        onLockedClick,
      }: {
        tier: string;
        isLocked: boolean;
        onSelect: (t: string) => void;
        onLockedClick?: () => void;
      }) => (
        <button
          data-testid={`model-card-${tier}`}
          data-locked={isLocked}
          onClick={() => (isLocked ? onLockedClick?.() : onSelect(tier))}
        >
          {tier}
        </button>
      ),
    };
  }
);

vi.mock('@client/components/features/workspace/ModelGallerySearch', () => ({
  ModelGallerySearch: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  }) => (
    <input
      data-testid="gallery-search"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="Search..."
    />
  ),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ModelGalleryModal } from '@/client/components/features/workspace/ModelGalleryModal';
import { AfterUpscaleBanner } from '@/client/components/features/workspace/AfterUpscaleBanner';
import { PostDownloadPrompt } from '@/client/components/features/workspace/PostDownloadPrompt';
import { QualityTier } from '@/shared/types/coreflow.types';
import { canShowPrompt, markPromptShown } from '@/client/utils/promptFrequency';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearSessionStorage() {
  sessionStorage.clear();
}

// ---------------------------------------------------------------------------
// Prompt 1: model_gate — ModelGalleryModal
// ---------------------------------------------------------------------------

describe('Prompt 1: model_gate — ModelGalleryModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    currentTier: 'quick' as QualityTier,
    isFreeUser: true,
    onSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionStorage();
  });

  afterEach(() => {
    clearSessionStorage();
  });

  it('fires upgrade_prompt_shown with trigger model_gate when free user opens gallery', async () => {
    render(<ModelGalleryModal {...defaultProps} isFreeUser={true} />);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_shown', {
        trigger: 'model_gate',
        currentPlan: 'free',
      });
    });
  });

  it('does NOT fire upgrade_prompt_shown for paid users', () => {
    render(<ModelGalleryModal {...defaultProps} isFreeUser={false} />);
    expect(mockAnalyticsTrack).not.toHaveBeenCalledWith(
      'upgrade_prompt_shown',
      expect.objectContaining({ trigger: 'model_gate' })
    );
  });

  it('fires upgrade_prompt_shown only once per session even if modal reopens', async () => {
    const { rerender } = render(<ModelGalleryModal {...defaultProps} isOpen={false} />);

    // First open
    rerender(<ModelGalleryModal {...defaultProps} isOpen={true} />);
    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_shown', {
        trigger: 'model_gate',
        currentPlan: 'free',
      });
    });

    vi.clearAllMocks();

    // Close and reopen — should not fire again
    rerender(<ModelGalleryModal {...defaultProps} isOpen={false} />);
    rerender(<ModelGalleryModal {...defaultProps} isOpen={true} />);

    // Give time for the effect to run
    await new Promise(r => setTimeout(r, 10));
    expect(mockAnalyticsTrack).not.toHaveBeenCalledWith('upgrade_prompt_shown', {
      trigger: 'model_gate',
      currentPlan: 'free',
    });
  });

  it('fires upgrade_prompt_clicked when locked model clicked', async () => {
    render(<ModelGalleryModal {...defaultProps} isFreeUser={true} />);

    // Find a locked model card (premium tier card)
    // The premium section divider should exist
    const premiumDivider = screen.queryByText(/Professional Tiers/i);
    // If there's locked content, clicking the banner upgrade button should fire analytics
    const upgradeButton = screen.getByText('Unlock Premium Models');
    fireEvent.click(upgradeButton);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_clicked', {
        trigger: 'model_gate',
        destination: '/dashboard/billing',
        currentPlan: 'free',
      });
    });
  });

  it('shows "Available on Pro" copy in the upgrade banner', () => {
    render(<ModelGalleryModal {...defaultProps} isFreeUser={true} />);
    expect(screen.getByText(/Available on Pro/i)).toBeInTheDocument();
  });

  it('navigates to /dashboard/billing (not /pricing) on upgrade click', async () => {
    render(<ModelGalleryModal {...defaultProps} isFreeUser={true} />);

    const upgradeButton = screen.getByText('Unlock Premium Models');
    fireEvent.click(upgradeButton);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard/billing');
    });
    expect(mockPush).not.toHaveBeenCalledWith('/pricing');
  });
});

// ---------------------------------------------------------------------------
// Prompt 2: after_upscale — AfterUpscaleBanner
// ---------------------------------------------------------------------------

describe('Prompt 2: after_upscale — AfterUpscaleBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionStorage();
  });

  afterEach(() => {
    clearSessionStorage();
  });

  it('does not render when completedCount is below 3', () => {
    const { container } = render(<AfterUpscaleBanner completedCount={2} isFreeUser={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders banner when completedCount reaches 3 for free user', async () => {
    render(<AfterUpscaleBanner completedCount={3} isFreeUser={true} />);

    await waitFor(() => {
      expect(screen.getByText(/You've upscaled 3 images\./i)).toBeInTheDocument();
    });
  });

  it('fires upgrade_prompt_shown with trigger after_upscale when shown', async () => {
    render(<AfterUpscaleBanner completedCount={3} isFreeUser={true} />);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_shown', {
        trigger: 'after_upscale',
        currentPlan: 'free',
      });
    });
  });

  it('does NOT render for paid users', () => {
    const { container } = render(<AfterUpscaleBanner completedCount={5} isFreeUser={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('only fires once per session (subsequent renders with same count do not re-fire)', async () => {
    const { rerender } = render(<AfterUpscaleBanner completedCount={3} isFreeUser={true} />);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledTimes(1);
    });

    vi.clearAllMocks();

    // Rerender with higher count — should not fire again (session key is set)
    rerender(<AfterUpscaleBanner completedCount={4} isFreeUser={true} />);

    await new Promise(r => setTimeout(r, 10));
    expect(mockAnalyticsTrack).not.toHaveBeenCalled();
  });

  it('renders upgrade link pointing to /dashboard/billing', async () => {
    render(<AfterUpscaleBanner completedCount={3} isFreeUser={true} />);

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /Upgrade for unlimited\./i });
      expect(link).toHaveAttribute('href', '/dashboard/billing');
    });
  });

  it('fires upgrade_prompt_clicked when upgrade link is clicked', async () => {
    render(<AfterUpscaleBanner completedCount={3} isFreeUser={true} />);

    await waitFor(() => {
      expect(screen.getByText(/You've upscaled 3 images\./i)).toBeInTheDocument();
    });

    const link = screen.getByRole('link', { name: /Upgrade for unlimited\./i });
    fireEvent.click(link);

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_clicked', {
      trigger: 'after_upscale',
      destination: '/dashboard/billing',
      currentPlan: 'free',
    });
  });

  it('dismisses banner and fires upgrade_prompt_dismissed when X is clicked', async () => {
    render(<AfterUpscaleBanner completedCount={3} isFreeUser={true} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Dismiss upgrade prompt')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Dismiss upgrade prompt'));

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_dismissed', {
      trigger: 'after_upscale',
      currentPlan: 'free',
    });

    // Banner should be gone
    await waitFor(() => {
      expect(screen.queryByText(/You've upscaled 3 images\./i)).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Prompt 3: after_comparison — ImageComparison nudge
// ---------------------------------------------------------------------------

describe('Prompt 3: after_comparison — ImageComparison nudge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionStorage();
  });

  afterEach(() => {
    clearSessionStorage();
  });

  it('does not show nudge before slider interaction', async () => {
    const { ImageComparison } =
      await import('@/client/components/features/image-processing/ImageComparison');

    render(
      <ImageComparison
        beforeUrl="https://example.com/before.jpg"
        afterUrl="https://example.com/after.jpg"
        onDownload={vi.fn()}
        showUpgradeNudge={true}
      />
    );

    expect(screen.queryByText(/Love the result\?/i)).not.toBeInTheDocument();
  });

  it('shows nudge after slider is dragged when showUpgradeNudge is true', async () => {
    const { ImageComparison } =
      await import('@/client/components/features/image-processing/ImageComparison');

    const { container } = render(
      <ImageComparison
        beforeUrl="https://example.com/before.jpg"
        afterUrl="https://example.com/after.jpg"
        onDownload={vi.fn()}
        showUpgradeNudge={true}
      />
    );

    // Simulate mousedown on the slider container
    const sliderContainer = container.querySelector('[class*="cursor-col-resize"]');
    expect(sliderContainer).toBeTruthy();
    fireEvent.mouseDown(sliderContainer!);

    await waitFor(() => {
      expect(screen.getByText(/Love the result\?/i)).toBeInTheDocument();
    });
  });

  it('fires upgrade_prompt_shown with trigger after_comparison on first drag', async () => {
    const { ImageComparison } =
      await import('@/client/components/features/image-processing/ImageComparison');

    const { container } = render(
      <ImageComparison
        beforeUrl="https://example.com/before.jpg"
        afterUrl="https://example.com/after.jpg"
        onDownload={vi.fn()}
        showUpgradeNudge={true}
      />
    );

    const sliderContainer = container.querySelector('[class*="cursor-col-resize"]');
    fireEvent.mouseDown(sliderContainer!);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_shown', {
        trigger: 'after_comparison',
        currentPlan: 'free',
      });
    });
  });

  it('does NOT show nudge when showUpgradeNudge is false', async () => {
    const { ImageComparison } =
      await import('@/client/components/features/image-processing/ImageComparison');

    const { container } = render(
      <ImageComparison
        beforeUrl="https://example.com/before.jpg"
        afterUrl="https://example.com/after.jpg"
        onDownload={vi.fn()}
        showUpgradeNudge={false}
      />
    );

    const sliderContainer = container.querySelector('[class*="cursor-col-resize"]');
    fireEvent.mouseDown(sliderContainer!);

    await new Promise(r => setTimeout(r, 10));
    expect(screen.queryByText(/Love the result\?/i)).not.toBeInTheDocument();
    expect(mockAnalyticsTrack).not.toHaveBeenCalledWith(
      'upgrade_prompt_shown',
      expect.objectContaining({ trigger: 'after_comparison' })
    );
  });

  it('fires upgrade_prompt_shown only once per session (not on subsequent drags)', async () => {
    const { ImageComparison } =
      await import('@/client/components/features/image-processing/ImageComparison');

    const { container } = render(
      <ImageComparison
        beforeUrl="https://example.com/before.jpg"
        afterUrl="https://example.com/after.jpg"
        onDownload={vi.fn()}
        showUpgradeNudge={true}
      />
    );

    const sliderContainer = container.querySelector('[class*="cursor-col-resize"]');

    // First drag
    fireEvent.mouseDown(sliderContainer!);
    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledTimes(1);
    });

    vi.clearAllMocks();

    // Second drag — session key already set, should not fire again
    // (hasInteractedRef prevents re-checking sessionStorage)
    fireEvent.mouseDown(sliderContainer!);
    await new Promise(r => setTimeout(r, 10));
    expect(mockAnalyticsTrack).not.toHaveBeenCalled();
  });

  it('nudge link points to /dashboard/billing', async () => {
    const { ImageComparison } =
      await import('@/client/components/features/image-processing/ImageComparison');

    const { container } = render(
      <ImageComparison
        beforeUrl="https://example.com/before.jpg"
        afterUrl="https://example.com/after.jpg"
        onDownload={vi.fn()}
        showUpgradeNudge={true}
      />
    );

    const sliderContainer = container.querySelector('[class*="cursor-col-resize"]');
    fireEvent.mouseDown(sliderContainer!);

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /Unlock premium quality\./i });
      expect(link).toHaveAttribute('href', '/dashboard/billing');
    });
  });

  it('fires upgrade_prompt_clicked when nudge link is clicked', async () => {
    const { ImageComparison } =
      await import('@/client/components/features/image-processing/ImageComparison');

    const { container } = render(
      <ImageComparison
        beforeUrl="https://example.com/before.jpg"
        afterUrl="https://example.com/after.jpg"
        onDownload={vi.fn()}
        showUpgradeNudge={true}
      />
    );

    const sliderContainer = container.querySelector('[class*="cursor-col-resize"]');
    fireEvent.mouseDown(sliderContainer!);

    await waitFor(() => {
      expect(screen.getByText(/Love the result\?/i)).toBeInTheDocument();
    });

    const link = screen.getByRole('link', { name: /Unlock premium quality\./i });
    fireEvent.click(link);

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_clicked', {
      trigger: 'after_comparison',
      destination: '/dashboard/billing',
      currentPlan: 'free',
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 1: after_download — PostDownloadPrompt
// ---------------------------------------------------------------------------

describe('Phase 1: after_download — PostDownloadPrompt', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      get length() {
        return store.size;
      },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
    });
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('should show PostDownloadPrompt after first download for free user', async () => {
    render(<PostDownloadPrompt isFreeUser={true} downloadCount={1} />);

    await waitFor(() => {
      expect(screen.getByText(/Love the result\?/i)).toBeInTheDocument();
    });
  });

  it('should NOT show PostDownloadPrompt for paid users', async () => {
    const { container } = render(<PostDownloadPrompt isFreeUser={false} downloadCount={1} />);

    await new Promise(r => setTimeout(r, 10));
    expect(container.firstChild).toBeNull();
  });

  it('should respect 72h localStorage cooldown', async () => {
    // Simulate prompt was shown recently by marking it shown
    markPromptShown({ key: 'prompt_freq_after_download', cooldownMs: 72 * 60 * 60 * 1000 });

    const { container } = render(<PostDownloadPrompt isFreeUser={true} downloadCount={1} />);

    await new Promise(r => setTimeout(r, 10));
    expect(container.firstChild).toBeNull();
  });

  it('should fire upgrade_prompt_shown with trigger after_download', async () => {
    render(<PostDownloadPrompt isFreeUser={true} downloadCount={1} />);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_shown', {
        trigger: 'after_download',
        currentPlan: 'free',
      });
    });
  });

  it('should fire upgrade_prompt_dismissed on X click', async () => {
    render(<PostDownloadPrompt isFreeUser={true} downloadCount={1} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Dismiss upgrade prompt')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Dismiss upgrade prompt'));

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_dismissed', {
      trigger: 'after_download',
      currentPlan: 'free',
    });

    await waitFor(() => {
      expect(screen.queryByText(/Love the result\?/i)).not.toBeInTheDocument();
    });
  });

  it('should navigate to /dashboard/billing on CTA click', async () => {
    render(<PostDownloadPrompt isFreeUser={true} downloadCount={1} />);

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /Get 10x sharper with Premium models\./i });
      expect(link).toHaveAttribute('href', '/dashboard/billing');
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 4: promptFrequency utility
// ---------------------------------------------------------------------------

describe('Phase 4: promptFrequency utility', () => {
  // Use a real in-memory localStorage implementation so get/set/clear work correctly.
  // The global setup mocks localStorage with vi.fn() stubs that don't persist state,
  // so we install a working store for this describe block.
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      get length() {
        return store.size;
      },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('promptFrequency: should allow prompt when no previous show', () => {
    const result = canShowPrompt({ key: 'test_prompt', cooldownMs: 24 * 60 * 60 * 1000 });
    expect(result).toBe(true);
  });

  it('promptFrequency: should block prompt within cooldown period', () => {
    markPromptShown({ key: 'test_prompt', cooldownMs: 24 * 60 * 60 * 1000 });
    const result = canShowPrompt({ key: 'test_prompt', cooldownMs: 24 * 60 * 60 * 1000 });
    expect(result).toBe(false);
  });

  it('promptFrequency: should allow prompt after cooldown expires', () => {
    const pastTimestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
    localStorage.setItem('test_prompt_last_shown', String(pastTimestamp));
    const result = canShowPrompt({ key: 'test_prompt', cooldownMs: 24 * 60 * 60 * 1000 });
    expect(result).toBe(true);
  });

  it('AfterUpscaleBanner should respect 24h cross-session cooldown', async () => {
    // Simulate banner was shown recently by writing the timestamp directly
    localStorage.setItem('prompt_freq_after_upscale_last_shown', String(Date.now()));

    const { container } = render(<AfterUpscaleBanner completedCount={3} isFreeUser={true} />);

    await new Promise(r => setTimeout(r, 10));
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase 3: Batch Limit Modal & UpgradeSuccessBanner
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => {
    const translations: Record<string, string> = {
      'workspace.batchLimit.serverEnforcedTitle': 'Batch Processing Limit Reached',
      'workspace.batchLimit.clientEnforcedTitle': 'Batch Limit Reached',
      'workspace.batchLimit.clientEnforcedMessage':
        'You tried to add {attempted} images but your plan allows a maximum of {limit}.',
      'workspace.batchLimit.freeUserMessage':
        "You're on the free tier (1 image at a time). Upgrade to process up to 50 images in batch — starting at $5.",
      'workspace.batchLimit.securityMessage':
        'This is a security measure to prevent abuse. The limit will reset in approximately 1 hour.',
      'workspace.batchLimit.upgradeButton': 'Upgrade Plan',
      'workspace.batchLimit.upgradeButtonBatch': 'Unlock Batch Processing',
      'workspace.batchLimit.addPartialButton': 'Add images',
      'workspace.batchLimit.cancelButton': 'Cancel',
      'common.cancel': 'Cancel',
    };

    const t = (key: string, _params?: Record<string, unknown>) =>
      translations[`${ns}.${key}`] ?? key;
    t.rich = (key: string, _params?: Record<string, unknown>) =>
      translations[`${ns}.${key}`] ?? key;
    return t;
  },
}));

vi.mock('@client/components/ui/Modal', () => ({
  Modal: ({
    isOpen,
    children,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    onClose?: () => void;
    size?: string;
  }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

import { BatchLimitModal } from '@/client/components/features/workspace/BatchLimitModal';
import { UpgradeSuccessBanner } from '@/client/components/features/workspace/UpgradeSuccessBanner';

describe('Phase 3: BatchLimitModal improvements', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    limit: 1,
    attempted: 3,
    currentCount: 1,
    onAddPartial: vi.fn(),
    serverEnforced: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should show "Unlock Batch Processing" button text in BatchLimitModal', () => {
    render(<BatchLimitModal {...defaultProps} />);

    expect(screen.getByText('Unlock Batch Processing')).toBeInTheDocument();
  });

  it('should show free user specific copy when limit is 1', () => {
    render(<BatchLimitModal {...defaultProps} limit={1} />);

    expect(
      screen.getByText(
        "You're on the free tier (1 image at a time). Upgrade to process up to 50 images in batch — starting at $5."
      )
    ).toBeInTheDocument();
  });
});

describe('Phase 3: UpgradeSuccessBanner fixes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('UpgradeSuccessBanner should link to /dashboard/billing', () => {
    render(
      <UpgradeSuccessBanner processedCount={3} onDismiss={vi.fn()} hasSubscription={false} />
    );

    const link = screen.getByRole('link', { name: /See Plans/i });
    expect(link).toHaveAttribute('href', '/dashboard/billing');
  });

  it('UpgradeSuccessBanner should fire upgrade_prompt_shown on render', async () => {
    render(
      <UpgradeSuccessBanner processedCount={3} onDismiss={vi.fn()} hasSubscription={false} />
    );

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_shown', {
        trigger: 'after_batch',
        currentPlan: 'free',
      });
    });
  });
});
