/**
 * Unit tests for Phase 2: Sample Images feature
 *
 * Tests cover:
 * - SampleImageSelector component rendering and analytics
 * - useSampleImages hook functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, renderHook } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Module mocks (must be before imports)
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

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    // Components call t('title'), t('tryThis'), t('types.photo.title'), etc.
    // (short keys relative to the namespace, not full paths)
    const translations: Record<string, string> = {
      title: 'Try with a sample image',
      subtitle: 'No image handy? Try one of these to see the upscaler in action.',
      'types.photo.title': 'Photo',
      'types.photo.description': 'Portrait and general photos',
      'types.illustration.title': 'Illustration',
      'types.illustration.description': 'Digital art and vectors',
      'types.old_photo.title': 'Old Photo',
      'types.old_photo.description': 'Restoration of vintage photos',
      tryThis: 'Try this',
      scaleFactor: '{scale}x upscale',
    };
    let result = translations[key] ?? key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        result = result.replace(`{${k}}`, String(v));
      });
    }
    return result;
  },
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

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Image: () => React.createElement('span', { 'data-testid': 'icon-image' }),
  Sparkles: () => React.createElement('span', { 'data-testid': 'icon-sparkles' }),
  Clock: () => React.createElement('span', { 'data-testid': 'icon-clock' }),
  Palette: () => React.createElement('span', { 'data-testid': 'icon-palette' }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  SampleImageSelector,
  ISampleImageSelectorProps,
} from '@/client/components/features/workspace/SampleImageSelector';
import { useSampleImages } from '@/client/hooks/useSampleImages';
import {
  SAMPLE_IMAGES,
  SAMPLE_IMAGES_USED_KEY,
  ONBOARDING_COMPLETED_KEY,
} from '@/shared/config/sample-images.config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Override the vi.fn() mock localStorage with a real Map-based implementation
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
// SampleImageSelector Component Tests
// ---------------------------------------------------------------------------

describe('SampleImageSelector', () => {
  const defaultProps: ISampleImageSelectorProps = {
    onSampleSelect: vi.fn(),
    isVisible: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupWorkingLocalStorage();
  });

  afterEach(() => {
    storage.clear();
  });

  it('should render 3 sample image cards', () => {
    render(<SampleImageSelector {...defaultProps} />);

    // Check all 3 sample types are rendered
    expect(screen.getByText('Photo')).toBeInTheDocument();
    expect(screen.getByText('Illustration')).toBeInTheDocument();
    expect(screen.getByText('Old Photo')).toBeInTheDocument();
  });

  it('should render correct metadata for each sample card', () => {
    render(<SampleImageSelector {...defaultProps} />);

    // Photo card
    expect(screen.getByText('Portrait and general photos')).toBeInTheDocument();

    // Illustration card
    expect(screen.getByText('Digital art and vectors')).toBeInTheDocument();

    // Old Photo card
    expect(screen.getByText('Restoration of vintage photos')).toBeInTheDocument();
  });

  it('should not render when isVisible is false', () => {
    const { container } = render(<SampleImageSelector {...defaultProps} isVisible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('should fire sample_image_selector_viewed event when component becomes visible', async () => {
    const { rerender } = render(<SampleImageSelector {...defaultProps} isVisible={false} />);

    expect(mockAnalyticsTrack).not.toHaveBeenCalledWith(
      'sample_image_selector_viewed',
      expect.any(Object)
    );

    // Make component visible
    rerender(<SampleImageSelector {...defaultProps} isVisible={true} />);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith('sample_image_selector_viewed', {
        availableSamples: 3,
      });
    });
  });

  it('should fire sample_image_selector_viewed only once even if re-rendered multiple times', async () => {
    const { rerender } = render(<SampleImageSelector {...defaultProps} isVisible={true} />);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith('sample_image_selector_viewed', {
        availableSamples: 3,
      });
    });

    vi.clearAllMocks();
    setupWorkingLocalStorage();

    // Re-render with same visibility - should NOT fire again
    rerender(<SampleImageSelector {...defaultProps} isVisible={true} />);

    await new Promise(r => setTimeout(r, 10));
    expect(mockAnalyticsTrack).not.toHaveBeenCalledWith(
      'sample_image_selector_viewed',
      expect.any(Object)
    );
  });

  it('should fire sample_image_selected on card click', async () => {
    const onSampleSelect = vi.fn();
    render(<SampleImageSelector {...defaultProps} onSampleSelect={onSampleSelect} />);

    // Find and click the Photo card's "Try this" button
    const tryButtons = screen.getAllByRole('button', { name: /Try this/i });
    fireEvent.click(tryButtons[0]);

    await waitFor(() => {
      expect(mockAnalyticsTrack).toHaveBeenCalledWith(
        'sample_image_selected',
        expect.objectContaining({
          sampleType: expect.any(String),
          sampleId: expect.any(String),
          qualityTier: expect.any(String),
        })
      );
    });
  });

  it('should call onSampleSelect with correct sample data on card click', async () => {
    const onSampleSelect = vi.fn();
    render(<SampleImageSelector {...defaultProps} onSampleSelect={onSampleSelect} />);

    const tryButtons = screen.getAllByRole('button', { name: /Try this/i });
    fireEvent.click(tryButtons[0]); // Click first sample (Photo)

    await waitFor(() => {
      expect(onSampleSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'photo',
          id: 'sample-photo',
        })
      );
    });
  });

  it('should store used samples in localStorage after selection', async () => {
    render(<SampleImageSelector {...defaultProps} />);

    const tryButtons = screen.getAllByRole('button', { name: /Try this/i });
    fireEvent.click(tryButtons[0]);

    await waitFor(() => {
      expect(localStorage.setItem).toHaveBeenCalledWith(
        SAMPLE_IMAGES_USED_KEY,
        expect.stringContaining('sample-photo')
      );
    });
  });

  it('should not set onboarding completed flag in localStorage after first sample selection', async () => {
    render(<SampleImageSelector {...defaultProps} />);

    const tryButtons = screen.getAllByRole('button', { name: /Try this/i });
    fireEvent.click(tryButtons[0]);

    await waitFor(() => {
      expect(localStorage.setItem).not.toHaveBeenCalledWith(ONBOARDING_COMPLETED_KEY, 'true');
    });
  });
});

// ---------------------------------------------------------------------------
// useSampleImages Hook Tests
// ---------------------------------------------------------------------------

describe('useSampleImages hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWorkingLocalStorage();
  });

  afterEach(() => {
    storage.clear();
  });

  it('should return all sample images', () => {
    const { result } = renderHook(() => useSampleImages());

    expect(result.current.samples).toHaveLength(3);
    expect(result.current.samples).toEqual(SAMPLE_IMAGES);
  });

  it('should return empty usedSampleIds initially', () => {
    const { result } = renderHook(() => useSampleImages());

    expect(result.current.usedSampleIds).toEqual([]);
  });

  it('should return hasCompletedOnboarding as false initially', () => {
    const { result } = renderHook(() => useSampleImages());

    expect(result.current.hasCompletedOnboarding).toBe(false);
  });

  it('should update usedSampleIds after selectSample is called', async () => {
    const { result } = renderHook(() => useSampleImages());

    await act(async () => {
      result.current.selectSample('sample-photo');
    });

    expect(result.current.usedSampleIds).toContain('sample-photo');
  });

  it('should set selectedSample after selectSample is called', async () => {
    const { result } = renderHook(() => useSampleImages());

    expect(result.current.selectedSample).toBeNull();

    await act(async () => {
      result.current.selectSample('sample-photo');
    });

    expect(result.current.selectedSample).not.toBeNull();
    expect(result.current.selectedSample?.id).toBe('sample-photo');
    expect(result.current.selectedSample?.type).toBe('photo');
  });

  it('should fire sample_image_selected analytics event on selectSample', async () => {
    const { result } = renderHook(() => useSampleImages());

    await act(async () => {
      result.current.selectSample('sample-illustration');
    });

    expect(mockAnalyticsTrack).toHaveBeenCalledWith(
      'sample_image_selected',
      expect.objectContaining({
        sampleType: 'illustration',
        sampleId: 'sample-illustration',
      })
    );
  });

  it('should not duplicate sample IDs in usedSampleIds when selected multiple times', async () => {
    const { result } = renderHook(() => useSampleImages());

    await act(async () => {
      result.current.selectSample('sample-photo');
    });

    await act(async () => {
      result.current.selectSample('sample-photo');
    });

    expect(result.current.usedSampleIds.filter(id => id === 'sample-photo')).toHaveLength(1);
  });

  it('should keep hasCompletedOnboarding false after selecting a sample', async () => {
    const { result } = renderHook(() => useSampleImages());

    expect(result.current.hasCompletedOnboarding).toBe(false);

    await act(async () => {
      result.current.selectSample('sample-photo');
    });

    expect(result.current.hasCompletedOnboarding).toBe(false);
  });

  it('should markSampleProcessed fire analytics with duration', async () => {
    const { result } = renderHook(() => useSampleImages());

    await act(async () => {
      result.current.markSampleProcessed('sample-photo', 1500);
    });

    expect(mockAnalyticsTrack).toHaveBeenCalledWith('sample_image_processed', {
      sampleType: 'photo',
      sampleId: 'sample-photo',
      durationMs: 1500,
      qualityTier: 'quick',
    });
  });

  it('should resetSampleUsage clear all state', async () => {
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
    const { result } = renderHook(() => useSampleImages());

    // Select a sample first
    await act(async () => {
      result.current.selectSample('sample-photo');
    });

    expect(result.current.usedSampleIds).toHaveLength(1);
    expect(result.current.hasCompletedOnboarding).toBe(true);
    expect(result.current.selectedSample).not.toBeNull();

    // Reset
    await act(async () => {
      result.current.resetSampleUsage();
    });

    expect(result.current.usedSampleIds).toEqual([]);
    expect(result.current.hasCompletedOnboarding).toBe(false);
    expect(result.current.selectedSample).toBeNull();
  });

  it('should persist usedSampleIds to localStorage', async () => {
    const { result } = renderHook(() => useSampleImages());

    await act(async () => {
      result.current.selectSample('sample-photo');
    });

    expect(localStorage.setItem).toHaveBeenCalledWith(
      SAMPLE_IMAGES_USED_KEY,
      JSON.stringify(['sample-photo'])
    );
  });

  it('should load usedSampleIds from localStorage on mount', async () => {
    // Pre-populate localStorage before mounting
    localStorage.setItem(SAMPLE_IMAGES_USED_KEY, JSON.stringify(['sample-illustration']));
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');

    const { result } = renderHook(() => useSampleImages());

    // Wait for useEffect to run
    await waitFor(() => {
      expect(result.current.usedSampleIds).toContain('sample-illustration');
    });
    expect(result.current.hasCompletedOnboarding).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sample Images Config Tests
// ---------------------------------------------------------------------------

describe('sample-images.config', () => {
  it('should have exactly 3 sample images', () => {
    expect(SAMPLE_IMAGES).toHaveLength(3);
  });

  it('should have all required properties for each sample', () => {
    SAMPLE_IMAGES.forEach(sample => {
      expect(sample).toHaveProperty('id');
      expect(sample).toHaveProperty('type');
      expect(sample).toHaveProperty('beforeSrc');
      expect(sample).toHaveProperty('afterSrc');
      expect(sample).toHaveProperty('qualityTier');
      expect(sample).toHaveProperty('scaleFactor');
      expect(sample).toHaveProperty('title');
      expect(sample).toHaveProperty('description');
    });
  });

  it('should have unique IDs for each sample', () => {
    const ids = SAMPLE_IMAGES.map(s => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(SAMPLE_IMAGES.length);
  });

  it('should have valid sample types', () => {
    const validTypes = ['photo', 'illustration', 'old_photo'];
    SAMPLE_IMAGES.forEach(sample => {
      expect(validTypes).toContain(sample.type);
    });
  });

  it('should have valid scale factors', () => {
    const validScales = [2, 4, 8];
    SAMPLE_IMAGES.forEach(sample => {
      expect(validScales).toContain(sample.scaleFactor);
    });
  });
});
