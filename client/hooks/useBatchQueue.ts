import {
  IBatchItem,
  IUpscaleConfig,
  ProcessingStage,
  ProcessingStatus,
} from '@/shared/types/coreflow.types';
import { useToastStore } from '@client/store/toastStore';
import { useUserData, useUserStore } from '@client/store/userStore';
import {
  AsyncUpscalePendingError,
  AsyncUpscaleTerminalError,
  BatchLimitError,
  FreeLimitExceededError,
  IAsyncUpscaleStatus,
  listActiveAsyncUpscaleJobs,
  processImage,
  ProviderUnavailableError,
  reportUpscaleEdgeFailure,
  resumeAsyncUpscale,
  UpscaleEdgeError,
} from '@client/utils/api-client';
import {
  getPrivacySafeFileTelemetry,
  prepareFileForProcessing,
} from '@client/utils/upscale-file-preprocessing';
import { buildProcessingAutoResizeToastValues } from '@client/utils/auto-resize-toast';
import {
  calculateBatchProviderAwareCreditCost,
  getBatchLimit,
} from '@shared/config/subscription.utils';
import { TIMEOUTS } from '@shared/config/timeouts.config';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';
import { serializeError } from '@shared/utils/errors';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { analytics } from '@client/analytics';
import { loadImageDimensions } from '@client/utils/file-validation';
import { normalizeCoreEventProperties } from '@server/analytics/core-event-contract';

interface IBatchProgress {
  current: number;
  total: number;
}

type IRetryableBatchItem = IBatchItem & {
  retryable?: boolean;
};

interface IUseBatchQueueReturn {
  queue: IRetryableBatchItem[];
  activeId: string | null;
  activeItem: IRetryableBatchItem | null;
  isProcessingBatch: boolean;
  batchProgress: IBatchProgress | null;
  completedCount: number;
  batchLimit: number;
  batchLimitExceeded: { attempted: number; limit: number; serverEnforced?: boolean } | null;
  providerUnavailable: {
    message: string;
    retryAt?: Date;
    suppressPurchaseCtas: boolean;
    isModalOpen: boolean;
  } | null;
  setActiveId: (id: string) => void;
  addFiles: (files: File[], source?: 'drag_drop' | 'file_picker' | 'paste' | 'url') => void;
  /** Inject a pre-processed sample — shows before/after without calling the API */
  addSampleItem: (beforeSrc: string, afterSrc: string, label: string) => Promise<void>;
  removeItem: (id: string) => void;
  clearQueue: () => void;
  processBatch: (config: IUpscaleConfig) => Promise<void>;
  processSingleItem: (item: IRetryableBatchItem, config: IUpscaleConfig) => Promise<void>;
  checkAsyncJobStatus: (item: IRetryableBatchItem | null | undefined) => Promise<void>;
  clearBatchLimitError: () => void;
  clearProviderUnavailable: () => void;
  showProviderUnavailable: () => void;
}

interface IStoredAsyncUpscaleJob {
  jobId: string;
  fileName: string;
  createdAt: number;
}

const ASYNC_UPSCALE_STORAGE_PREFIX = 'myimageupscaler:async-upscale-jobs:';
const FALLBACK_RECOVERED_FILE_NAME = 'Recovered image';
const ASYNC_RECOVERY_MAX_RETRIES = 2;
const ASYNC_RECOVERY_RETRY_DELAY_MS = 1000;

function asyncUpscaleStorageKey(userId: string): string {
  return `${ASYNC_UPSCALE_STORAGE_PREFIX}${userId}`;
}

function readStoredAsyncUpscaleJobs(userId: string): IStoredAsyncUpscaleJob[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(asyncUpscaleStorageKey(userId)) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is IStoredAsyncUpscaleJob =>
        !!entry &&
        typeof entry === 'object' &&
        typeof entry.jobId === 'string' &&
        typeof entry.fileName === 'string' &&
        typeof entry.createdAt === 'number'
    );
  } catch {
    return [];
  }
}

function writeStoredAsyncUpscaleJobs(userId: string, jobs: IStoredAsyncUpscaleJob[]): void {
  try {
    if (jobs.length === 0) localStorage.removeItem(asyncUpscaleStorageKey(userId));
    else localStorage.setItem(asyncUpscaleStorageKey(userId), JSON.stringify(jobs.slice(-20)));
  } catch {
    // Recovery is best-effort when browser storage is disabled or full.
  }
}

function rememberAsyncUpscaleJob(userId: string | undefined, job: IStoredAsyncUpscaleJob): void {
  if (!userId) return;
  const jobs = readStoredAsyncUpscaleJobs(userId).filter(entry => entry.jobId !== job.jobId);
  writeStoredAsyncUpscaleJobs(userId, [...jobs, job]);
}

function forgetAsyncUpscaleJob(userId: string | undefined, jobId: string): void {
  if (!userId) return;
  writeStoredAsyncUpscaleJobs(
    userId,
    readStoredAsyncUpscaleJobs(userId).filter(entry => entry.jobId !== jobId)
  );
}

function waitForAsyncRecoveryRetry(signal: AbortSignal, delayMs: number): Promise<boolean> {
  return new Promise(resolve => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const finish = (shouldRetry: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onConnectionRestored);
        window.removeEventListener('focus', onConnectionRestored);
      }
      resolve(shouldRetry);
    };
    const onAbort = () => finish(false);
    const onConnectionRestored = () => finish(true);

    signal.addEventListener('abort', onAbort, { once: true });
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onConnectionRestored, { once: true });
      window.addEventListener('focus', onConnectionRestored, { once: true });
    }
    timer = setTimeout(() => finish(true), delayMs);
  });
}

async function retryAsyncRecoveryRead<T>(read: () => Promise<T>, signal: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      if (signal.aborted || attempt >= ASYNC_RECOVERY_MAX_RETRIES) throw error;
      const shouldRetry = await waitForAsyncRecoveryRetry(
        signal,
        ASYNC_RECOVERY_RETRY_DELAY_MS * (attempt + 1)
      );
      if (!shouldRetry) throw error;
    }
  }
}

export const useBatchQueue = (): IUseBatchQueueReturn => {
  const [queue, setQueue] = useState<IRetryableBatchItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<IBatchProgress | null>(null);
  const [batchLimitExceeded, setBatchLimitExceeded] = useState<{
    attempted: number;
    limit: number;
    serverEnforced?: boolean;
  } | null>(null);
  const [providerUnavailable, setProviderUnavailable] = useState<{
    message: string;
    retryAt?: Date;
    suppressPurchaseCtas: boolean;
    isModalOpen: boolean;
  } | null>(null);
  const recoveryControllers = useRef(new Map<string, AbortController>());
  const showToast = useToastStore(state => state.showToast);
  const t = useTranslations('workspace');

  // Get user subscription data
  const { profile, subscription, totalCredits } = useUserData();
  const batchLimit = getBatchLimit(profile?.subscription_tier ?? null);
  const uploadByteLimit = subscription?.price_id
    ? IMAGE_VALIDATION.MAX_SIZE_PAID
    : IMAGE_VALIDATION.MAX_SIZE_FREE;

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      queue.forEach(item => URL.revokeObjectURL(item.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeItem = queue.find(item => item.id === activeId) || null;
  const completedCount = queue.filter(i => i.status === ProcessingStatus.COMPLETED).length;

  const addFiles = useCallback(
    (files: File[], source: 'drag_drop' | 'file_picker' | 'paste' | 'url' = 'file_picker') => {
      const currentCount = queue.length;
      const availableSlots = Math.max(0, batchLimit - currentCount);

      // If we're already at limit, show modal
      if (availableSlots === 0) {
        setBatchLimitExceeded({
          attempted: files.length,
          limit: batchLimit,
        });
        return;
      }

      // Add files up to available slots
      const filesToAdd = files.slice(0, availableSlots);
      const rejectedCount = files.length - filesToAdd.length;

      const newItems: IRetryableBatchItem[] = filesToAdd.map(file => ({
        id: Math.random().toString(36).substring(2, 15),
        file,
        previewUrl: URL.createObjectURL(file),
        processedUrl: null,
        status: ProcessingStatus.IDLE,
        progress: 0,
      }));

      setQueue(prev => {
        const updated = [...prev, ...newItems];
        if (!activeId && updated.length > 0) {
          setActiveId(updated[0].id);
        }
        return updated;
      });

      const isGuest = !profile?.id;
      filesToAdd.forEach((file, index) => {
        // Funnel telemetry must not depend on asynchronous image decoding. A user can
        // navigate away before dimensions load, especially during the guest signup flow.
        const fileTelemetry = getPrivacySafeFileTelemetry(file);
        analytics.track('image_uploaded', {
          fileSizeBucket: fileTelemetry.fileSizeBucket,
          fileType: fileTelemetry.fileType,
          source,
          isGuest,
          batchPosition: currentCount + index,
        });

        void loadImageDimensions(file)
          .then(dimensions => {
            setQueue(prev =>
              prev.map(item =>
                item.file === file ? { ...item, inputDimensions: dimensions } : item
              )
            );
          })
          .catch(() => {
            // Dimension enrichment is best-effort; upload telemetry is already recorded.
          });
      });

      // Show modal if some files were rejected due to limit
      if (rejectedCount > 0) {
        setBatchLimitExceeded({
          attempted: files.length,
          limit: batchLimit,
        });
      }
    },
    [activeId, queue.length, batchLimit, profile?.id]
  );

  /**
   * Inject a pre-processed sample as a COMPLETED queue item.
   * Fetches the beforeSrc image as a blob so the queue has a real File object,
   * then immediately marks it COMPLETED with processedUrl = afterSrc.
   * No API credits are consumed.
   */
  const addSampleItem = useCallback(async (beforeSrc: string, afterSrc: string, label: string) => {
    try {
      const res = await fetch(beforeSrc);
      const blob = await res.blob();
      const file = new File([blob], `${label}.webp`, { type: blob.type || 'image/webp' });
      const previewUrl = URL.createObjectURL(blob);

      const id = Math.random().toString(36).substring(2, 15);
      const item: IBatchItem = {
        id,
        file,
        previewUrl,
        processedUrl: afterSrc,
        status: ProcessingStatus.COMPLETED,
        progress: 100,
      };

      setQueue(prev => {
        const updated = [...prev, item];
        setActiveId(id);
        return updated;
      });
    } catch {
      // Silently fail — user can still upload their own image
    }
  }, []);

  const removeItem = useCallback(
    (id: string) => {
      const itemToRemove = queue.find(i => i.id === id);
      if (itemToRemove) {
        URL.revokeObjectURL(itemToRemove.previewUrl);
      }

      setQueue(prev => {
        const updated = prev.filter(item => item.id !== id);
        if (activeId === id) {
          setActiveId(updated.length > 0 ? updated[0].id : null);
        }
        return updated;
      });
    },
    [queue, activeId]
  );

  const updateItemStatus = useCallback((id: string, updates: Partial<IRetryableBatchItem>) => {
    setQueue(prev => prev.map(item => (item.id === id ? { ...item, ...updates } : item)));
  }, []);

  const resumeRecoveredItem = useCallback(
    async (
      itemId: string,
      jobId: string,
      fileName: string,
      userId: string,
      executionDeadline?: number
    ): Promise<void> => {
      recoveryControllers.current.get(jobId)?.abort();
      const controller = new AbortController();
      recoveryControllers.current.set(jobId, controller);
      updateItemStatus(itemId, {
        status: ProcessingStatus.PROCESSING,
        progress: 50,
        stage: ProcessingStage.ENHANCING,
        error: undefined,
        asyncJobId: jobId,
        fileName,
        asyncStatusCheckAvailable: false,
      });

      let retryAttempt = 0;
      try {
        while (!controller.signal.aborted) {
          try {
            const result = await resumeAsyncUpscale(
              jobId,
              (progress, stage) =>
                updateItemStatus(itemId, {
                  progress,
                  stage: stage || ProcessingStage.ENHANCING,
                }),
              {
                signal: controller.signal,
                executionDeadline,
                onJobStatus: (status: IAsyncUpscaleStatus) => {
                  updateItemStatus(itemId, {
                    status: ProcessingStatus.PROCESSING,
                    progress: status.status === 'submitting' ? 30 : 65,
                    stage: ProcessingStage.ENHANCING,
                    error: undefined,
                    asyncStatusCheckAvailable: false,
                  });
                },
              }
            );
            updateItemStatus(itemId, {
              status: ProcessingStatus.COMPLETED,
              processedUrl: result.imageUrl || result.imageData || '',
              progress: 100,
              stage: undefined,
              error: undefined,
              asyncStatusCheckAvailable: false,
            });
            if (result.creditsUsed > 0) {
              useUserStore.getState().updateCreditsFromProcessing(result.creditsRemaining);
            }
            forgetAsyncUpscaleJob(userId, jobId);
            return;
          } catch (error) {
            if (isAsyncUpscalePendingError(error)) {
              updateItemStatus(itemId, {
                status: ProcessingStatus.PROCESSING,
                progress: 50,
                stage: ProcessingStage.ENHANCING,
                error: error.message,
                asyncStatusCheckAvailable: true,
              });
              if (error.reason === 'deadline' || retryAttempt >= ASYNC_RECOVERY_MAX_RETRIES) {
                return;
              }
              retryAttempt += 1;
              if (
                !(await waitForAsyncRecoveryRetry(
                  controller.signal,
                  ASYNC_RECOVERY_RETRY_DELAY_MS * retryAttempt
                ))
              ) {
                return;
              }
              continue;
            }

            if (isAsyncUpscaleTerminalError(error)) {
              forgetAsyncUpscaleJob(userId, jobId);
              updateItemStatus(itemId, {
                status: ProcessingStatus.ERROR,
                error: error.message,
                retryable: error.retryable,
                stage: undefined,
                asyncJobId: undefined,
                asyncStatusCheckAvailable: false,
              });
              return;
            }

            if (!controller.signal.aborted) {
              updateItemStatus(itemId, {
                status: ProcessingStatus.PROCESSING,
                stage: ProcessingStage.ENHANCING,
                error: error instanceof Error ? error.message : 'Connection lost. Checking again…',
                asyncStatusCheckAvailable: true,
              });
            }
            return;
          }
        }
      } finally {
        if (recoveryControllers.current.get(jobId) === controller) {
          recoveryControllers.current.delete(jobId);
        }
      }
    },
    [updateItemStatus]
  );

  const checkAsyncJobStatus = useCallback(
    async (item: IRetryableBatchItem | null | undefined): Promise<void> => {
      if (!item?.asyncJobId || !profile?.id) return;
      await resumeRecoveredItem(
        item.id,
        item.asyncJobId,
        item.fileName || item.file?.name || FALLBACK_RECOVERED_FILE_NAME,
        profile.id
      );
    },
    [profile?.id, resumeRecoveredItem]
  );

  // Discover owner-scoped durable jobs after login, then resume them without
  // inventing an input File or issuing another admission request.
  useEffect(() => {
    const userId = profile?.id;
    if (!userId || typeof listActiveAsyncUpscaleJobs !== 'function') return;

    let cancelled = false;
    const controller = new AbortController();
    const restore = async (): Promise<void> => {
      try {
        const response = await retryAsyncRecoveryRead(
          () => listActiveAsyncUpscaleJobs({ signal: controller.signal }),
          controller.signal
        );
        if (cancelled) return;
        const stored = readStoredAsyncUpscaleJobs(userId);
        const storedById = new Map(stored.map(entry => [entry.jobId, entry]));
        const jobs = response.jobs.filter(job =>
          ['submitting', 'processing', 'ready', 'completed'].includes(job.status)
        );
        jobs.forEach(job => {
          const fileName = storedById.get(job.jobId)?.fileName || FALLBACK_RECOVERED_FILE_NAME;
          rememberAsyncUpscaleJob(userId, {
            jobId: job.jobId,
            fileName,
            createdAt: storedById.get(job.jobId)?.createdAt || job.createdAt,
          });
        });
        setQueue(prev => {
          // Discovery is a bounded snapshot, not proof an existing job ended.
          const retained = prev;
          const existingIds = new Set(retained.map(item => item.asyncJobId));
          const recovered = jobs
            .filter(job => !existingIds.has(job.jobId))
            .map(job => ({
              id: job.jobId,
              file: null,
              fileName: storedById.get(job.jobId)?.fileName || FALLBACK_RECOVERED_FILE_NAME,
              asyncJobId: job.jobId,
              previewUrl: '',
              processedUrl: null,
              status: ProcessingStatus.PROCESSING,
              progress: job.status === 'completed' || job.status === 'ready' ? 90 : 50,
              stage: ProcessingStage.ENHANCING,
            }));
          return [...retained, ...recovered];
        });
        if (jobs[0]) setActiveId(current => current ?? jobs[0].jobId);
        await Promise.all(
          jobs.map(job =>
            resumeRecoveredItem(
              job.jobId,
              job.jobId,
              storedById.get(job.jobId)?.fileName || FALLBACK_RECOVERED_FILE_NAME,
              userId,
              job.executionDeadline
            )
          )
        );
      } catch {
        // A temporary list failure must not erase locally persisted job IDs.
      }
    };
    void restore();
    return () => {
      cancelled = true;
      controller.abort();
      recoveryControllers.current.forEach(jobController => jobController.abort());
    };
  }, [profile?.id, resumeRecoveredItem]);

  const clearQueue = useCallback(() => {
    queue.forEach(item => URL.revokeObjectURL(item.previewUrl));
    setQueue([]);
    setActiveId(null);
    setIsProcessingBatch(false);
  }, [queue]);

  const clearBatchLimitError = useCallback(() => {
    setBatchLimitExceeded(null);
  }, []);

  const clearProviderUnavailable = useCallback(() => {
    setProviderUnavailable(current =>
      current
        ? {
            ...current,
            isModalOpen: false,
          }
        : null
    );
  }, []);

  const showProviderUnavailable = useCallback(() => {
    setProviderUnavailable(current =>
      current
        ? {
            ...current,
            isModalOpen: true,
          }
        : null
    );
  }, []);

  const processSingleItem = async (item: IRetryableBatchItem, config: IUpscaleConfig) => {
    if (!item.file) {
      if (item.asyncJobId && profile?.id) {
        await resumeRecoveredItem(
          item.id,
          item.asyncJobId,
          item.fileName || FALLBACK_RECOVERED_FILE_NAME,
          profile.id
        );
      }
      return;
    }

    updateItemStatus(item.id, {
      status: ProcessingStatus.PROCESSING,
      progress: 0,
      stage: ProcessingStage.PREPARING,
      error: undefined,
      retryable: undefined,
      asyncStatusCheckAvailable: false,
    });

    let fileToProcess = item.file;

    try {
      const prepared = await prepareFileForProcessing(
        item.file,
        config.qualityTier,
        config.scale,
        uploadByteLimit
      );
      fileToProcess = prepared.file;

      if (prepared.resized) {
        const previewUrl = URL.createObjectURL(prepared.file);
        URL.revokeObjectURL(item.previewUrl);

        updateItemStatus(item.id, {
          file: prepared.file,
          previewUrl,
        });

        showToast({
          message: t(
            'oversizedImage.autoResizeToastProcessing',
            buildProcessingAutoResizeToastValues({
              resizedWidth: prepared.dimensions?.width ?? 0,
              resizedHeight: prepared.dimensions?.height ?? 0,
              scale: config.scale,
            })
          ),
          type: 'info',
          duration: 3000,
        });
      }
    } catch {
      // If client-side revalidation fails, keep the original file and let the
      // server remain the final enforcement point.
    }

    // Track upscale started event
    let inputWidth: number | undefined;
    let inputHeight: number | undefined;
    try {
      const dimensions = await loadImageDimensions(fileToProcess);
      inputWidth = dimensions.width;
      inputHeight = dimensions.height;
    } catch {
      // Dimensions not available, continue without them
    }

    analytics.track('image_upscale_started', {
      inputWidth,
      inputHeight,
      scaleFactor: config.scale,
      modelUsed: config.qualityTier,
    });

    const startsNewAttempt = item.status === ProcessingStatus.ERROR && item.retryable === false;
    const jobId = startsNewAttempt ? crypto.randomUUID() : (item.asyncJobId ?? crypto.randomUUID());
    rememberAsyncUpscaleJob(profile?.id, {
      jobId,
      fileName: fileToProcess.name,
      createdAt: Date.now(),
    });
    updateItemStatus(item.id, { asyncJobId: jobId, fileName: fileToProcess.name });
    let jobAccepted = Boolean(item.asyncJobId && !startsNewAttempt);
    let preserveProcessingState = false;

    const startTime = Date.now();
    let success = false;
    let errorType: string | undefined;

    try {
      const result = await processImage(
        fileToProcess,
        config,
        (p, stage) => {
          updateItemStatus(item.id, {
            progress: p,
            stage: stage || ProcessingStage.ENHANCING,
          });
        },
        {
          jobId,
          onJobAccepted: acceptedJobId => {
            jobAccepted = true;
            rememberAsyncUpscaleJob(profile?.id, {
              jobId: acceptedJobId,
              fileName: fileToProcess.name,
              createdAt: Date.now(),
            });
            updateItemStatus(item.id, { asyncJobId: acceptedJobId });
          },
          onJobStatus: (status: IAsyncUpscaleStatus) => {
            updateItemStatus(item.id, {
              status: ProcessingStatus.PROCESSING,
              progress: status.status === 'submitting' ? 30 : 65,
              stage: ProcessingStage.ENHANCING,
            });
          },
        }
      );
      setProviderUnavailable(null);

      // Prefer imageUrl (direct URL, edge-optimized) over imageData (base64)
      // Both work in <img> tags, but URL is faster and avoids CORS issues
      updateItemStatus(item.id, {
        status: ProcessingStatus.COMPLETED,
        processedUrl: result.imageUrl || result.imageData || '',
        progress: 100,
        stage: undefined, // Clear stage on completion
        asyncJobId: undefined,
        asyncStatusCheckAvailable: false,
      });
      forgetAsyncUpscaleJob(profile?.id, result.jobId || jobId);

      // Update credits when processing used credits (creditsUsed > 0)
      if (result.creditsUsed > 0) {
        useUserStore.getState().updateCreditsFromProcessing(result.creditsRemaining);
      }

      // The source exceeded the selected model's size limit, so a tiled model ran
      // instead. Disclose it rather than swapping models silently.
      if (result.dimensionPreservingFallback) {
        showToast({
          message: t('oversizedImage.dimensionPreservingModelToast', {
            model: result.modelDisplayName ?? '',
          }),
          type: 'info',
          duration: 5000,
        });
      }

      success = true;
    } catch (error: unknown) {
      const errorMessage = serializeError(error);

      if (isAsyncUpscalePendingError(error)) {
        preserveProcessingState = true;
        rememberAsyncUpscaleJob(profile?.id, {
          jobId,
          fileName: fileToProcess.name,
          createdAt: Date.now(),
        });
        updateItemStatus(item.id, {
          status: ProcessingStatus.PROCESSING,
          error: error.message,
          stage: ProcessingStage.ENHANCING,
          asyncJobId: jobId,
          asyncStatusCheckAvailable: true,
        });
        return;
      }

      if (isAsyncUpscaleTerminalError(error)) {
        forgetAsyncUpscaleJob(profile?.id, error.jobId);
        updateItemStatus(item.id, {
          status: ProcessingStatus.ERROR,
          error: error.message,
          retryable: error.retryable,
          stage: undefined,
          asyncJobId: undefined,
          asyncStatusCheckAvailable: false,
        });
        return;
      }

      if (jobAccepted) {
        rememberAsyncUpscaleJob(profile?.id, {
          jobId,
          fileName: fileToProcess.name,
          createdAt: Date.now(),
        });
      }

      // Determine error type for analytics
      if (error instanceof FreeLimitExceededError) {
        errorType = 'free_limit_exceeded';
        analytics.track('error_occurred', {
          errorType,
          errorMessage: 'Free processing limit reached',
          context: {
            requiredCredits: error.requiredCredits,
            availableCredits: error.availableCredits,
          },
        });
        updateItemStatus(item.id, {
          status: ProcessingStatus.ERROR,
          error: 'Free limit reached. Upgrade to continue processing.',
          stage: undefined,
        });
        showToast({
          message: 'You have used all of your free credits. Upgrade to continue.',
          type: 'error',
          duration: TIMEOUTS.TOAST_LONG_AUTO_CLOSE_DELAY,
        });
        return;
      } else if (error instanceof BatchLimitError) {
        errorType = 'batch_limit_exceeded';

        updateItemStatus(item.id, {
          status: ProcessingStatus.ERROR,
          error: 'Hourly limit reached',
          stage: undefined,
        });

        // Track error_occurred event for batch limit
        analytics.track('error_occurred', {
          errorType: 'rate_limited',
          errorMessage: 'Batch limit exceeded',
          context: {
            limit: error.limit,
            attempted: queue.filter(i => i.status === ProcessingStatus.IDLE).length,
          },
        });

        // Stop batch processing, show upgrade modal
        setIsProcessingBatch(false);
        setBatchLimitExceeded({
          attempted: queue.filter(i => i.status === ProcessingStatus.IDLE).length,
          limit: error.limit,
          serverEnforced: true,
        });
        return;
      } else if (error instanceof ProviderUnavailableError) {
        errorType = 'provider_unavailable';
        setIsProcessingBatch(false);
        setProviderUnavailable({
          message: error.message,
          retryAt: error.retryAt,
          suppressPurchaseCtas: error.suppressPurchaseCtas,
          isModalOpen: true,
        });
        updateItemStatus(item.id, {
          status: ProcessingStatus.ERROR,
          error: error.message,
          stage: undefined,
        });
        analytics.track('error_occurred', {
          errorType,
          errorMessage: 'Image provider unavailable',
          context: {
            retryAt: error.retryAt?.toISOString(),
          },
        });
        showToast({
          message: error.message,
          type: 'error',
          duration: TIMEOUTS.TOAST_LONG_AUTO_CLOSE_DELAY,
        });
        return;
      } else if (isUpscaleEdgeError(error)) {
        errorType = 'edge_error';
        void reportUpscaleEdgeFailure(error, {
          qualityTier: config.qualityTier,
          scale: config.scale,
        });
        updateItemStatus(item.id, {
          status: ProcessingStatus.ERROR,
          error: error.message,
          retryable: true,
          stage: undefined,
        });
        analytics.track('error_occurred', {
          errorType,
          errorMessage: error.message,
          context: {
            status: error.status,
            rayId: error.rayId,
          },
        });
        showToast({
          message: error.message,
          type: 'error',
          duration: TIMEOUTS.TOAST_LONG_AUTO_CLOSE_DELAY,
        });
        return;
      } else if (error instanceof Error && error.message.includes('insufficient credits')) {
        errorType = 'insufficient_credits';
        const requiredCredits = calculateBatchProviderAwareCreditCost({
          config,
          items: [item],
        }).totalCredits;

        // Track error_occurred event for insufficient credits
        analytics.track('error_occurred', {
          errorType: 'insufficient_credits',
          errorMessage: 'Insufficient credits for operation',
        });
        analytics.track('credit_wall_shown', {
          source: 'midbatch',
          requiredCredits,
          currentBalance: totalCredits,
          deficit: Math.max(0, requiredCredits - totalCredits),
        });

        // Show a specific error message for insufficient credits
        const creditsError =
          'You have insufficient credits for this operation. Please purchase more credits or upgrade your subscription.';
        updateItemStatus(item.id, {
          status: ProcessingStatus.ERROR,
          error: creditsError,
          stage: undefined, // Clear stage on error
        });

        // Show toast notification for insufficient credits
        showToast({
          message:
            'Insufficient credits: Please purchase more credits to continue processing images.',
          type: 'error',
          duration: TIMEOUTS.TOAST_LONG_AUTO_CLOSE_DELAY,
        });
        return;
      } else if (error instanceof Error && error.message.includes('timeout')) {
        errorType = 'timeout';

        // Track error_occurred event for timeout
        analytics.track('error_occurred', {
          errorType: 'timeout',
          errorMessage: 'Request timeout during processing',
        });

        // Show a specific error message for timeout
        const timeoutError =
          'Request timeout: The image processing request timed out. Please try again.';
        updateItemStatus(item.id, {
          status: ProcessingStatus.ERROR,
          error: timeoutError,
          stage: undefined, // Clear stage on error
        });

        // Show toast notification for timeout
        showToast({
          message: 'Request timeout: The image processing request took too long. Please try again.',
          type: 'error',
          duration: TIMEOUTS.TOAST_LONG_AUTO_CLOSE_DELAY,
        });
        return;
      } else {
        errorType = 'unknown';

        // Track error_occurred event for unknown errors
        analytics.track('error_occurred', {
          errorType: 'upscale_failed',
          errorMessage: 'Failed to process image. Please try again.',
        });
      }

      updateItemStatus(item.id, {
        status: ProcessingStatus.ERROR,
        error: errorMessage,
        stage: undefined, // Clear stage on error
      });

      // Show toast notification for the error
      showToast({
        message: `Failed to process ${item.file.name}: ${errorMessage}`,
        type: 'error',
        duration: TIMEOUTS.TOAST_LONG_AUTO_CLOSE_DELAY,
      });
    } finally {
      const durationMs = Date.now() - startTime;

      // Calculate resolutions
      const inputResolution =
        inputWidth && inputHeight ? `${inputWidth}x${inputHeight}` : undefined;
      const outputResolution =
        inputWidth && inputHeight
          ? `${inputWidth * config.scale}x${inputHeight * config.scale}`
          : undefined;

      // The server owns terminal telemetry for API-backed processing. Browser
      // background removal is the only client-owned terminal path.
      if (config.qualityTier === 'bg-removal') {
        if (success) {
          analytics.track('upscale_completed', {
            durationMs,
            modelUsed: config.qualityTier,
            inputResolution,
            outputResolution,
            success: true,
          });
        } else {
          analytics.track('processing_failed', {
            ...normalizeCoreEventProperties('processing_failed', {
              errorType,
              reason: errorType,
              provider: 'unknown',
              model: 'unknown',
              qualityTier: config.qualityTier,
              retryable: errorType === 'timeout' || errorType === 'provider_unavailable',
              durationMs,
              requestId: 'unknown',
            }),
          });
        }
      }

      // Last-resort state invariant: every settled request must leave the queue
      // in a terminal state, even if a future catch branch returns early.
      setQueue(prev =>
        prev.map(queueItem =>
          queueItem.id === item.id &&
          queueItem.status === ProcessingStatus.PROCESSING &&
          !preserveProcessingState
            ? {
                ...queueItem,
                status: ProcessingStatus.ERROR,
                error: queueItem.error || 'Failed to process image. Please try again.',
                stage: undefined,
              }
            : queueItem
        )
      );
    }
  };

  const processBatch = async (config: IUpscaleConfig) => {
    setIsProcessingBatch(true);

    const itemsToProcess = queue.filter(
      item =>
        item.status === ProcessingStatus.IDLE ||
        (item.status === ProcessingStatus.ERROR && item.retryable !== false)
    );

    const total = itemsToProcess.length;

    // Process sequentially with delay to avoid Replicate rate limits
    // Replicate limits: 6 req/min without payment method, stricter when low balance
    for (let i = 0; i < itemsToProcess.length; i++) {
      const item = itemsToProcess[i];
      setBatchProgress({ current: i + 1, total });
      await processSingleItem(item, config);

      // Add delay between requests to avoid rate limits
      // Skip delay after the last item or for client-side processing (no API rate limits)
      if (config.qualityTier !== 'bg-removal' && i < itemsToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, TIMEOUTS.BATCH_REQUEST_DELAY));
      }
    }

    setBatchProgress(null);
    setIsProcessingBatch(false);
  };

  return {
    queue,
    activeId,
    activeItem,
    isProcessingBatch,
    batchProgress,
    completedCount,
    batchLimit,
    batchLimitExceeded,
    providerUnavailable,
    setActiveId,
    addFiles,
    addSampleItem,
    removeItem,
    clearQueue,
    processBatch,
    processSingleItem,
    checkAsyncJobStatus,
    clearBatchLimitError,
    clearProviderUnavailable,
    showProviderUnavailable,
  };
};

const isUpscaleEdgeError = (error: unknown): error is UpscaleEdgeError => {
  try {
    return typeof UpscaleEdgeError === 'function' && error instanceof UpscaleEdgeError;
  } catch {
    // A partial module mock may not provide optional error exports.
    return false;
  }
};

const isAsyncUpscalePendingError = (error: unknown): error is AsyncUpscalePendingError => {
  try {
    return (
      typeof AsyncUpscalePendingError === 'function' && error instanceof AsyncUpscalePendingError
    );
  } catch {
    return false;
  }
};

const isAsyncUpscaleTerminalError = (error: unknown): error is AsyncUpscaleTerminalError => {
  try {
    return (
      typeof AsyncUpscaleTerminalError === 'function' && error instanceof AsyncUpscaleTerminalError
    );
  } catch {
    return false;
  }
};
