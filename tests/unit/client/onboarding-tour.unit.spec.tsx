/**
 * Unit tests for Phase 4: Onboarding Tooltips
 *
 * Tests for:
 * 1. useOnboardingTour hook - localStorage state, analytics, navigation
 * 2. OnboardingTour component - rendering, step navigation, skip/complete
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Module mocks (must be before imports of the modules under test)
// ---------------------------------------------------------------------------

const { mockAnalyticsTrack } = vi.hoisted(() => ({
  mockAnalyticsTrack: vi.fn(),
}));

vi.mock('@client/analytics', () => ({
  analytics: {
    track: mockAnalyticsTrack,
    isEnabled: () => true,
  },
}));

vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: {
    track: mockAnalyticsTrack,
    isEnabled: () => true,
  },
}));

// Mock createPortal so tooltip renders inline during tests
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>();
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      next: 'Next',
      previous: 'Previous',
      skip: 'Skip tour',
      finish: 'Finish',
      stepOf: `Step ${params?.current ?? '?'} of ${params?.total ?? '?'}`,
    };
    return translations[key] ?? key;
  },
}));

vi.mock('@client/utils/cn', () => ({
  cn: (...args: (string | undefined | null | false)[]) => args.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  X: () => React.createElement('span', { 'data-testid': 'icon-x' }),
  ChevronLeft: () => React.createElement('span', { 'data-testid': 'icon-chevron-left' }),
  ChevronRight: () => React.createElement('span', { 'data-testid': 'icon-chevron-right' }),
  Check: () => React.createElement('span', { 'data-testid': 'icon-check' }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { useOnboardingTour, TOUR_COMPLETED_KEY, TOUR_SKIPPED_KEY } from '@/client/hooks/useOnboardingTour';
import { OnboardingTour } from '@/client/components/features/workspace/OnboardingTour';
import type { ITourStep, IUseOnboardingTourReturn } from '@/client/hooks/useOnboardingTour';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const steps: ITourStep[] = [
  {
    id: 'upload-zone',
    target: '[data-testid="upload-zone"]',
    title: 'Upload Zone',
    content: 'Drag and drop any image here, or click to browse',
    position: 'bottom',
  },
  {
    id: 'quality-selector',
    target: '[data-testid="quality-selector"]',
    title: 'Quality Tier',
    content: 'Choose your quality tier. Higher quality = better results',
    position: 'left',
  },
  {
    id: 'download-button',
    target: '[data-testid="download-button"]',
    title: 'Download',
    content: 'Click to download your upscaled image',
    position: 'bottom',
  },
];

// ---------------------------------------------------------------------------
// Helper: build a mock tourState for component tests
// ---------------------------------------------------------------------------

function buildMockTourState(overrides: Partial<IUseOnboardingTourReturn> = {}): IUseOnboardingTourReturn {
  return {
    isActive: true,
    currentStepIndex: 0,
    trigger: 'manual',
    shouldShowTour: true,
    startTour: vi.fn(),
    nextStep: vi.fn(),
    prevStep: vi.fn(),
    completeTour: vi.fn(),
    skipTour: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// useOnboardingTour hook tests
// ---------------------------------------------------------------------------

describe('useOnboardingTour hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: localStorage.getItem returns null (no flags set)
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should return shouldShowTour as true for first-time users', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { result } = renderHook(() => useOnboardingTour());
    expect(result.current.shouldShowTour).toBe(true);
  });

  it('should return shouldShowTour as false when tour is completed', async () => {
    // Mock localStorage.getItem to return 'true' for the completed key
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === TOUR_COMPLETED_KEY) return 'true';
      return null;
    });

    const { result } = renderHook(() => useOnboardingTour());

    // useEffect runs after mount
    await act(async () => {});

    expect(result.current.shouldShowTour).toBe(false);
  });

  it('should return shouldShowTour as false when tour is skipped', async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === TOUR_SKIPPED_KEY) return 'true';
      return null;
    });

    const { result } = renderHook(() => useOnboardingTour());

    await act(async () => {});

    expect(result.current.shouldShowTour).toBe(false);
  });

  it('should set isActive and trigger when startTour is called', () => {
    const { result } = renderHook(() => useOnboardingTour());

    expect(result.current.isActive).toBe(false);
    expect(result.current.trigger).toBeNull();

    act(() => {
      result.current.startTour('manual');
    });

    expect(result.current.isActive).toBe(true);
    expect(result.current.trigger).toBe('manual');
  });

  it('should advance currentStepIndex on nextStep', () => {
    const { result } = renderHook(() => useOnboardingTour());

    act(() => {
      result.current.startTour('manual');
    });

    expect(result.current.currentStepIndex).toBe(0);

    act(() => {
      result.current.nextStep();
    });

    expect(result.current.currentStepIndex).toBe(1);
  });

  it('should decrement currentStepIndex on prevStep', () => {
    const { result } = renderHook(() => useOnboardingTour());

    act(() => {
      result.current.startTour('manual');
    });

    act(() => {
      result.current.nextStep();
    });

    expect(result.current.currentStepIndex).toBe(1);

    act(() => {
      result.current.prevStep();
    });

    expect(result.current.currentStepIndex).toBe(0);
  });

  it('should set TOUR_COMPLETED_KEY in localStorage on completeTour', () => {
    const { result } = renderHook(() => useOnboardingTour());

    act(() => {
      result.current.startTour('manual');
    });

    act(() => {
      result.current.completeTour();
    });

    expect(localStorage.setItem).toHaveBeenCalledWith(TOUR_COMPLETED_KEY, 'true');
    expect(result.current.isActive).toBe(false);
  });

  it('should set TOUR_SKIPPED_KEY in localStorage on skipTour', () => {
    const { result } = renderHook(() => useOnboardingTour());

    act(() => {
      result.current.startTour('manual');
    });

    act(() => {
      result.current.skipTour(0);
    });

    expect(localStorage.setItem).toHaveBeenCalledWith(TOUR_SKIPPED_KEY, 'true');
    expect(result.current.isActive).toBe(false);
  });

  it('should fire onboarding_tour_started analytics event on startTour', () => {
    const { result } = renderHook(() => useOnboardingTour());

    act(() => {
      result.current.startTour('auto');
    });

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('onboarding_tour_started', {
      trigger: 'auto',
    });
  });

  it('should fire onboarding_tour_completed analytics event on completeTour', () => {
    const { result } = renderHook(() => useOnboardingTour());

    act(() => {
      result.current.startTour('manual');
    });

    vi.clearAllMocks();

    act(() => {
      result.current.completeTour();
    });

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('onboarding_tour_completed', {});
  });

  it('should fire onboarding_tour_skipped analytics event on skipTour', () => {
    const { result } = renderHook(() => useOnboardingTour());

    act(() => {
      result.current.startTour('manual');
    });

    vi.clearAllMocks();

    act(() => {
      result.current.skipTour(1);
    });

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('onboarding_tour_skipped', {
      atStep: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// OnboardingTour component tests
// ---------------------------------------------------------------------------

describe('OnboardingTour component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: localStorage.getItem returns null (no flags set)
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should render first step on tour start', () => {
    const tourState = buildMockTourState({ currentStepIndex: 0 });

    render(<OnboardingTour steps={steps} tourState={tourState} />);

    expect(screen.getByTestId('tour-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('tooltip-title-upload-zone')).toBeInTheDocument();
    expect(screen.getByText('Upload Zone')).toBeInTheDocument();
    expect(screen.getByText('Drag and drop any image here, or click to browse')).toBeInTheDocument();
  });

  it('should advance to next step on Next click', () => {
    const nextStep = vi.fn();
    const tourState = buildMockTourState({ currentStepIndex: 0, nextStep });

    render(<OnboardingTour steps={steps} tourState={tourState} />);

    fireEvent.click(screen.getByText('Next'));

    expect(nextStep).toHaveBeenCalled();
  });

  it('should show second step content when currentStepIndex is 1', () => {
    const tourState = buildMockTourState({ currentStepIndex: 1 });

    render(<OnboardingTour steps={steps} tourState={tourState} />);

    expect(screen.getByTestId('tooltip-title-quality-selector')).toBeInTheDocument();
    expect(screen.getByText('Quality Tier')).toBeInTheDocument();
    expect(screen.getByText('Choose your quality tier. Higher quality = better results')).toBeInTheDocument();
  });

  it('should show Finish button on last step', () => {
    const tourState = buildMockTourState({ currentStepIndex: 2 });

    render(<OnboardingTour steps={steps} tourState={tourState} />);

    expect(screen.getByText('Finish')).toBeInTheDocument();
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });

  it('should complete tour and set localStorage flag when Finish is clicked', () => {
    const completeTour = vi.fn();
    const tourState = buildMockTourState({ currentStepIndex: 2, completeTour });

    render(<OnboardingTour steps={steps} tourState={tourState} />);

    fireEvent.click(screen.getByText('Finish'));

    expect(completeTour).toHaveBeenCalled();
  });

  it('should skip tour and set skip flag when Skip tour is clicked', () => {
    const skipTour = vi.fn();
    const tourState = buildMockTourState({ currentStepIndex: 0, skipTour });

    render(<OnboardingTour steps={steps} tourState={tourState} />);

    fireEvent.click(screen.getByText('Skip tour'));

    expect(skipTour).toHaveBeenCalledWith(0);
  });

  it('should not show tour to returning users (isActive false renders nothing)', () => {
    const tourState = buildMockTourState({ isActive: false });

    const { container } = render(<OnboardingTour steps={steps} tourState={tourState} />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('tour-overlay')).not.toBeInTheDocument();
  });

  it('should show Previous button when not on first step', () => {
    const prevStep = vi.fn();
    const tourState = buildMockTourState({ currentStepIndex: 1, prevStep });

    render(<OnboardingTour steps={steps} tourState={tourState} />);

    const prevButton = screen.getByText('Previous');
    expect(prevButton).toBeInTheDocument();

    fireEvent.click(prevButton);
    expect(prevStep).toHaveBeenCalled();
  });

  it('should not show Previous button on first step', () => {
    const tourState = buildMockTourState({ currentStepIndex: 0 });

    render(<OnboardingTour steps={steps} tourState={tourState} />);

    expect(screen.queryByText('Previous')).not.toBeInTheDocument();
  });

  it('should display correct step indicator text', () => {
    const tourState = buildMockTourState({ currentStepIndex: 1 });

    render(<OnboardingTour steps={steps} tourState={tourState} />);

    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
  });
});
