/**
 * Unit tests for Phase 3: Progress Indicator
 *
 * Tests for:
 * 1. ProgressSteps component - 3-step progress indicator for first-time users
 * 2. FirstDownloadCelebration component - celebration modal with confetti
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
  cn: (...args: unknown[]) =>
    args
      .flatMap(arg => {
        if (!arg) return [];
        if (typeof arg === 'string') return [arg];
        if (typeof arg === 'object' && arg !== null)
          return Object.entries(arg as Record<string, boolean>)
            .filter(([, v]) => v)
            .map(([k]) => k);
        return [];
      })
      .join(' '),
}));

vi.mock('lucide-react', () => ({
  Check: () => <span data-testid="icon-check" />,
  Sparkles: () => <span data-testid="icon-sparkles" />,
  Upload: () => <span data-testid="icon-upload" />,
  ArrowRight: () => <span data-testid="icon-arrow-right" />,
  X: () => <span data-testid="icon-x" />,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    // Map short keys that components call with t('step1'), t('title'), etc.
    const translations: Record<string, string> = {
      step1: 'Upload',
      step2: 'Configure',
      step3: 'Download',
      ariaLabel: 'Upscaling progress steps',
      title: 'First upscale complete!',
      subtitle: 'Great job!',
      uploadAnother: 'Upload Another',
      seePlans: 'See Premium Plans',
      skipText: 'Unlock unlimited upscales with Premium',
      dismiss: 'Dismiss celebration',
    };
    return translations[key] ?? key;
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  ProgressSteps,
  checkIsFirstTimeUser,
  markFirstUploadCompleted,
  FIRST_UPLOAD_COMPLETED_KEY,
  ONBOARDING_STARTED_KEY,
} from '@/client/components/features/workspace/ProgressSteps';
import {
  FirstDownloadCelebration,
  shouldShowCelebration,
} from '@/client/components/features/workspace/FirstDownloadCelebration';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Override the vi.fn() mock localStorage with a real Map-based implementation
// so that tests that read/write localStorage work correctly.
let storage: Map<string, string>;

function setupWorkingLocalStorage() {
  storage = new Map<string, string>();
  vi.mocked(localStorage.getItem).mockImplementation((key: string) => storage.get(key) ?? null);
  vi.mocked(localStorage.setItem).mockImplementation((key: string, value: string) => {
    storage.set(key, value);
  });
  vi.mocked(localStorage.removeItem).mockImplementation((key: string) => {
    storage.delete(key);
  });
  vi.mocked(localStorage.clear).mockImplementation(() => {
    storage.clear();
  });
}

// ---------------------------------------------------------------------------
// ProgressSteps Tests
// ---------------------------------------------------------------------------

describe('ProgressSteps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWorkingLocalStorage();
  });

  afterEach(() => {
    storage.clear();
  });

  describe('Step 1: Active when no image', () => {
    it('should show Step 1 active when no image', () => {
      render(<ProgressSteps currentStep={1} isFirstUpload={true} />);

      // Step 1 should be marked active
      const step1Text = screen.getByText('Upload');
      expect(step1Text).toBeInTheDocument();
      expect(step1Text).toHaveClass('text-accent');
    });

    it('should mark Steps 2 and 3 as pending', () => {
      render(<ProgressSteps currentStep={1} isFirstUpload={true} />);

      // Step 2 should be pending
      const step2Text = screen.getByText('Configure');
      expect(step2Text).toBeInTheDocument();
      expect(step2Text).toHaveClass('text-text-muted');

      // Step 3 should be pending
      const step3Text = screen.getByText('Download');
      expect(step3Text).toBeInTheDocument();
      expect(step3Text).toHaveClass('text-text-muted');
    });
  });

  describe('Step 2: Active after upload', () => {
    it('should advance to Step 2 after upload', () => {
      const { rerender } = render(<ProgressSteps currentStep={1} isFirstUpload={true} />);

      // Simulate state change: user has uploaded an image
      rerender(<ProgressSteps currentStep={2} isFirstUpload={true} />);

      // Step 2 should now be active
      const step2Text = screen.getByText('Configure');
      expect(step2Text).toHaveClass('text-accent');
    });
  });

  describe('Step 3: Active after processing', () => {
    it('should advance to Step 3 after processing', () => {
      const { rerender } = render(<ProgressSteps currentStep={1} isFirstUpload={true} />);

      // Simulate processing completion
      rerender(<ProgressSteps currentStep={3} isFirstUpload={true} />);

      // Step 3 should now be active
      const step3Text = screen.getByText('Download');
      expect(step3Text).toHaveClass('text-accent');
    });
  });

  describe('Returning users', () => {
    it('should still render progress steps (parent component controls visibility)', () => {
      // Set flag as if user has already completed onboarding
      localStorage.setItem(FIRST_UPLOAD_COMPLETED_KEY, Date.now().toString());

      // ProgressSteps component renders regardless of isFirstUpload
      // The parent component is responsible for conditionally rendering it
      const { container } = render(<ProgressSteps currentStep={1} isFirstUpload={false} />);
      // Component renders - it's the parent's job to decide whether to show it
      expect(container.firstChild).not.toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// FirstDownloadCelebration Tests
// ---------------------------------------------------------------------------

describe('FirstDownloadCelebration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWorkingLocalStorage();
  });

  afterEach(() => {
    storage.clear();
  });

  it('should show celebration on first download', () => {
    render(<FirstDownloadCelebration isFreeUser={true} />);

    expect(screen.getByText('First upscale complete!')).toBeInTheDocument();
    expect(screen.getByText('Upload Another')).toBeInTheDocument();
    expect(screen.getByText('See Premium Plans')).toBeInTheDocument();
  });

  it('should not show celebration when already shown', () => {
    localStorage.setItem('miu_celebration_shown', Date.now().toString());

    const { container } = render(<FirstDownloadCelebration isFreeUser={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('should not show "See Premium Plans" button for paid users', () => {
    render(<FirstDownloadCelebration isFreeUser={false} />);
    expect(screen.queryByText('See Premium Plans')).not.toBeInTheDocument();
  });

  it('should call onUploadAnother when upload button clicked', () => {
    const handleUploadAnother = vi.fn();
    render(<FirstDownloadCelebration isFreeUser={true} onUploadAnother={handleUploadAnother} />);

    fireEvent.click(screen.getByText('Upload Another'));
    expect(handleUploadAnother).toHaveBeenCalled();
  });

  it('should call onUpgrade when See Plans clicked', () => {
    const handleUpgrade = vi.fn();
    render(<FirstDownloadCelebration isFreeUser={true} onUpgrade={handleUpgrade} />);

    fireEvent.click(screen.getByText('See Premium Plans'));

    expect(handleUpgrade).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('should dismiss on X click', () => {
    const handleDismiss = vi.fn();
    render(<FirstDownloadCelebration isFreeUser={true} onDismiss={handleDismiss} />);

    fireEvent.click(screen.getByTestId('icon-x'));
    expect(handleDismiss).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Analytics Tracking Tests
// ---------------------------------------------------------------------------

describe('Analytics Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWorkingLocalStorage();
  });

  afterEach(() => {
    storage.clear();
  });

  it('should track onboarding_started on mount', () => {
    render(<ProgressSteps currentStep={1} isFirstUpload={true} />);

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('onboarding_started', {
      timestamp: expect.any(Number),
    });
  });

  it('should track onboarding_step_viewed when step changes', async () => {
    const startTime = Date.now();
    localStorage.setItem(ONBOARDING_STARTED_KEY, startTime.toString());

    const { rerender } = render(<ProgressSteps currentStep={1} isFirstUpload={true} />);

    // Move to step 2
    rerender(<ProgressSteps currentStep={2} isFirstUpload={true} />);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith('onboarding_step_viewed', {
        step: 2,
        durationToStepMs: expect.any(Number),
      });
    });
  });

  it('should track first_upload_completed when marking upload complete', () => {
    render(<ProgressSteps currentStep={1} isFirstUpload={true} />);

    markFirstUploadCompleted('upload', 5000);

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('first_upload_completed', {
      source: 'upload',
      durationMs: 5000,
    });
  });

  it('should track onboarding_completed when celebration shows', async () => {
    const startTime = Date.now() - 5000;
    localStorage.setItem(ONBOARDING_STARTED_KEY, startTime.toString());

    render(<FirstDownloadCelebration isFreeUser={true} />);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith('onboarding_completed', {
        totalDurationMs: expect.any(Number),
        source: 'upload',
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Helper Functions Tests
// ---------------------------------------------------------------------------

describe('Helper Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWorkingLocalStorage();
  });

  afterEach(() => {
    storage.clear();
  });

  describe('checkIsFirstTimeUser', () => {
    it('should return true when localStorage does not have first upload flag', () => {
      localStorage.removeItem(FIRST_UPLOAD_COMPLETED_KEY);
      expect(checkIsFirstTimeUser()).toBe(true);
    });

    it('should return false when localStorage has first upload flag', () => {
      localStorage.setItem(FIRST_UPLOAD_COMPLETED_KEY, Date.now().toString());
      expect(checkIsFirstTimeUser()).toBe(false);
    });
  });

  describe('shouldShowCelebration', () => {
    it('should return true when celebration not yet shown', () => {
      localStorage.removeItem('miu_celebration_shown');
      expect(shouldShowCelebration()).toBe(true);
    });

    it('should return false when celebration already shown', () => {
      localStorage.setItem('miu_celebration_shown', Date.now().toString());
      expect(shouldShowCelebration()).toBe(false);
    });
  });
});
