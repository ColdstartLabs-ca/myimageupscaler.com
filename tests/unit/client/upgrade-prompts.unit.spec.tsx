/**
 * Unit tests for Phase 5 contextual upgrade prompts:
 *  - Prompt 1: model_gate — ModelGalleryModal fires analytics when free user opens gallery
 *  - Prompt 2: after_upscale — AfterUpscaleBanner renders + fires analytics after 3rd upscale
 *  - Prompt 3: legacy comparison CTA removed — retained here as a regression note
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Module mocks (must be before imports of the modules under test)
// ---------------------------------------------------------------------------

const { mockAnalyticsTrack, mockPush, mockSetCheckoutTrackingContext } = vi.hoisted(() => ({
  mockAnalyticsTrack: vi.fn(),
  mockPush: vi.fn(),
  mockSetCheckoutTrackingContext: vi.fn(),
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

// Mock useRegionTier to prevent fetch('/api/geo') in tests
vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: () => ({
    tier: 'standard',
    pricingRegion: 'standard',
    discountPercent: 0,
    isRestricted: false,
    isLoading: false,
  }),
}));

vi.mock('@client/utils/checkoutTrackingContext', () => ({
  setCheckoutTrackingContext: mockSetCheckoutTrackingContext,
  getCheckoutTrackingContext: vi.fn(() => null),
}));

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => {
    const translations: Record<string, string> = {
      'workspace.postDownloadPrompt.title': 'See what other models can do',
      'workspace.postDownloadPrompt.body':
        'We have 14+ AI models — each optimized for different image types.',
      'workspace.postDownloadPrompt.cta': 'Explore Models',
      'workspace.postDownloadPrompt.dismiss': 'Dismiss prompt',
      'workspace.postDownloadPrompt.maybeLater': 'Maybe Later',
      'workspace.batchLimit.serverEnforcedTitle': 'Batch Processing Limit Reached',
      'workspace.batchLimit.clientEnforcedTitle': 'Batch Limit Reached',
      'workspace.batchLimit.clientEnforcedMessage':
        'You tried to add {attempted} images but your plan allows a maximum of {limit}.',
      'workspace.batchLimit.freeUserMessage':
        "You're on the free tier (1 image at a time). Upgrade to process up to 50 images in batch — starting at $5.",
      'workspace.batchLimit.remainingSlotsMessage':
        'You have {availableSlots} of {limit} slots remaining in your queue.',
      'workspace.batchLimit.securityMessage':
        'This is a security measure to prevent abuse. The limit will reset in approximately 1 hour.',
      'workspace.batchLimit.upgradeButton': 'Upgrade Plan',
      'workspace.batchLimit.upgradeButtonBatch': 'Unlock Batch Processing',
      'workspace.batchLimit.addPartialButton': 'Add images',
      'workspace.batchLimit.cancelButton': 'Cancel',
      'common.cancel': 'Cancel',
      'workspace.progressCelebration.dismiss': 'Dismiss celebration',
      'workspace.progressCelebration.title': 'First upscale complete!',
      'workspace.progressCelebration.subtitle':
        'You just upscaled your first image! Curious what other AI models can do with it?',
      'workspace.progressCelebration.uploadAnother': 'Upload Another',
      'workspace.progressCelebration.exploreModels': 'Explore Models',
      'workspace.progressCelebration.skipText': 'See the difference our premium models make',
    };

    const t = (key: string, params?: Record<string, unknown>) => {
      let result = translations[`${ns}.${key}`] ?? key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          result = result.replace(`{${k}}`, String(v));
        });
      }
      return result;
    };
    t.rich = (key: string, params?: Record<string, unknown>) => {
      let result = translations[`${ns}.${key}`] ?? key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          result = result.replace(`{${k}}`, String(v));
        });
      }
      return result;
    };
    return t;
  },
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
    ArrowRight: iconStub,
    Download: iconStub,
    Upload: iconStub,
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
  const mockOnUpgrade = vi.fn();
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    currentTier: 'quick' as QualityTier,
    isFreeUser: true,
    userSegment: 'free' as const,
    onSelect: vi.fn(),
    onUpgrade: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionStorage();
  });

  afterEach(() => {
    clearSessionStorage();
  });

  it('fires upgrade_prompt_shown with trigger model_gate when free user opens gallery', async () => {
    render(<ModelGalleryModal {...defaultProps} isFreeUser={true} userSegment="free" />);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith(
        'upgrade_prompt_shown',
        expect.objectContaining({
          trigger: 'model_gate',
          userSegment: 'free',
          currentPlan: 'free',
          pricingRegion: 'standard',
          copyVariant: expect.stringMatching(/^(value|outcome|urgency)$/),
        })
      );
    });
  });

  it('does NOT fire upgrade_prompt_shown for paid users', () => {
    render(<ModelGalleryModal {...defaultProps} isFreeUser={false} userSegment="subscriber" />);
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
      expect(mockAnalyticsTrack).toHaveBeenCalledWith(
        'upgrade_prompt_shown',
        expect.objectContaining({
          trigger: 'model_gate',
          userSegment: 'free',
          currentPlan: 'free',
          pricingRegion: 'standard',
          copyVariant: expect.stringMatching(/^(value|outcome|urgency)$/),
        })
      );
    });

    vi.clearAllMocks();

    // Close and reopen — should not fire again
    rerender(<ModelGalleryModal {...defaultProps} isOpen={false} />);
    rerender(<ModelGalleryModal {...defaultProps} isOpen={true} />);

    // Give time for the effect to run
    await new Promise(r => setTimeout(r, 10));
    expect(mockAnalyticsTrack).not.toHaveBeenCalledWith('upgrade_prompt_shown', {
      trigger: 'model_gate',
      userSegment: 'free',
      currentPlan: 'free',
    });
  });

  it('fires upgrade_prompt_clicked when locked model clicked', async () => {
    const onUpgrade = vi.fn();
    render(
      <ModelGalleryModal
        {...defaultProps}
        onUpgrade={onUpgrade}
        isFreeUser={true}
        userSegment="free"
      />
    );

    // If there's locked content, clicking the banner upgrade button should fire analytics
    const upgradeButton = screen.getByText('Unlock Premium Models');
    fireEvent.click(upgradeButton);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith(
        'upgrade_prompt_clicked',
        expect.objectContaining({
          trigger: 'model_gate',
          imageVariant: 'banner',
          destination: 'upgrade_plan_modal',
          userSegment: 'free',
          currentPlan: 'free',
          pricingRegion: 'standard',
          copyVariant: expect.stringMatching(/^(value|outcome|urgency)$/),
        })
      );
    });
  });

  it('shows "From $4.99 — 10× sharper results" copy in the upgrade banner', () => {
    render(<ModelGalleryModal {...defaultProps} isFreeUser={true} userSegment="free" />);
    expect(screen.getByText(/From \$4.99/i)).toBeInTheDocument();
  });

  it('calls onUpgrade when upgrade button is clicked', async () => {
    const onUpgrade = vi.fn();
    render(
      <ModelGalleryModal
        {...defaultProps}
        onUpgrade={onUpgrade}
        isFreeUser={true}
        userSegment="free"
      />
    );

    const upgradeButton = screen.getByText('Unlock Premium Models');
    fireEvent.click(upgradeButton);

    await waitFor(() => {
      expect(onUpgrade).toHaveBeenCalled();
    });
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
    const { container } = render(<AfterUpscaleBanner completedCount={2} userSegment="free" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders banner when completedCount reaches 3 for free user', async () => {
    render(<AfterUpscaleBanner completedCount={3} userSegment="free" />);

    await waitFor(() => {
      expect(screen.getByText(/You've upscaled 3 images\./i)).toBeInTheDocument();
    });
  });

  it('fires upgrade_prompt_shown with trigger after_upscale when shown', async () => {
    render(<AfterUpscaleBanner completedCount={3} userSegment="free" />);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_shown', {
        trigger: 'after_upscale',
        currentPlan: 'free',
        userSegment: 'free',
        pricingRegion: 'standard',
        copyVariant: expect.stringMatching(/^(value|outcome|urgency)$/),
      });
    });
  });

  it('fires upgrade_prompt_shown with currentModel prop', async () => {
    render(<AfterUpscaleBanner completedCount={3} userSegment="free" currentModel="ultra" />);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith(
        'upgrade_prompt_shown',
        expect.objectContaining({
          trigger: 'after_upscale',
          imageVariant: 'ultra',
          currentPlan: 'free',
          userSegment: 'free',
          pricingRegion: 'standard',
        })
      );
    });
  });

  it('does NOT render for paid users', () => {
    const { container } = render(
      <AfterUpscaleBanner completedCount={5} userSegment="subscriber" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('only fires once per session (subsequent renders with same count do not re-fire)', async () => {
    const { rerender } = render(<AfterUpscaleBanner completedCount={3} userSegment="free" />);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledTimes(1);
    });

    vi.clearAllMocks();

    // Rerender with higher count — should not fire again (session key is set)
    rerender(<AfterUpscaleBanner completedCount={4} userSegment="free" />);

    await new Promise(r => setTimeout(r, 10));
    expect(mockAnalyticsTrack).not.toHaveBeenCalled();
  });

  it('renders upgrade button pointing to /dashboard/billing', async () => {
    const onUpgrade = vi.fn();
    render(<AfterUpscaleBanner completedCount={3} userSegment="free" onUpgrade={onUpgrade} />);

    await waitFor(() => {
      const button = screen.getByText(/Upgrade for unlimited\./i);
      expect(button).toBeInTheDocument();
      expect(button.tagName).toBe('BUTTON');
    });
  });

  it('fires upgrade_prompt_clicked when upgrade button is clicked', async () => {
    const onUpgrade = vi.fn();
    render(<AfterUpscaleBanner completedCount={3} userSegment="free" onUpgrade={onUpgrade} />);

    await waitFor(() => {
      expect(screen.getByText(/You've upscaled 3 images\./i)).toBeInTheDocument();
    });

    const button = screen.getByText(/Upgrade for unlimited\./i);
    fireEvent.click(button);

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_clicked', {
      trigger: 'after_upscale',
      destination: 'upgrade_plan_modal',
      currentPlan: 'free',
      userSegment: 'free',
      pricingRegion: 'standard',
      copyVariant: expect.stringMatching(/^(value|outcome|urgency)$/),
    });
    expect(onUpgrade).toHaveBeenCalled();
  });

  it('dismisses banner and fires upgrade_prompt_dismissed when X is clicked', async () => {
    render(<AfterUpscaleBanner completedCount={3} userSegment="free" />);

    await waitFor(() => {
      expect(screen.getByLabelText('Dismiss upgrade prompt')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Dismiss upgrade prompt'));

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_dismissed', {
      trigger: 'after_upscale',
      currentPlan: 'free',
      userSegment: 'free',
      pricingRegion: 'standard',
      copyVariant: expect.stringMatching(/^(value|outcome|urgency)$/),
    });

    // Banner should be gone
    await waitFor(() => {
      expect(screen.queryByText(/You've upscaled 3 images\./i)).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Prompt 3: legacy comparison CTA
// NOTE: Feature removed - tests deleted. See feedback_imagecomparison-upgrade-nudge-regression.md
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Phase 1: after_download — PostDownloadPrompt
// ---------------------------------------------------------------------------

describe('Phase 1: after_download — PostDownloadPrompt', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Set up a working localStorage for promptFrequency tests
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('should show PostDownloadPrompt on 2nd download (deterministic, not random)', async () => {
    const onExploreModels = vi.fn();
    const { rerender } = render(
      <PostDownloadPrompt userSegment="free" downloadCount={1} onExploreModels={onExploreModels} />
    );
    rerender(
      <PostDownloadPrompt userSegment="free" downloadCount={2} onExploreModels={onExploreModels} />
    );
    await waitFor(() => {
      expect(screen.getByText(/Want sharper, cleaner output/i)).toBeInTheDocument();
    });
  });

  it('should NOT show PostDownloadPrompt on initial render with an existing download count', async () => {
    const onExploreModels = vi.fn();
    const { container } = render(
      <PostDownloadPrompt userSegment="free" downloadCount={1} onExploreModels={onExploreModels} />
    );

    await new Promise(r => setTimeout(r, 10));
    expect(container.firstChild).toBeNull();
  });

  it('should NOT show PostDownloadPrompt on 3rd+ downloads', async () => {
    const onExploreModels = vi.fn();
    const { container } = render(
      <PostDownloadPrompt userSegment="free" downloadCount={3} onExploreModels={onExploreModels} />
    );

    await new Promise(r => setTimeout(r, 10));
    expect(container.firstChild).toBeNull();
  });

  it('should NOT show PostDownloadPrompt for paid users', async () => {
    const onExploreModels = vi.fn();
    const { container } = render(
      <PostDownloadPrompt
        userSegment="subscriber"
        downloadCount={2}
        onExploreModels={onExploreModels}
      />
    );

    await new Promise(r => setTimeout(r, 10));
    expect(container.firstChild).toBeNull();
  });

  it('should fire upgrade_prompt_shown with trigger after_download', async () => {
    const onExploreModels = vi.fn();
    const { rerender } = render(
      <PostDownloadPrompt userSegment="free" downloadCount={1} onExploreModels={onExploreModels} />
    );
    rerender(
      <PostDownloadPrompt userSegment="free" downloadCount={2} onExploreModels={onExploreModels} />
    );
    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_shown', {
        trigger: 'post_download_explore',
        currentPlan: 'free',
        userSegment: 'free',
        pricingRegion: 'standard',
        copyVariant: expect.stringMatching(/^(value|outcome|urgency)$/),
      });
    });
  });

  it('should fire upgrade_prompt_shown with currentModel prop', async () => {
    const onExploreModels = vi.fn();
    const { rerender } = render(
      <PostDownloadPrompt
        userSegment="free"
        downloadCount={1}
        currentModel="premium"
        onExploreModels={onExploreModels}
      />
    );

    rerender(
      <PostDownloadPrompt
        userSegment="free"
        downloadCount={2}
        currentModel="premium"
        onExploreModels={onExploreModels}
      />
    );

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith(
        'upgrade_prompt_shown',
        expect.objectContaining({
          trigger: 'post_download_explore',
          imageVariant: 'premium',
          currentPlan: 'free',
          userSegment: 'free',
          pricingRegion: 'standard',
        })
      );
    });
  });

  it('should fire upgrade_prompt_dismissed on X click', async () => {
    const onExploreModels = vi.fn();
    const { rerender } = render(
      <PostDownloadPrompt userSegment="free" downloadCount={1} onExploreModels={onExploreModels} />
    );
    rerender(
      <PostDownloadPrompt userSegment="free" downloadCount={2} onExploreModels={onExploreModels} />
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Dismiss prompt')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Dismiss prompt'));

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_dismissed', {
      trigger: 'post_download_explore',
      currentPlan: 'free',
      userSegment: 'free',
      pricingRegion: 'standard',
      copyVariant: expect.stringMatching(/^(value|outcome|urgency)$/),
    });

    await waitFor(() => {
      expect(screen.queryByText(/Want sharper, cleaner output/i)).not.toBeInTheDocument();
    });
  });

  it('should call onExploreModels callback when CTA is clicked', async () => {
    const onExploreModels = vi.fn();
    const { rerender } = render(
      <PostDownloadPrompt userSegment="free" downloadCount={1} onExploreModels={onExploreModels} />
    );
    rerender(
      <PostDownloadPrompt userSegment="free" downloadCount={2} onExploreModels={onExploreModels} />
    );
    await waitFor(() => {
      expect(screen.getByText(/Want sharper, cleaner output/i)).toBeInTheDocument();
    });

    const button = screen.getByRole('button', { name: /Upgrade Now/i });
    fireEvent.click(button);

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_clicked', {
      trigger: 'post_download_explore',
      destination: 'purchase_modal',
      currentPlan: 'free',
      userSegment: 'free',
      pricingRegion: 'standard',
      copyVariant: expect.stringMatching(/^(value|outcome|urgency)$/),
    });
    expect(onExploreModels).toHaveBeenCalled();
    expect(mockSetCheckoutTrackingContext).toHaveBeenCalledWith({
      originatingTrigger: 'post_download_explore',
    });
  });

  it('should show prompt on download count increase regardless of cooldown key in localStorage', async () => {
    const onExploreModels = vi.fn();
    // PostDownloadPrompt does not use promptFrequency for cooldown
    // It shows purely based on downloadCount increasing
    localStorage.setItem('prompt_freq_post_download_last_shown', String(Date.now()));

    const { rerender } = render(
      <PostDownloadPrompt userSegment="free" downloadCount={1} onExploreModels={onExploreModels} />
    );

    rerender(
      <PostDownloadPrompt userSegment="free" downloadCount={2} onExploreModels={onExploreModels} />
    );

    await waitFor(() => {
      expect(screen.getByText(/Want sharper, cleaner output/i)).toBeInTheDocument();
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

    const { container } = render(<AfterUpscaleBanner completedCount={3} userSegment="free" />);

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
      'workspace.batchLimit.remainingSlotsMessage':
        'You have {availableSlots} of {limit} slots remaining in your queue.',
      'workspace.batchLimit.securityMessage':
        'This is a security measure to prevent abuse. The limit will reset in approximately 1 hour.',
      'workspace.batchLimit.upgradeButton': 'Upgrade Plan',
      'workspace.batchLimit.upgradeButtonBatch': 'Unlock Batch Processing',
      'workspace.batchLimit.addPartialButton': 'Add images',
      'workspace.batchLimit.cancelButton': 'Cancel',
      'common.cancel': 'Cancel',
      // PostDownloadPrompt translations
      'workspace.postDownloadPrompt.title': 'See what other models can do',
      'workspace.postDownloadPrompt.body': 'Body text',
      'workspace.postDownloadPrompt.cta': 'Explore Models',
      'workspace.postDownloadPrompt.dismiss': 'Dismiss prompt',
      'workspace.postDownloadPrompt.maybeLater': 'Maybe Later',
      // FirstDownloadCelebration translations
      'workspace.progressCelebration.dismiss': 'Dismiss celebration',
      'workspace.progressCelebration.title': 'First upscale complete!',
      'workspace.progressCelebration.subtitle': 'Great job! Your image is ready.',
      'workspace.progressCelebration.uploadAnother': 'Upload Another',
      'workspace.progressCelebration.seePlans': 'See Premium Plans',
      'workspace.progressCelebration.subscribeCta': 'Subscribe & Save',
      'workspace.progressCelebration.skipText': 'Unlock unlimited upscales with Premium',
    };

    const t = (key: string, params?: Record<string, unknown>) => {
      let result = translations[`${ns}.${key}`] ?? key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          result = result.replace(`{${k}}`, String(v));
        });
      }
      return result;
    };
    t.rich = (key: string, params?: Record<string, unknown>) => {
      let result = translations[`${ns}.${key}`] ?? key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          result = result.replace(`{${k}}`, String(v));
        });
      }
      return result;
    };
    t.has = (key: string) => {
      return `${ns}.${key}` in translations;
    };
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
    onUpgrade: vi.fn(),
    serverEnforced: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should render BatchLimitModal with action buttons', () => {
    render(<BatchLimitModal {...defaultProps} />);

    expect(screen.getAllByTestId('button').length).toBeGreaterThan(0);
  });

  it('should fire batch_limit_modal_shown analytics when opened', async () => {
    render(<BatchLimitModal {...defaultProps} />);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith('batch_limit_modal_shown', {
        limit: 1,
        attempted: 3,
        currentCount: 1,
        availableSlots: 0,
        serverEnforced: false,
        userType: 'free',
        copyVariant: expect.any(String),
      });
    });
  });

  it('should show remaining slots message for paid users with partial queue', () => {
    render(<BatchLimitModal {...defaultProps} limit={10} currentCount={7} attempted={5} />);

    expect(screen.getByText(/You have \d+ of \d+ slots remaining/)).toBeInTheDocument();
  });

  it('should NOT show remaining slots message when queue is empty', () => {
    render(<BatchLimitModal {...defaultProps} limit={10} currentCount={0} attempted={15} />);

    expect(screen.queryByText(/slots remaining in your queue/)).not.toBeInTheDocument();
  });

  it('should NOT show remaining slots message when queue is full', () => {
    render(<BatchLimitModal {...defaultProps} limit={10} currentCount={10} attempted={5} />);

    expect(screen.queryByText(/slots remaining in your queue/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Phase 5: FirstDownloadCelebration
// ---------------------------------------------------------------------------

import { FirstDownloadCelebration } from '@/client/components/features/workspace/FirstDownloadCelebration';

describe('Phase 5: FirstDownloadCelebration', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    // Set up a working localStorage
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
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('should call onExploreModels callback instead of navigating', async () => {
    const onExploreModels = vi.fn();
    render(
      <FirstDownloadCelebration
        userSegment="free"
        source="upload"
        onExploreModels={onExploreModels}
        onUploadAnother={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    const button = screen.getByText(/See Premium Plans/i);
    fireEvent.click(button);

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_clicked', {
      trigger: 'celebration',
      destination: 'purchase_modal',
      currentPlan: 'free',
      userSegment: 'free',
    });
    expect(onExploreModels).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockSetCheckoutTrackingContext).toHaveBeenCalledWith({
      originatingTrigger: 'celebration_explore',
    });
  });

  it('should fire upgrade_prompt_clicked with purchase_modal destination', async () => {
    const onExploreModels = vi.fn();
    render(
      <FirstDownloadCelebration
        userSegment="free"
        source="upload"
        onExploreModels={onExploreModels}
        onUploadAnother={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    const button = screen.getByText(/See Premium Plans/i);
    fireEvent.click(button);

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_clicked', {
      trigger: 'celebration',
      destination: 'purchase_modal',
      currentPlan: 'free',
      userSegment: 'free',
    });
  });

  it('should mark celebration as shown before calling onExploreModels', async () => {
    const onExploreModels = vi.fn();
    render(
      <FirstDownloadCelebration
        userSegment="free"
        source="upload"
        onExploreModels={onExploreModels}
        onUploadAnother={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    const button = screen.getByText(/See Premium Plans/i);
    fireEvent.click(button);

    // Celebration key should be set in localStorage
    expect(localStorage.getItem('miu_celebration_shown')).toBeTruthy();
  });

  it('should not render if celebration was already shown', async () => {
    // Mark celebration as already shown
    localStorage.setItem('miu_celebration_shown', String(Date.now()));

    const { container } = render(
      <FirstDownloadCelebration
        userSegment="free"
        source="upload"
        onExploreModels={vi.fn()}
        onUploadAnother={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    await new Promise(r => setTimeout(r, 10));
    expect(container.firstChild).toBeNull();
  });

  it('should call onUploadAnother when upload button is clicked', async () => {
    const onUploadAnother = vi.fn();
    render(
      <FirstDownloadCelebration
        userSegment="free"
        source="upload"
        onExploreModels={vi.fn()}
        onUploadAnother={onUploadAnother}
        onDismiss={vi.fn()}
      />
    );

    const button = screen.getByText(/Upload Another/i);
    fireEvent.click(button);

    expect(onUploadAnother).toHaveBeenCalled();
  });

  it('should call onDismiss when X button is clicked', async () => {
    const onDismiss = vi.fn();
    render(
      <FirstDownloadCelebration
        userSegment="free"
        source="upload"
        onExploreModels={vi.fn()}
        onUploadAnother={vi.fn()}
        onDismiss={onDismiss}
      />
    );

    const dismissButton = screen.getByLabelText(/Dismiss celebration/i);
    fireEvent.click(dismissButton);

    expect(onDismiss).toHaveBeenCalled();
  });

  it('should not show upgrade button for paid users', async () => {
    const { container } = render(
      <FirstDownloadCelebration
        userSegment="subscriber"
        source="upload"
        onExploreModels={vi.fn()}
        onUploadAnother={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText(/See Premium Plans/i)).not.toBeInTheDocument();
    });
    // Should still show upload button for paid users
    expect(screen.getByText(/Upload Another/i)).toBeInTheDocument();
  });
});

describe('Phase 3: UpgradeSuccessBanner fixes', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    // Set up a working localStorage for promptFrequency tests
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
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('UpgradeSuccessBanner should call onUpgrade callback instead of navigating', async () => {
    const onUpgrade = vi.fn();
    render(
      <UpgradeSuccessBanner
        processedCount={3}
        onDismiss={vi.fn()}
        hasSubscription={false}
        onUpgrade={onUpgrade}
      />
    );

    const button = screen.getByRole('button', { name: /See Plans/i });
    fireEvent.click(button);

    expect(onUpgrade).toHaveBeenCalled();
  });

  it('UpgradeSuccessBanner should fire upgrade_prompt_shown with copyVariant on render', async () => {
    render(
      <UpgradeSuccessBanner
        processedCount={3}
        onDismiss={vi.fn()}
        hasSubscription={false}
        onUpgrade={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_shown', {
        trigger: 'after_batch',
        currentPlan: 'free',
        copyVariant: expect.any(String),
        pricingRegion: 'standard',
      });
    });
  });

  it('UpgradeSuccessBanner should fire upgrade_prompt_clicked with purchase_modal destination', async () => {
    const onUpgrade = vi.fn();
    render(
      <UpgradeSuccessBanner
        processedCount={3}
        onDismiss={vi.fn()}
        hasSubscription={false}
        onUpgrade={onUpgrade}
      />
    );

    const button = screen.getByRole('button', { name: /See Plans/i });
    fireEvent.click(button);

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('upgrade_prompt_clicked', {
      trigger: 'after_batch',
      destination: 'purchase_modal',
      currentPlan: 'free',
      copyVariant: expect.any(String),
      pricingRegion: 'standard',
    });
    expect(onUpgrade).toHaveBeenCalled();
  });

  it('UpgradeSuccessBanner should fire upgrade_prompt_dismissed on dismiss', async () => {
    const onDismiss = vi.fn();
    render(
      <UpgradeSuccessBanner
        processedCount={3}
        onDismiss={onDismiss}
        hasSubscription={false}
        onUpgrade={vi.fn()}
      />
    );

    const dismissButton = screen.getByRole('button', { name: /Maybe later/i });
    fireEvent.click(dismissButton);

    expect(mockAnalyticsTrack).toHaveBeenNthCalledWith(1, 'upgrade_prompt_shown', {
      trigger: 'after_batch',
      currentPlan: 'free',
      copyVariant: expect.any(String),
      pricingRegion: 'standard',
    });
    expect(mockAnalyticsTrack).toHaveBeenNthCalledWith(2, 'upgrade_prompt_dismissed', {
      trigger: 'after_batch',
      currentPlan: 'free',
      pricingRegion: 'standard',
    });
    expect(onDismiss).toHaveBeenCalled();
  });

  it('UpgradeSuccessBanner should respect promptFrequency throttling (4h cooldown, max 3/week)', async () => {
    // Simulate banner was shown 3 times this week
    localStorage.setItem('prompt_freq_after_batch_week_count', '3');
    localStorage.setItem('prompt_freq_after_batch_week_start', String(Date.now()));

    const { container } = render(
      <UpgradeSuccessBanner
        processedCount={3}
        onDismiss={vi.fn()}
        hasSubscription={false}
        onUpgrade={vi.fn()}
      />
    );

    await new Promise(r => setTimeout(r, 10));
    expect(container.firstChild).toBeNull();
  });

  it('UpgradeSuccessBanner should respect 4h cooldown', async () => {
    // Simulate banner was shown recently (within 4h)
    localStorage.setItem('prompt_freq_after_batch_last_shown', String(Date.now()));

    const { container } = render(
      <UpgradeSuccessBanner
        processedCount={3}
        onDismiss={vi.fn()}
        hasSubscription={false}
        onUpgrade={vi.fn()}
      />
    );

    await new Promise(r => setTimeout(r, 10));
    expect(container.firstChild).toBeNull();
  });
});
