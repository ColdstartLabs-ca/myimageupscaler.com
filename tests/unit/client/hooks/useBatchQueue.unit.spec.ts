import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ENHANCEMENT_SETTINGS,
  ProcessingStatus,
  type IUpscaleConfig,
} from '@/shared/types/coreflow.types';

const mocks = vi.hoisted(() => ({
  processImage: vi.fn(),
  prepareFileForProcessing: vi.fn(),
  reportUpscaleEdgeFailure: vi.fn(),
  showToast: vi.fn(),
  track: vi.fn(),
  UpscaleEdgeError: class UpscaleEdgeError extends Error {
    readonly status: number;
    readonly rayId: string | null;
    readonly bodyPreview: string;

    constructor(options: { status: number; rayId?: string | null; bodyPreview?: string }) {
      super(
        `Upscale failed (HTTP ${options.status}, ref: ${options.rayId ?? 'unknown'}). Please retry.`
      );
      this.name = 'UpscaleEdgeError';
      this.status = options.status;
      this.rayId = options.rayId ?? null;
      this.bodyPreview = options.bodyPreview ?? '';
    }
  },
}));

vi.mock('@client/analytics', () => ({
  analytics: { track: mocks.track },
}));

vi.mock('@client/store/toastStore', () => ({
  useToastStore: (selector: (state: { showToast: typeof mocks.showToast }) => unknown) =>
    selector({ showToast: mocks.showToast }),
}));

vi.mock('@client/store/userStore', () => ({
  useUserData: () => ({
    profile: { id: 'user-1', subscription_tier: null },
    subscription: null,
    totalCredits: 0,
  }),
  useUserStore: Object.assign(vi.fn(), {
    getState: () => ({ updateCreditsFromProcessing: vi.fn() }),
  }),
}));

vi.mock('@client/utils/api-client', () => ({
  processImage: mocks.processImage,
  reportUpscaleEdgeFailure: mocks.reportUpscaleEdgeFailure,
  UpscaleEdgeError: mocks.UpscaleEdgeError,
  BatchLimitError: class BatchLimitError extends Error {},
  FreeLimitExceededError: class FreeLimitExceededError extends Error {},
  ProviderUnavailableError: class ProviderUnavailableError extends Error {},
}));

vi.mock('@client/utils/upscale-file-preprocessing', () => ({
  getPrivacySafeFileTelemetry: vi.fn(() => ({
    fileType: 'png',
    fileSizeBucket: '<1MB',
  })),
  prepareFileForProcessing: mocks.prepareFileForProcessing,
}));

vi.mock('@client/utils/file-validation', () => ({
  loadImageDimensions: vi.fn(() => Promise.resolve({ width: 100, height: 100 })),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@shared/config/subscription.utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@shared/config/subscription.utils')>();
  return {
    ...actual,
    getBatchLimit: () => 5,
  };
});

import { useBatchQueue } from '@client/hooks/useBatchQueue';

const config: IUpscaleConfig = {
  qualityTier: 'quick',
  scale: 4,
  additionalOptions: DEFAULT_ENHANCEMENT_SETTINGS,
};

describe('useBatchQueue edge failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reportUpscaleEdgeFailure.mockResolvedValue(undefined);
    mocks.prepareFileForProcessing.mockImplementation((file: File) =>
      Promise.resolve({ file, resized: false })
    );
  });

  it('should mark item retryable when UpscaleEdgeError is thrown', async () => {
    mocks.processImage.mockRejectedValueOnce(
      new mocks.UpscaleEdgeError({ status: 503, rayId: 'abc-123', bodyPreview: '<html>' })
    );
    const { result } = renderHook(() => useBatchQueue());

    await act(async () => {
      result.current.addFiles([new File(['image'], 'large.png', { type: 'image/png' })]);
    });
    await act(async () => {
      await result.current.processSingleItem(result.current.queue[0], config);
    });

    expect(result.current.queue[0]).toMatchObject({
      status: ProcessingStatus.ERROR,
      retryable: true,
      error: 'Upscale failed (HTTP 503, ref: abc-123). Please retry.',
    });
    expect(mocks.reportUpscaleEdgeFailure).toHaveBeenCalledWith(
      expect.objectContaining({ status: 503, rayId: 'abc-123' }),
      expect.objectContaining({ qualityTier: 'quick', scale: 4 })
    );
  });

  it('should emit processing_failed when UpscaleEdgeError is thrown', async () => {
    mocks.processImage.mockRejectedValueOnce(
      new mocks.UpscaleEdgeError({ status: 503, rayId: 'abc-123', bodyPreview: '<html>' })
    );
    const { result } = renderHook(() => useBatchQueue());

    await act(async () => {
      result.current.addFiles([new File(['image'], 'large.png', { type: 'image/png' })]);
    });
    await act(async () => {
      await result.current.processSingleItem(result.current.queue[0], config);
    });

    expect(mocks.track).toHaveBeenCalledWith(
      'processing_failed',
      expect.objectContaining({
        errorType: 'edge_error',
        reason: 'edge_error',
        retryable: true,
      })
    );
  });
});
