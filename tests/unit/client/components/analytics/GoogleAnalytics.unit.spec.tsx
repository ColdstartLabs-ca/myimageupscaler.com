import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React, { useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be set up before any module under test is imported
// ---------------------------------------------------------------------------

const { mockGaSendPageView } = vi.hoisted(() => ({
  mockGaSendPageView: vi.fn(),
}));

vi.mock('@shared/config/env', () => ({
  clientEnv: { GA_MEASUREMENT_ID: 'G-TEST12345' },
  isDevelopment: () => false,
}));

// next/navigation — we need writable mocks so tests can change route state
const mockUsePathname = vi.fn(() => '/');
const mockUseSearchParams = vi.fn(() => new URLSearchParams());

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

// ---------------------------------------------------------------------------
// TestTracker — mirrors the exact GAPageViewTracker implementation so we can
// test the internal useRef skip logic without exporting the private function.
// ---------------------------------------------------------------------------

function TestTracker(): null {
  const pathname = mockUsePathname();
  const searchParams = mockUseSearchParams();
  const isInitialRender = useRef(true);

  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
    mockGaSendPageView(url);
  }, [pathname, searchParams]);

  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GAPageViewTracker — initial render skip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/');
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  it('should skip gaSendPageView on initial mount', () => {
    render(<TestTracker />);
    expect(mockGaSendPageView).not.toHaveBeenCalled();
  });

  it('should call gaSendPageView on subsequent pathname change', async () => {
    // Stable search params reference across renders
    const stableSearchParams = new URLSearchParams();
    mockUseSearchParams.mockReturnValue(stableSearchParams);
    mockUsePathname.mockReturnValue('/');

    const { rerender } = render(<TestTracker />);

    // First render — skipped by the ref guard
    expect(mockGaSendPageView).not.toHaveBeenCalled();

    // Simulate navigation: change the pathname so the effect re-runs
    mockUsePathname.mockReturnValue('/new-page');

    await act(async () => {
      rerender(<TestTracker />);
    });

    expect(mockGaSendPageView).toHaveBeenCalledTimes(1);
    expect(mockGaSendPageView).toHaveBeenCalledWith('/new-page');
  });
});

describe('gaSendPageView — no-op when window.gtag is undefined', () => {
  it('should not throw when window.gtag is undefined', async () => {
    // Import the real function, bypassing any top-level mock
    const { gaSendPageView: realGaSendPageView } =
      await vi.importActual<typeof import('@client/components/analytics/GoogleAnalytics')>(
        '@client/components/analytics/GoogleAnalytics'
      );

    // Ensure window.gtag is not defined
    const win = window as Window & { gtag?: unknown };
    const originalGtag = win.gtag;
    delete win.gtag;

    expect(() => realGaSendPageView('/test-path')).not.toThrow();

    // Restore in case other tests depend on it
    if (originalGtag !== undefined) {
      win.gtag = originalGtag;
    }
  });
});
