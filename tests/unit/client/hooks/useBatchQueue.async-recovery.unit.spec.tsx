import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ENHANCEMENT_SETTINGS,
  ProcessingStatus,
  type IUpscaleConfig,
} from '@/shared/types/coreflow.types';

const mocks = vi.hoisted(() => ({
  listActiveAsyncUpscaleJobs: vi.fn(),
  processImage: vi.fn(),
  prepareFileForProcessing: vi.fn(),
  reportUpscaleEdgeFailure: vi.fn(),
  resumeAsyncUpscale: vi.fn(),
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
  AsyncUpscalePendingError: class AsyncUpscalePendingError extends Error {
    constructor(
      public readonly jobId: string,
      public readonly reason: 'transient' | 'deadline' = 'transient'
    ) {
      super('Image processing is still running.');
      this.name = 'AsyncUpscalePendingError';
    }
  },
  AsyncUpscaleTerminalError: class AsyncUpscaleTerminalError extends Error {
    constructor(
      public readonly jobId: string,
      public readonly status: string,
      message: string,
      public readonly refunded: boolean,
      public readonly retryable: boolean
    ) {
      super(message);
      this.name = 'AsyncUpscaleTerminalError';
    }
  },
  BatchLimitError: class BatchLimitError extends Error {},
  FreeLimitExceededError: class FreeLimitExceededError extends Error {},
  ProviderUnavailableError: class ProviderUnavailableError extends Error {},
  UpscaleEdgeError: class UpscaleEdgeError extends Error {},
  listActiveAsyncUpscaleJobs: mocks.listActiveAsyncUpscaleJobs,
  processImage: mocks.processImage,
  reportUpscaleEdgeFailure: mocks.reportUpscaleEdgeFailure,
  resumeAsyncUpscale: mocks.resumeAsyncUpscale,
}));

vi.mock('@client/utils/upscale-file-preprocessing', () => ({
  getPrivacySafeFileTelemetry: vi.fn(() => ({ fileType: 'png', fileSizeBucket: '<1MB' })),
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
  return { ...actual, getBatchLimit: () => 5 };
});

import { AsyncUpscaleTerminalError } from '@client/utils/api-client';
import { useBatchQueue } from '@client/hooks/useBatchQueue';

const config: IUpscaleConfig = {
  qualityTier: 'quick',
  scale: 4,
  additionalOptions: DEFAULT_ENHANCEMENT_SETTINGS,
};

const STORAGE_KEY = 'myimageupscaler:async-upscale-jobs:user-1';

describe('useBatchQueue async recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const storage = new Map<string, string>();
    vi.mocked(localStorage.getItem).mockImplementation(key => storage.get(key) ?? null);
    vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
      storage.set(key, value);
    });
    vi.mocked(localStorage.removeItem).mockImplementation(key => {
      storage.delete(key);
    });
    vi.mocked(localStorage.clear).mockImplementation(() => storage.clear());
    localStorage.clear();
    mocks.listActiveAsyncUpscaleJobs.mockResolvedValue({ success: true, jobs: [] });
    mocks.prepareFileForProcessing.mockImplementation((file: File) =>
      Promise.resolve({ file, resized: false })
    );
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  it('persists the stable job ID before starting admission', async () => {
    let resolveProcess!: (value: unknown) => void;
    mocks.processImage.mockImplementation(() => new Promise(resolve => (resolveProcess = resolve)));
    const { result } = renderHook(() => useBatchQueue());

    await act(async () => {
      result.current.addFiles([new File(['image'], 'source.png', { type: 'image/png' })]);
    });
    const item = result.current.queue[0];

    let processing!: Promise<void>;
    await act(async () => {
      processing = result.current.processSingleItem(item, config);
      await waitFor(() => expect(mocks.processImage).toHaveBeenCalledOnce());
    });

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')).toEqual([
      expect.objectContaining({
        jobId: '11111111-1111-4111-8111-111111111111',
        fileName: 'source.png',
      }),
    ]);
    expect(mocks.processImage.mock.calls[0][3]).toEqual(
      expect.objectContaining({ jobId: '11111111-1111-4111-8111-111111111111' })
    );

    await act(async () => {
      resolveProcess({ imageUrl: 'blob:output', creditsUsed: 1, creditsRemaining: 4 });
      await processing;
    });
  });

  it('keeps a newly admitted item when an older discovery snapshot arrives empty', async () => {
    let resolveList!: (value: unknown) => void;
    mocks.listActiveAsyncUpscaleJobs.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveList = resolve;
        })
    );
    let resolveProcess!: (value: unknown) => void;
    mocks.processImage.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveProcess = resolve;
        })
    );
    const { result } = renderHook(() => useBatchQueue());
    await act(async () => {
      result.current.addFiles([new File(['image'], 'source.png', { type: 'image/png' })]);
    });
    const item = result.current.queue[0];
    let processing!: Promise<void>;
    await act(async () => {
      processing = result.current.processSingleItem(item, config);
      await waitFor(() => expect(mocks.processImage).toHaveBeenCalledOnce());
    });
    await act(async () => {
      resolveList({ success: true, jobs: [] });
    });
    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0].asyncJobId).toBe('11111111-1111-4111-8111-111111111111');
    await act(async () => {
      resolveProcess({ imageUrl: 'blob:output', creditsUsed: 1, creditsRemaining: 4 });
      await processing;
    });
  });

  it('restores an active job and resumes it without constructing or uploading a File', async () => {
    const jobId = '22222222-2222-4222-8222-222222222222';
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ jobId, fileName: 'source.png' }]));
    mocks.listActiveAsyncUpscaleJobs.mockResolvedValue({
      success: true,
      jobs: [
        {
          jobId,
          status: 'processing',
          createdAt: Date.now(),
          executionDeadline: Date.now() + 900000,
          statusUrl: `/api/upscale?jobId=${jobId}`,
        },
      ],
    });
    mocks.resumeAsyncUpscale.mockResolvedValue({
      jobId,
      durable: true,
      imageUrl: 'blob:output',
      creditsUsed: 1,
      creditsRemaining: 4,
    });

    const { result } = renderHook(() => useBatchQueue());

    await waitFor(() =>
      expect(mocks.resumeAsyncUpscale).toHaveBeenCalledWith(
        jobId,
        expect.any(Function),
        expect.any(Object)
      )
    );
    await waitFor(() => expect(result.current.queue[0]?.status).toBe(ProcessingStatus.COMPLETED));

    expect(result.current.queue[0]).toMatchObject({
      id: jobId,
      file: null,
      processedUrl: 'blob:output',
      status: ProcessingStatus.COMPLETED,
    });
    expect(mocks.processImage).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('does not reintroduce a received result on the next dashboard refresh', async () => {
    const jobId = 'completed-job';
    mocks.listActiveAsyncUpscaleJobs.mockResolvedValue({
      success: true,
      jobs: [{ jobId, status: 'processing', createdAt: Date.now() }],
    });
    mocks.resumeAsyncUpscale.mockResolvedValue({
      jobId,
      imageUrl: 'blob:output',
      creditsUsed: 1,
      creditsRemaining: 4,
    });
    const first = renderHook(() => useBatchQueue());
    await waitFor(() => expect(first.result.current.completedCount).toBe(1));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    first.unmount();
    mocks.resumeAsyncUpscale.mockClear();
    mocks.listActiveAsyncUpscaleJobs.mockResolvedValue({
      success: true,
      jobs: [{ jobId, status: 'completed', createdAt: Date.now() }],
    });

    const refreshed = renderHook(() => useBatchQueue());
    await act(async () => {});

    expect(refreshed.result.current.queue).toEqual([]);
    expect(refreshed.result.current.activeId).toBeNull();
    expect(mocks.resumeAsyncUpscale).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it.each(['ready', 'completed'])(
    'recovers a %s job whose result was never received by this browser',
    async status => {
      const jobId = 'interrupted-download';
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ jobId, fileName: 'source.png', createdAt: Date.now() }])
      );
      mocks.listActiveAsyncUpscaleJobs.mockResolvedValue({
        success: true,
        jobs: [{ jobId, status, createdAt: Date.now() }],
      });
      mocks.resumeAsyncUpscale.mockResolvedValue({
        jobId,
        imageUrl: 'blob:output',
        creditsUsed: 1,
        creditsRemaining: 4,
      });

      const { result } = renderHook(() => useBatchQueue());
      await waitFor(() => expect(result.current.completedCount).toBe(1));

      expect(result.current.queue[0].fileName).toBe('source.png');
      expect(mocks.resumeAsyncUpscale).toHaveBeenCalledOnce();
      expect(mocks.processImage).not.toHaveBeenCalled();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    }
  );

  it('retries a recovered job after its first status read loses the connection', async () => {
    const jobId = '33333333-3333-4333-8333-333333333333';
    mocks.listActiveAsyncUpscaleJobs.mockResolvedValue({
      success: true,
      jobs: [{ jobId, status: 'processing', createdAt: Date.now() }],
    });
    mocks.resumeAsyncUpscale
      .mockRejectedValueOnce(
        new (await import('@client/utils/api-client')).AsyncUpscalePendingError(jobId)
      )
      .mockResolvedValueOnce({
        jobId,
        durable: true,
        imageUrl: 'blob:output',
        creditsUsed: 1,
        creditsRemaining: 4,
      });

    const { result } = renderHook(() => useBatchQueue());

    await waitFor(() => expect(mocks.resumeAsyncUpscale).toHaveBeenCalledTimes(2), {
      timeout: 3000,
    });
    await waitFor(() => expect(result.current.queue[0]?.status).toBe(ProcessingStatus.COMPLETED));

    expect(mocks.resumeAsyncUpscale.mock.calls[0][0]).toBe(jobId);
    expect(mocks.resumeAsyncUpscale.mock.calls[1][0]).toBe(jobId);
    expect(mocks.processImage).not.toHaveBeenCalled();
  });

  it('retries active-job discovery after a temporary list failure', async () => {
    const jobId = '44444444-4444-4444-8444-444444444444';
    mocks.listActiveAsyncUpscaleJobs
      .mockRejectedValueOnce(new Error('temporary list failure'))
      .mockResolvedValueOnce({
        success: true,
        jobs: [{ jobId, status: 'processing', createdAt: Date.now() }],
      });
    mocks.resumeAsyncUpscale.mockResolvedValue({
      jobId,
      durable: true,
      imageUrl: 'blob:output',
      creditsUsed: 1,
      creditsRemaining: 4,
    });

    const { result } = renderHook(() => useBatchQueue());

    await waitFor(() => expect(mocks.listActiveAsyncUpscaleJobs).toHaveBeenCalledTimes(2), {
      timeout: 3000,
    });
    await waitFor(() => expect(result.current.queue[0]?.status).toBe(ProcessingStatus.COMPLETED));
    expect(mocks.resumeAsyncUpscale).toHaveBeenCalledWith(
      jobId,
      expect.any(Function),
      expect.any(Object)
    );
  });

  it('exposes same-job reconciliation after polling reaches its deadline', async () => {
    const jobId = '55555555-5555-4555-8555-555555555555';
    mocks.listActiveAsyncUpscaleJobs.mockResolvedValue({
      success: true,
      jobs: [{ jobId, status: 'processing', createdAt: Date.now() }],
    });
    mocks.resumeAsyncUpscale
      .mockRejectedValueOnce(
        new (await import('@client/utils/api-client')).AsyncUpscalePendingError(jobId, 'deadline')
      )
      .mockRejectedValueOnce(
        new (await import('@client/utils/api-client')).AsyncUpscaleTerminalError(
          jobId,
          'refunded',
          'Credits were refunded.',
          true,
          false
        )
      );

    const { result } = renderHook(() => useBatchQueue());
    await waitFor(() => expect(result.current.queue[0]?.asyncStatusCheckAvailable).toBe(true));

    await act(async () => {
      await result.current.checkAsyncJobStatus(result.current.queue[0]);
    });

    expect(result.current.queue[0]).toMatchObject({
      status: ProcessingStatus.ERROR,
      asyncJobId: undefined,
      retryable: false,
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(mocks.resumeAsyncUpscale.mock.calls.map(([calledJobId]) => calledJobId)).toEqual([
      jobId,
      jobId,
    ]);
    expect(mocks.processImage).not.toHaveBeenCalled();
  });

  it('does not include confirmed non-retryable refunds in the next batch', async () => {
    const oldJobId = '66666666-6666-4666-8666-666666666666';
    vi.stubGlobal('crypto', { randomUUID: () => oldJobId });
    mocks.processImage.mockRejectedValueOnce(
      new AsyncUpscaleTerminalError(oldJobId, 'refunded', 'Credits were refunded.', true, false)
    );

    const { result } = renderHook(() => useBatchQueue());
    await act(async () => {
      result.current.addFiles([new File(['image'], 'source.png', { type: 'image/png' })]);
    });
    await act(async () => {
      await result.current.processSingleItem(result.current.queue[0], config);
    });

    expect(result.current.queue[0]).toMatchObject({
      status: ProcessingStatus.ERROR,
      retryable: false,
      asyncJobId: undefined,
    });
    mocks.processImage.mockClear();

    await act(async () => {
      await result.current.processBatch(config);
    });

    expect(mocks.processImage).not.toHaveBeenCalled();
  });

  it('uses a fresh job identity for an explicit retry after a confirmed refund', async () => {
    const oldJobId = '77777777-7777-4777-8777-777777777777';
    const newJobId = '88888888-8888-4888-8888-888888888888';
    const generatedIds = [oldJobId, newJobId];
    vi.stubGlobal('crypto', { randomUUID: () => generatedIds.shift()! });
    mocks.processImage
      .mockRejectedValueOnce(
        new AsyncUpscaleTerminalError(oldJobId, 'refunded', 'Credits were refunded.', true, false)
      )
      .mockResolvedValueOnce({ imageUrl: 'blob:output', creditsUsed: 1, creditsRemaining: 4 });

    const { result } = renderHook(() => useBatchQueue());
    await act(async () => {
      result.current.addFiles([new File(['image'], 'source.png', { type: 'image/png' })]);
    });
    await act(async () => {
      await result.current.processSingleItem(result.current.queue[0], config);
    });
    await act(async () => {
      await result.current.processSingleItem(result.current.queue[0], config);
    });

    expect(mocks.processImage.mock.calls.map(([, , , options]) => options.jobId)).toEqual([
      oldJobId,
      newJobId,
    ]);
    expect(result.current.queue[0]).toMatchObject({
      status: ProcessingStatus.COMPLETED,
      asyncJobId: undefined,
    });
  });

  it('offers same-job reconciliation when direct admission remains pending', async () => {
    const jobId = '99999999-9999-4999-8999-999999999999';
    vi.stubGlobal('crypto', { randomUUID: () => jobId });
    mocks.processImage.mockRejectedValueOnce(
      new (await import('@client/utils/api-client')).AsyncUpscalePendingError(jobId)
    );

    const { result } = renderHook(() => useBatchQueue());
    await act(async () => {
      result.current.addFiles([new File(['image'], 'source.png', { type: 'image/png' })]);
    });
    await act(async () => {
      await result.current.processSingleItem(result.current.queue[0], config);
    });

    expect(result.current.queue[0]).toMatchObject({
      status: ProcessingStatus.PROCESSING,
      asyncJobId: jobId,
      asyncStatusCheckAvailable: true,
    });
  });
});
