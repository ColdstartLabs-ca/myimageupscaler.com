import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const { mockSetCheckoutTrackingContext } = vi.hoisted(() => ({
  mockSetCheckoutTrackingContext: vi.fn(),
}));

vi.mock('@client/utils/checkoutTrackingContext', () => ({
  setCheckoutTrackingContext: mockSetCheckoutTrackingContext,
  getCheckoutTrackingContext: vi.fn(() => null),
}));

vi.mock('@client/analytics', () => ({
  analytics: { track: vi.fn(), isEnabled: () => true },
}));

vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: { track: vi.fn(), isEnabled: () => true },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const map: Record<string, string> = {
      'workspace.progressCelebration.dismiss': 'Dismiss celebration',
      'workspace.progressCelebration.title': 'First upscale complete!',
      'workspace.progressCelebration.subtitle': 'Subtitle',
      'workspace.progressCelebration.uploadAnother': 'Upload Another',
      'workspace.progressCelebration.seePlans': 'See Premium Plans',
      'workspace.progressCelebration.exploreModels': 'Explore Models',
      'workspace.progressCelebration.skipText': 'Skip',
    };
    return (key: string) => map[`workspace.progressCelebration.${key}`] ?? key;
  },
}));

vi.mock('lucide-react', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const stub = (props: Record<string, unknown>) =>
    React.createElement('span', { 'data-testid': 'icon', ...props });
  return { ...actual, Sparkles: stub, Upload: stub, ArrowRight: stub, X: stub };
});

vi.mock('@client/utils/cn', () => ({
  cn: (...args: (string | undefined | null | false)[]) => args.filter(Boolean).join(' '),
}));

import { FirstDownloadCelebration } from '@client/components/features/workspace/FirstDownloadCelebration';

describe('FirstDownloadCelebration — attribution', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.unstubAllGlobals();
  });

  test("should set originatingTrigger='celebration_explore' before onExploreModels", () => {
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

    fireEvent.click(screen.getByText('See Premium Plans'));

    expect(mockSetCheckoutTrackingContext).toHaveBeenCalledWith({
      originatingTrigger: 'celebration_explore',
    });

    const contextCallOrder = mockSetCheckoutTrackingContext.mock.invocationCallOrder[0];
    const exploreCallOrder = onExploreModels.mock.invocationCallOrder[0];
    expect(contextCallOrder).toBeLessThan(exploreCallOrder);
  });
});
