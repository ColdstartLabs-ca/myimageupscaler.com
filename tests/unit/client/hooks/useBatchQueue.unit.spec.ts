import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ENHANCEMENT_SETTINGS,
  ProcessingStatus,
  type IUpscaleConfig,
} from '@/shared/types/coreflow.types';

const mocks = vi.hoisted(() => ({
  userId: 'user-1' as string | null,
  processImage: vi.fn(),
  listDurableUpscaleJobs: vi.fn(),
  resumeDurableUpscale: vi.fn(),
  prepareFileForProcessing: vi.fn(),
  reportUpscaleEdgeFailure: vi.fn(),
  showToast: vi.fn(),
  track: vi.fn(),
  updateCreditsFromProcessing: vi.fn(),
  invalidateUserData: vi.fn(),
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
    profile: mocks.userId ? { id: mocks.userId, subscription_tier: null } : null,
    subscription: null,
    totalCredits: 0,
  }),
  useUserStore: Object.assign(vi.fn(), {
    getState: () => ({
      updateCreditsFromProcessing: mocks.updateCreditsFromProcessing,
      invalidate: mocks.invalidateUserData,
    }),
  }),
}));

vi.mock('@client/utils/api-client', () => ({
  processImage: mocks.processImage,
  listDurableUpscaleJobs: mocks.listDurableUpscaleJobs,
  resumeDurableUpscale: mocks.resumeDurableUpscale,
  reportUpscaleEdgeFailure: mocks.reportUpscaleEdgeFailure,
  UpscaleEdgeError: mocks.UpscaleEdgeError,
  DurableUpscaleTerminalError: class DurableUpscaleTerminalError extends Error {
    readonly jobId: string;
    readonly refunded: boolean;
    readonly retryable: boolean;
    readonly status: string;
    constructor(job: { jobId: string; refunded: boolean; retryable: boolean; status: string }) {
      super('Image processing did not complete successfully');
      Object.assign(this, job);
      this.jobId = job.jobId;
      this.refunded = job.refunded;
      this.retryable = job.retryable;
      this.status = job.status;
    }
  },
  DurableUpscaleAccessError: class DurableUpscaleAccessError extends Error {},
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
    mocks.userId = 'user-1';
    const storage = new Map<string, string>();
    vi.mocked(localStorage.getItem).mockImplementation(key => storage.get(key) ?? null);
    vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
      storage.set(key, value);
    });
    vi.mocked(localStorage.removeItem).mockImplementation(key => {
      storage.delete(key);
    });
    vi.mocked(localStorage.clear).mockImplementation(() => storage.clear());
    mocks.processImage.mockReset();
    mocks.resumeDurableUpscale.mockReset();
    mocks.listDurableUpscaleJobs.mockResolvedValue({
      success: true,
      jobs: [],
      nextCursor: null,
    });
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
      expect.objectContaining({
        qualityTier: 'quick',
        scale: 4,
        jobId: result.current.queue[0].jobId,
      })
    );
  });

  it('should rely on authenticated server observation for edge processing failures', async () => {
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

    expect(mocks.reportUpscaleEdgeFailure).toHaveBeenCalledOnce();
    expect(mocks.track).not.toHaveBeenCalledWith('processing_failed', expect.anything());
  });

  it('should refresh credits when an admitted durable job reaches terminal failure', async () => {
    mocks.processImage.mockRejectedValueOnce(
      new Error('Image processing did not complete successfully')
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
    });
    expect(mocks.invalidateUserData).toHaveBeenCalled();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prevents duplicate admission when processing is clicked twice before React rerenders', async () => {
    let complete!: (value: unknown) => void;
    mocks.processImage.mockReturnValue(
      new Promise(resolve => {
        complete = resolve;
      })
    );
    const { result } = renderHook(() => useBatchQueue());
    await act(async () => {
      result.current.addFiles([new File(['image'], 'source.png')]);
    });
    const item = result.current.queue[0];
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = result.current.processSingleItem(item, config);
      second = result.current.processSingleItem(item, config);
    });
    expect(mocks.processImage).toHaveBeenCalledOnce();
    await act(async () => {
      complete({ imageUrl: 'blob:result', durable: true, creditsUsed: 2, creditsRemaining: 8 });
      await Promise.all([first, second]);
    });
  });

  it('keeps recovered processing jobs out of new batch admissions', async () => {
    const jobId = '11111111-1111-4111-8111-111111111111';
    mocks.listDurableUpscaleJobs.mockResolvedValue({
      success: true,
      jobs: [{ jobId, status: 'processing' }],
      nextCursor: null,
    });
    mocks.resumeDurableUpscale.mockReturnValue(new Promise(() => undefined));
    const { result, unmount } = renderHook(() => useBatchQueue());
    await act(async () => undefined);
    expect(result.current.isProcessingBatch).toBe(true);
    await act(async () => {
      await result.current.processBatch(config);
    });
    expect(mocks.processImage).not.toHaveBeenCalled();
    expect(result.current.queue[0]).toMatchObject({ jobId, status: ProcessingStatus.PROCESSING });
    unmount();
  });

  it('refreshes refunded jobs from the authoritative list and disallows empty-file retries', async () => {
    const jobId = '11111111-1111-4111-8111-111111111111';
    mocks.listDurableUpscaleJobs.mockResolvedValue({
      success: true,
      jobs: [{ jobId, status: 'failed', refunded: true, retryable: true }],
      nextCursor: null,
    });
    const { result } = renderHook(() => useBatchQueue());
    await act(async () => undefined);
    expect(result.current.queue[0]).toMatchObject({
      status: ProcessingStatus.ERROR,
      retryable: false,
    });
    expect(mocks.invalidateUserData).toHaveBeenCalled();
    await act(async () => {
      await result.current.processSingleItem(result.current.queue[0], config);
    });
    expect(mocks.processImage).not.toHaveBeenCalled();
  });

  it('uses a new UUID only for an explicit retry after authoritative terminal failure', async () => {
    const { DurableUpscaleTerminalError } = await import('@client/utils/api-client');
    mocks.processImage
      .mockImplementationOnce(async (_file, _config, _progress, options) => {
        options.onJobAccepted(options.jobId);
        throw new DurableUpscaleTerminalError({
          jobId: options.jobId,
          status: 'failed',
          refunded: true,
          retryable: true,
        });
      })
      .mockResolvedValueOnce({
        imageUrl: 'blob:result',
        durable: true,
        creditsUsed: 2,
        creditsRemaining: 8,
      });
    const { result } = renderHook(() => useBatchQueue());
    await act(async () => {
      result.current.addFiles([new File(['image'], 'source.png')]);
    });
    await act(async () => {
      await result.current.processSingleItem(result.current.queue[0], config);
    });
    const firstId = result.current.queue[0].jobId;
    expect(result.current.queue[0].status).toBe(ProcessingStatus.ERROR);
    await act(async () => {
      await result.current.processSingleItem(result.current.queue[0], config);
    });
    expect(mocks.processImage.mock.calls[1][3].jobId).not.toBe(firstId);
    expect(mocks.processImage.mock.calls[1][3].jobId).toMatch(/^[a-f0-9-]{14}4[a-f0-9-]{21}$/);
  });

  it('cancels old account work and ignores its result and balance after an account switch', async () => {
    let complete!: (value: unknown) => void;
    mocks.processImage.mockReturnValue(
      new Promise(resolve => {
        complete = resolve;
      })
    );
    const { result, rerender } = renderHook(() => useBatchQueue());
    await act(async () => {
      result.current.addFiles([new File(['private'], 'private.png')]);
    });
    let processing!: Promise<void>;
    await act(async () => {
      processing = result.current.processSingleItem(result.current.queue[0], config);
    });
    const options = mocks.processImage.mock.calls[0][3];
    mocks.userId = 'user-2';
    await act(async () => {
      rerender();
    });
    expect(options.signal.aborted).toBe(true);
    expect(result.current.queue).toHaveLength(0);
    await act(async () => {
      complete({
        imageUrl: 'blob:old-user-output',
        durable: true,
        creditsUsed: 2,
        creditsRemaining: 8,
      });
      await processing;
    });
    expect(result.current.queue).toHaveLength(0);
    expect(mocks.updateCreditsFromProcessing).not.toHaveBeenCalled();
    expect(mocks.invalidateUserData).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:old-user-output');
  });

  it('retries authoritative listing on reconnect after a transient list failure', async () => {
    mocks.listDurableUpscaleJobs.mockRejectedValueOnce(new Error('503')).mockResolvedValueOnce({
      success: true,
      jobs: [{ jobId: '11111111-1111-4111-8111-111111111111', status: 'processing' }],
      nextCursor: null,
    });
    mocks.resumeDurableUpscale.mockReturnValue(new Promise(() => undefined));
    const { result, unmount } = renderHook(() => useBatchQueue());
    await act(async () => undefined);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.queue).toHaveLength(1);
    expect(mocks.processImage).not.toHaveBeenCalled();
    unmount();
  });

  it('keeps an admitted job reconnecting if access is temporarily unavailable', async () => {
    const { DurableUpscaleAccessError } = await import('@client/utils/api-client');
    const jobId = '11111111-1111-4111-8111-111111111111';
    mocks.listDurableUpscaleJobs.mockResolvedValue({
      success: true,
      jobs: [{ jobId, status: 'processing' }],
      nextCursor: null,
    });
    mocks.resumeDurableUpscale.mockRejectedValueOnce(new DurableUpscaleAccessError(jobId, 401));
    const { result, unmount } = renderHook(() => useBatchQueue());
    await act(async () => undefined);
    expect(result.current.queue[0]).toMatchObject({
      jobId,
      status: ProcessingStatus.PROCESSING,
      reconnecting: true,
    });
    expect(mocks.showToast).not.toHaveBeenCalled();
    unmount();
  });
  it('keeps listing while a persisted job is still committing after reload', async () => {
    vi.useFakeTimers();
    try {
      const jobId = '11111111-1111-4111-8111-111111111111';
      localStorage.setItem(
        'myimageupscaler:durable-jobs:user-1',
        JSON.stringify([
          {
            jobId,
            itemId: 'old-item',
            fileName: 'original.png',
            mimeType: 'image/png',
            savedAt: Date.now(),
          },
        ])
      );
      mocks.listDurableUpscaleJobs
        .mockResolvedValueOnce({ success: true, jobs: [], nextCursor: null })
        .mockResolvedValueOnce({
          success: true,
          jobs: [{ jobId, status: 'processing' }],
          nextCursor: null,
        });
      mocks.resumeDurableUpscale.mockReturnValue(new Promise(() => undefined));
      const { result, unmount } = renderHook(() => useBatchQueue());
      await act(async () => undefined);
      expect(result.current.queue).toHaveLength(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(result.current.queue[0]).toMatchObject({
        jobId,
        file: expect.objectContaining({ name: 'original.png' }),
      });
      expect(mocks.processImage).not.toHaveBeenCalled();
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
