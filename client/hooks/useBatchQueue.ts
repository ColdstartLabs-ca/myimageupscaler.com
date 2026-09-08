import {
  IBatchItem,
  IUpscaleConfig,
  ProcessingStage,
  ProcessingStatus,
} from '@/shared/types/coreflow.types';
import { useToastStore } from '@client/store/toastStore';
import { useUserData, useUserStore } from '@client/store/userStore';
import {
  BatchLimitError,
  DurableUpscaleTerminalError,
  type IDurableUpscaleJobStatus,
  FreeLimitExceededError,
  processImage,
  ProviderUnavailableError,
  reportUpscaleEdgeFailure,
  listDurableUpscaleJobs,
  resumeDurableUpscale,
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

interface IPersistedDurableJob {
  itemId: string;
  jobId: string;
  fileName: string;
  mimeType: string;
  savedAt: number;
}

const DURABLE_JOB_STORAGE_PREFIX = 'myimageupscaler:durable-jobs:';
const MAX_PERSISTED_DURABLE_JOBS = 50;
const RECOVERED_PREVIEW_URL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

function revokeItemUrls(item: IBatchItem): void {
  for (const url of new Set([item.previewUrl, item.processedUrl])) {
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  }
}

function invalidateUserCredits(): void {
  const store = useUserStore.getState() as unknown as { invalidate?: () => void };
  store.invalidate?.();
}

function durableJobStorageKey(userId: string): string {
  return `${DURABLE_JOB_STORAGE_PREFIX}${userId}`;
}

function readPersistedDurableJobs(userId: string): IPersistedDurableJob[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(durableJobStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is IPersistedDurableJob =>
        item &&
        typeof item === 'object' &&
        typeof item.itemId === 'string' &&
        typeof item.jobId === 'string' &&
        typeof item.fileName === 'string' &&
        typeof item.mimeType === 'string' &&
        typeof item.savedAt === 'number'
    );
  } catch {
    return [];
  }
}

function writePersistedDurableJob(userId: string, item: IPersistedDurableJob): void {
  if (typeof window === 'undefined') return;
  try {
    const current = readPersistedDurableJobs(userId).filter(job => job.jobId !== item.jobId);
    window.localStorage.setItem(
      durableJobStorageKey(userId),
      JSON.stringify([item, ...current].slice(0, MAX_PERSISTED_DURABLE_JOBS))
    );
  } catch {
    // Storage is an optimization for reload recovery; the server remains authoritative.
  }
}

function removePersistedDurableJob(userId: string, jobId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const remaining = readPersistedDurableJobs(userId).filter(job => job.jobId !== jobId);
    if (remaining.length > 0) {
      window.localStorage.setItem(durableJobStorageKey(userId), JSON.stringify(remaining));
    } else {
      window.localStorage.removeItem(durableJobStorageKey(userId));
    }
  } catch {
    // Ignore unavailable browser storage.
  }
}

function removeAllPersistedDurableJobs(userId: string | undefined): void {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(durableJobStorageKey(userId));
  } catch {
    // Ignore unavailable browser storage.
  }
}

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
  clearBatchLimitError: () => void;
  clearProviderUnavailable: () => void;
  showProviderUnavailable: () => void;
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
  const showToast = useToastStore(state => state.showToast);
  const t = useTranslations('workspace');

  // Get user subscription data
  const { profile, subscription, totalCredits } = useUserData();
  const batchLimit = getBatchLimit(profile?.subscription_tier ?? null);
  const uploadByteLimit = subscription?.price_id
    ? IMAGE_VALIDATION.MAX_SIZE_PAID
    : IMAGE_VALIDATION.MAX_SIZE_FREE;

  const queueRef = useRef(queue);
  queueRef.current = queue;
  const accountRef = useRef(profile?.id);
  accountRef.current = profile?.id;
  const previousAccountRef = useRef(profile?.id);
  const admissionsRef = useRef(new Map<string, { controller: AbortController; jobId?: string }>());
  const resumesRef = useRef(new Map<string, AbortController>());
  const batchRunningRef = useRef(false);
  const refreshRecoveryRef = useRef<(() => void) | null>(null);
  const refundedJobsRef = useRef(new Set<string>());

  const updateItemStatus = useCallback((id: string, updates: Partial<IRetryableBatchItem>) => {
    setQueue(prev => prev.map(item => (item.id === id ? { ...item, ...updates } : item)));
  }, []);

  const refreshRefund = useCallback((job: { jobId: string; refunded?: boolean }) => {
    if (job.refunded && !refundedJobsRef.current.has(job.jobId)) {
      refundedJobsRef.current.add(job.jobId);
      invalidateUserCredits();
    }
  }, []);

  // Job IDs and display metadata survive reload; source bytes and capabilities do not.
  // The owner-scoped server listing determines which executions can be resumed.
  useEffect(() => {
    const userId = profile?.id;
    if (previousAccountRef.current && previousAccountRef.current !== userId) {
      queueRef.current.forEach(revokeItemUrls);
      setQueue([]);
      setActiveId(null);
      setIsProcessingBatch(false);
      setBatchProgress(null);
      setBatchLimitExceeded(null);
      setProviderUnavailable(null);
      batchRunningRef.current = false;
    }
    previousAccountRef.current = userId;
    if (!userId) return;
    let cancelled = false;
    let listing = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 2000;
    const listController = new AbortController();
    const current = () => !cancelled && accountRef.current === userId;
    const available = () => navigator.onLine !== false && document.visibilityState !== 'hidden';
    const schedule = () => {
      if (!current() || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void recover();
      }, retryDelay);
      retryDelay = Math.min(10_000, retryDelay * 2);
    };
    const fail = (jobId: string, error: DurableUpscaleTerminalError) => {
      refreshRefund(error);
      setQueue(previous =>
        previous.map(item =>
          item.jobId === jobId
            ? {
                ...item,
                status: ProcessingStatus.ERROR,
                durableStatus: error.status,
                retryable: error.retryable && item.file.size > 0,
                refunded: error.refunded,
                reconnecting: false,
                error: t('workspace.errors.unknownError'),
                stage: undefined,
              }
            : item
        )
      );
    };
    const resume = async (job: IDurableUpscaleJobStatus) => {
      if (
        resumesRef.current.has(job.jobId) ||
        [...admissionsRef.current.values()].some(entry => entry.jobId === job.jobId) ||
        queueRef.current.some(item => item.jobId === job.jobId && item.processedUrl)
      )
        return;
      const controller = new AbortController();
      resumesRef.current.set(job.jobId, controller);
      const update = (patch: Partial<IRetryableBatchItem>) => {
        if (!current() || controller.signal.aborted) return;
        setQueue(previous =>
          previous.map(item => (item.jobId === job.jobId ? { ...item, ...patch } : item))
        );
      };
      try {
        const result = await resumeDurableUpscale(
          job.jobId,
          (progress, stage) => update({ progress, stage }),
          {
            signal: controller.signal,
            onConnectionChange: reconnecting => update({ reconnecting }),
            onJobStatus: status => {
              if (!current() || controller.signal.aborted) return;
              update({ durableStatus: status.status ?? status.stage, refunded: status.refunded });
              refreshRefund(status);
            },
          }
        );
        if (!current() || controller.signal.aborted) {
          if (result.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(result.imageUrl);
          return;
        }
        setQueue(previous =>
          previous.map(item =>
            item.jobId === job.jobId
              ? {
                  ...item,
                  status: ProcessingStatus.COMPLETED,
                  durableStatus: 'completed',
                  processedUrl: result.imageUrl || null,
                  previewUrl:
                    item.file.size > 0 ? item.previewUrl : result.imageUrl || item.previewUrl,
                  progress: 100,
                  stage: undefined,
                  error: undefined,
                  reconnecting: false,
                }
              : item
          )
        );
        invalidateUserCredits();
      } catch (error) {
        if (!current() || controller.signal.aborted) return;
        if (error instanceof DurableUpscaleTerminalError) fail(job.jobId, error);
        else {
          update({ status: ProcessingStatus.PROCESSING, reconnecting: true, error: undefined });
          schedule();
        }
      } finally {
        if (resumesRef.current.get(job.jobId) === controller) resumesRef.current.delete(job.jobId);
      }
    };
    async function recover() {
      if (!current() || listing || !available()) return;
      listing = true;
      try {
        const response = await listDurableUpscaleJobs({ signal: listController.signal });
        if (!current()) return;
        const persisted = new Map(readPersistedDurableJobs(userId!).map(job => [job.jobId, job]));
        const serverIds = new Set(response.jobs.map(job => job.jobId));
        const awaitingCommit = [...persisted.values()].some(
          job => !serverIds.has(job.jobId) && Date.now() - job.savedAt < 24 * 60 * 60 * 1000
        );
        if (awaitingCommit) schedule();
        else retryDelay = 2000;
        const jobs = response.jobs.filter(
          job => !(job.status === 'completed' && job.outputAvailable === false)
        );
        jobs.sort((left, right) => {
          const time = (job: IDurableUpscaleJobStatus) =>
            persisted.get(job.jobId)?.savedAt ?? (Date.parse(job.timestamps?.createdAt ?? '') || 0);
          return time(left) - time(right);
        });
        const recoveredItems = jobs.map(job => {
          const metadata = persisted.get(job.jobId);
          const terminal =
            job.status === 'failed' || job.status === 'expired' || job.status === 'refunded';
          return {
            id: metadata?.itemId || `durable-${job.jobId}`,
            jobId: job.jobId,
            durableStatus: job.status ?? job.stage,
            file: new File([], metadata?.fileName || `${job.jobId}.png`, {
              type: metadata?.mimeType || job.outputMimeType || 'image/png',
            }),
            previewUrl: RECOVERED_PREVIEW_URL,
            processedUrl: null,
            status: terminal ? ProcessingStatus.ERROR : ProcessingStatus.PROCESSING,
            progress: job.status === 'ready' || job.status === 'completed' ? 90 : 10,
            stage: terminal ? undefined : ProcessingStage.ENHANCING,
            retryable: false,
            refunded: job.refunded,
            ...(terminal ? { error: t('workspace.errors.unknownError') } : {}),
          } satisfies IRetryableBatchItem;
        });
        setQueue(previous => {
          const known = new Set(previous.map(item => item.jobId));
          return [...previous, ...recoveredItems.filter(item => !known.has(item.jobId))];
        });
        setActiveId(id => id ?? recoveredItems[0]?.id ?? null);
        for (const job of jobs) {
          if (job.status === 'failed' || job.status === 'expired' || job.status === 'refunded') {
            fail(job.jobId, new DurableUpscaleTerminalError(job));
          } else void resume(job);
        }
      } catch {
        if (current()) schedule();
      } finally {
        listing = false;
      }
    }
    const refresh = () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = undefined;
      void recover();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === durableJobStorageKey(userId)) refresh();
    };
    refreshRecoveryRef.current = refresh;
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', refresh);
    void recover();
    return () => {
      cancelled = true;
      listController.abort();
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', refresh);
      admissionsRef.current.forEach(entry => entry.controller.abort());
      admissionsRef.current.clear();
      resumesRef.current.forEach(controller => controller.abort());
      resumesRef.current.clear();
      refreshRecoveryRef.current = null;
    };
    // Translation changes do not restart authenticated work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, refreshRefund]);

  useEffect(
    () => () => {
      queueRef.current.forEach(revokeItemUrls);
    },
    []
  );

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
        revokeItemUrls(itemToRemove);
        admissionsRef.current.get(id)?.controller.abort();
        if (itemToRemove.jobId) resumesRef.current.get(itemToRemove.jobId)?.abort();
        if (profile?.id && itemToRemove.jobId) {
          removePersistedDurableJob(profile.id, itemToRemove.jobId);
        }
      }

      setQueue(prev => {
        const updated = prev.filter(item => item.id !== id);
        if (activeId === id) {
          setActiveId(updated.length > 0 ? updated[0].id : null);
        }
        return updated;
      });
    },
    [queue, activeId, profile?.id]
  );

  const clearQueue = useCallback(() => {
    queue.forEach(revokeItemUrls);
    admissionsRef.current.forEach(entry => entry.controller.abort());
    resumesRef.current.forEach(controller => controller.abort());
    removeAllPersistedDurableJobs(profile?.id);
    setQueue([]);
    setActiveId(null);
    setIsProcessingBatch(false);
  }, [queue, profile?.id]);

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
    const latest = queueRef.current.find(candidate => candidate.id === item.id) ?? item;
    if (
      admissionsRef.current.has(item.id) ||
      latest.status === ProcessingStatus.PROCESSING ||
      latest.status === ProcessingStatus.COMPLETED ||
      latest.retryable === false ||
      latest.file.size === 0
    )
      return;
    const userId = accountRef.current;
    const controller = new AbortController();
    const durableJobId = config.qualityTier === 'bg-removal' ? undefined : crypto.randomUUID();
    admissionsRef.current.set(item.id, { controller, jobId: durableJobId });
    let accepted = false;
    const current = () => !controller.signal.aborted && accountRef.current === userId;
    updateItemStatus(item.id, {
      status: ProcessingStatus.PROCESSING,
      progress: 0,
      stage: ProcessingStage.PREPARING,
      error: undefined,
      retryable: undefined,
      durableStatus: undefined,
      reconnecting: false,
      refunded: false,
      ...(durableJobId ? { jobId: durableJobId } : {}),
    });

    if (durableJobId && profile?.id) {
      writePersistedDurableJob(profile.id, {
        itemId: item.id,
        jobId: durableJobId,
        fileName: item.file.name,
        mimeType: item.file.type || 'image/jpeg',
        savedAt: Date.now(),
      });
    }

    let fileToProcess = item.file;

    try {
      const prepared = await prepareFileForProcessing(
        item.file,
        config.qualityTier,
        config.scale,
        uploadByteLimit
      );
      if (!current()) {
        admissionsRef.current.delete(item.id);
        return;
      }
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

    if (!current()) {
      admissionsRef.current.delete(item.id);
      return;
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

    if (!current()) {
      admissionsRef.current.delete(item.id);
      return;
    }

    analytics.track('image_upscale_started', {
      inputWidth,
      inputHeight,
      scaleFactor: config.scale,
      modelUsed: config.qualityTier,
    });

    const startTime = Date.now();
    let success = false;
    let errorType: string | undefined;

    try {
      const result = await processImage(
        fileToProcess,
        config,
        (p, stage) => {
          if (!current()) return;
          updateItemStatus(item.id, {
            progress: p,
            stage: stage || ProcessingStage.ENHANCING,
          });
        },
        {
          jobId: durableJobId,
          signal: controller.signal,
          onConnectionChange: reconnecting => {
            if (current()) updateItemStatus(item.id, { reconnecting });
          },
          onJobStatus: job => {
            if (!current()) return;
            updateItemStatus(item.id, {
              durableStatus: job.status ?? job.stage,
              refunded: job.refunded,
            });
            refreshRefund(job);
          },
          onJobAccepted: acceptedJobId => {
            if (!current()) return;
            accepted = true;
            invalidateUserCredits();
            updateItemStatus(item.id, { jobId: acceptedJobId });
            if (profile?.id) {
              writePersistedDurableJob(profile.id, {
                itemId: item.id,
                jobId: acceptedJobId,
                fileName: fileToProcess.name,
                mimeType: fileToProcess.type || 'image/jpeg',
                savedAt: Date.now(),
              });
            }
          },
        }
      );
      if (!current()) {
        if (result.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(result.imageUrl);
        return;
      }
      setProviderUnavailable(null);

      // Prefer imageUrl (direct URL, edge-optimized) over imageData (base64)
      // Both work in <img> tags, but URL is faster and avoids CORS issues
      updateItemStatus(item.id, {
        status: ProcessingStatus.COMPLETED,
        processedUrl: result.imageUrl || result.imageData || '',
        progress: 100,
        durableStatus: result.durable ? 'completed' : undefined,
        reconnecting: false,
        stage: undefined, // Clear stage on completion
      });

      // Update credits when processing used credits (creditsUsed > 0)
      if (result.durable) invalidateUserCredits();
      else if (result.creditsUsed > 0) {
        useUserStore.getState().updateCreditsFromProcessing(result.creditsRemaining);
      }

      if (result.durable !== true && profile?.id && result.jobId) {
        removePersistedDurableJob(profile.id, result.jobId);
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
      if (!current()) return;
      if (error instanceof DurableUpscaleTerminalError) {
        refreshRefund(error);
        updateItemStatus(item.id, {
          status: ProcessingStatus.ERROR,
          durableStatus: error.status,
          refunded: error.refunded,
          retryable: error.retryable,
          reconnecting: false,
          error: t('workspace.errors.unknownError'),
          stage: undefined,
        });
        return;
      }
      if (accepted) {
        updateItemStatus(item.id, {
          status: ProcessingStatus.PROCESSING,
          reconnecting: true,
          error: undefined,
        });
        return;
      }
      if (durableJobId && userId) removePersistedDurableJob(userId, durableJobId);
      if (durableJobId && userId) invalidateUserCredits();
      const errorMessage = serializeError(error);

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
          jobId: durableJobId,
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
      if (admissionsRef.current.get(item.id)?.controller === controller)
        admissionsRef.current.delete(item.id);
      if (accepted && current()) refreshRecoveryRef.current?.();
      if (current()) {
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
            !accepted &&
            queueItem.id === item.id &&
            queueItem.status === ProcessingStatus.PROCESSING
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
    }
  };

  const processBatch = async (config: IUpscaleConfig) => {
    if (
      batchRunningRef.current ||
      queueRef.current.some(item => item.status === ProcessingStatus.PROCESSING)
    )
      return;
    const userId = accountRef.current;
    batchRunningRef.current = true;
    setIsProcessingBatch(true);
    const itemsToProcess = queueRef.current.filter(
      item =>
        (item.status === ProcessingStatus.IDLE || item.status === ProcessingStatus.ERROR) &&
        item.retryable !== false &&
        item.file.size > 0
    );
    try {
      for (let i = 0; i < itemsToProcess.length; i++) {
        if (accountRef.current !== userId || !batchRunningRef.current) break;
        setBatchProgress({ current: i + 1, total: itemsToProcess.length });
        await processSingleItem(itemsToProcess[i], config);
        if (config.qualityTier !== 'bg-removal' && i < itemsToProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, TIMEOUTS.BATCH_REQUEST_DELAY));
        }
      }
    } finally {
      if (accountRef.current === userId) {
        batchRunningRef.current = false;
        setBatchProgress(null);
        setIsProcessingBatch(false);
      }
    }
  };

  return {
    queue,
    activeId,
    activeItem,
    isProcessingBatch:
      isProcessingBatch || queue.some(item => item.status === ProcessingStatus.PROCESSING),
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
