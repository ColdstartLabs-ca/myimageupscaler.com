import {
  IBatchItem,
  IUpscaleConfig,
  ProcessingStage,
  ProcessingStatus,
} from '@/shared/types/coreflow.types';
import { useToastStore } from '@client/store/toastStore';
import { useUserData, useUserStore } from '@client/store/userStore';
import { BatchLimitError, processImage } from '@client/utils/api-client';
import { getBatchLimit } from '@shared/config/subscription.utils';
import { TIMEOUTS } from '@shared/config/timeouts.config';
import { serializeError } from '@shared/utils/errors';
import { useCallback, useEffect, useState } from 'react';

interface IBatchProgress {
  current: number;
  total: number;
}

interface IUseBatchQueueReturn {
  queue: IBatchItem[];
  activeId: string | null;
  activeItem: IBatchItem | null;
  isProcessingBatch: boolean;
  batchProgress: IBatchProgress | null;
  completedCount: number;
  batchLimit: number;
  batchLimitExceeded: { attempted: number; limit: number; serverEnforced?: boolean } | null;
  setActiveId: (id: string) => void;
  addFiles: (files: File[]) => void;
  removeItem: (id: string) => void;
  clearQueue: () => void;
  processBatch: (config: IUpscaleConfig) => Promise<void>;
  processSingleItem: (item: IBatchItem, config: IUpscaleConfig) => Promise<void>;
  clearBatchLimitError: () => void;
}

export const useBatchQueue = (): IUseBatchQueueReturn => {
  const [queue, setQueue] = useState<IBatchItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<IBatchProgress | null>(null);
  const [batchLimitExceeded, setBatchLimitExceeded] = useState<{
    attempted: number;
    limit: number;
    serverEnforced?: boolean;
  } | null>(null);
  const showToast = useToastStore(state => state.showToast);

  // Get user subscription data
  const { profile } = useUserData();
  const batchLimit = getBatchLimit(profile?.subscription_tier ?? null);

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
    (files: File[]) => {
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

      const newItems: IBatchItem[] = filesToAdd.map(file => ({
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

      // Show modal if some files were rejected due to limit
      if (rejectedCount > 0) {
        setBatchLimitExceeded({
          attempted: files.length,
          limit: batchLimit,
        });
      }
    },
    [activeId, queue.length, batchLimit]
  );

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

  const updateItemStatus = useCallback((id: string, updates: Partial<IBatchItem>) => {
    setQueue(prev => prev.map(item => (item.id === id ? { ...item, ...updates } : item)));
  }, []);

  const clearQueue = useCallback(() => {
    queue.forEach(item => URL.revokeObjectURL(item.previewUrl));
    setQueue([]);
    setActiveId(null);
    setIsProcessingBatch(false);
  }, [queue]);

  const clearBatchLimitError = useCallback(() => {
    setBatchLimitExceeded(null);
  }, []);

  const processSingleItem = async (item: IBatchItem, config: IUpscaleConfig) => {
    updateItemStatus(item.id, {
      status: ProcessingStatus.PROCESSING,
      progress: 0,
      stage: ProcessingStage.PREPARING,
      error: undefined,
    });

    try {
      const result = await processImage(item.file, config, (p, stage) => {
        updateItemStatus(item.id, {
          progress: p,
          stage: stage || ProcessingStage.ENHANCING,
        });
      });

      // Prefer imageUrl (direct URL, edge-optimized) over imageData (base64)
      // Both work in <img> tags, but URL is faster and avoids CORS issues
      updateItemStatus(item.id, {
        status: ProcessingStatus.COMPLETED,
        processedUrl: result.imageUrl || result.imageData || '',
        progress: 100,
        stage: undefined, // Clear stage on completion
      });

      // Update credits immediately after successful processing
      useUserStore.getState().updateCreditsFromProcessing(result.creditsRemaining);
    } catch (error: unknown) {
      const errorMessage = serializeError(error);

      // Handle batch limit exceeded from API
      if (error instanceof BatchLimitError) {
        // Stop batch processing, show upgrade modal
        setIsProcessingBatch(false);
        setBatchLimitExceeded({
          attempted: queue.filter(i => i.status === ProcessingStatus.IDLE).length,
          limit: error.limit,
          serverEnforced: true,
        });
        return;
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
    }
  };

  const processBatch = async (config: IUpscaleConfig) => {
    setIsProcessingBatch(true);

    const itemsToProcess = queue.filter(
      item => item.status === ProcessingStatus.IDLE || item.status === ProcessingStatus.ERROR
    );

    const total = itemsToProcess.length;

    // Process sequentially with delay to avoid Replicate rate limits
    // Replicate limits: 6 req/min without payment method, stricter when low balance
    for (let i = 0; i < itemsToProcess.length; i++) {
      const item = itemsToProcess[i];
      setBatchProgress({ current: i + 1, total });
      await processSingleItem(item, config);

      // Add delay between requests to avoid rate limits
      // Skip delay after the last item
      if (i < itemsToProcess.length - 1) {
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
    setActiveId,
    addFiles,
    removeItem,
    clearQueue,
    processBatch,
    processSingleItem,
    clearBatchLimitError,
  };
};
