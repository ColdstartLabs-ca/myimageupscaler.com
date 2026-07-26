import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ENHANCEMENT_SETTINGS,
  ProcessingStatus,
  type IBatchItem,
  type IUpscaleConfig,
} from '@/shared/types/coreflow.types';

const mocks = vi.hoisted(() => ({
  processImage: vi.fn(),
  showToast: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@client/analytics', () => ({
  analytics: { track: mocks.track },
}));

vi.mock('@client/store/toastStore', () => ({
  useToastStore: (selector: (state: { showToast: typeof mocks.showToast }) => unknown) =>
    selector({ showToast: mocks.showToast }),
}));

vi.mock('@client/store/userStore', () => {
  const useUserStore = vi.fn();
  useUserStore.getState = () => ({ updateCreditsFromProcessing: vi.fn() });

  return {
    useUserData: () => ({ profile: { id: 'user-1' }, totalCredits: 0 }),
    useUserStore,
  };
});

vi.mock('@client/utils/api-client', () => ({
  BatchLimitError: class BatchLimitError extends Error {},
  FreeLimitExceededError: class FreeLimitExceededError extends Error {},
  processImage: mocks.processImage,
}));

vi.mock('@client/utils/upscale-file-preprocessing', () => ({
  prepareFileForProcessing: (file: File) => Promise.resolve({ file, resized: false }),
}));

vi.mock('@client/utils/file-validation', () => ({
  loadImageDimensions: () => Promise.resolve({ width: 100, height: 100 }),
}));

vi.mock('@shared/config/subscription.utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@shared/config/subscription.utils')>();
  return {
    ...actual,
    getBatchLimit: () => 5,
  };
});

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { useBatchQueue } from '@/client/hooks/useBatchQueue';

describe('useBatchQueue credit wall analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should track the midbatch wall with its credit deficit', async () => {
    mocks.processImage.mockRejectedValue(
      new Error('You have insufficient credits. This operation requires 1 credit.')
    );
    const item: IBatchItem = {
      id: 'item-1',
      file: new File(['image'], 'image.png', { type: 'image/png' }),
      previewUrl: 'blob:test',
      processedUrl: null,
      status: ProcessingStatus.IDLE,
      progress: 0,
      inputDimensions: { width: 100, height: 100 },
    };
    const config: IUpscaleConfig = {
      qualityTier: 'quick',
      scale: 2,
      additionalOptions: DEFAULT_ENHANCEMENT_SETTINGS,
    };
    const { result } = renderHook(() => useBatchQueue());

    await act(async () => {
      await result.current.processSingleItem(item, config);
    });

    expect(mocks.track).toHaveBeenCalledWith('credit_wall_shown', {
      source: 'midbatch',
      requiredCredits: 1,
      currentBalance: 0,
      deficit: 1,
    });
  });
});
