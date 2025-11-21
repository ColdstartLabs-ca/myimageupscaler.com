import { useState, useEffect, useCallback } from 'react';
import { IBatchItem, ProcessingStatus, IUpscaleConfig } from '@/types/pixelperfect';
import { processImage } from '@/lib/pixelperfect/api-client';

interface IUseBatchQueueReturn {
  queue: IBatchItem[];
  activeId: string | null;
  activeItem: IBatchItem | null;
  isProcessingBatch: boolean;
  completedCount: number;
  setActiveId: (id: string) => void;
  addFiles: (files: File[]) => void;
  removeItem: (id: string) => void;
  clearQueue: () => void;
  processBatch: (config: IUpscaleConfig) => Promise<void>;
  processSingleItem: (item: IBatchItem, config: IUpscaleConfig) => Promise<void>;
}

export const useBatchQueue = (): IUseBatchQueueReturn => {
  const [queue, setQueue] = useState<IBatchItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      queue.forEach(item => URL.revokeObjectURL(item.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeItem = queue.find(item => item.id === activeId) || null;
  const completedCount = queue.filter(i => i.status === ProcessingStatus.COMPLETED).length;

  const addFiles = useCallback((files: File[]) => {
    const newItems: IBatchItem[] = files.map(file => ({
      id: Math.random().toString(36).substring(2, 15),
      file,
      previewUrl: URL.createObjectURL(file),
      processedUrl: null,
      status: ProcessingStatus.IDLE,
      progress: 0
    }));

    setQueue(prev => {
      const updated = [...prev, ...newItems];
      if (!activeId && updated.length > 0) {
        setActiveId(updated[0].id);
      }
      return updated;
    });
  }, [activeId]);

  const removeItem = useCallback((id: string) => {
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
  }, [queue, activeId]);

  const updateItemStatus = useCallback((id: string, updates: Partial<IBatchItem>) => {
    setQueue(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  }, []);

  const clearQueue = useCallback(() => {
    queue.forEach(item => URL.revokeObjectURL(item.previewUrl));
    setQueue([]);
    setActiveId(null);
    setIsProcessingBatch(false);
  }, [queue]);

  const processSingleItem = async (item: IBatchItem, config: IUpscaleConfig) => {
    updateItemStatus(item.id, { status: ProcessingStatus.PROCESSING, progress: 0, error: undefined });
    
    try {
      const resultUrl = await processImage(item.file, config, (p) => {
        updateItemStatus(item.id, { progress: p });
      });
      updateItemStatus(item.id, { 
        status: ProcessingStatus.COMPLETED, 
        processedUrl: resultUrl, 
        progress: 100 
      });
    } catch (error: unknown) {
      updateItemStatus(item.id, {
        status: ProcessingStatus.ERROR,
        error: error instanceof Error ? error.message : "Processing failed"
      });
    }
  };

  const processBatch = async (config: IUpscaleConfig) => {
    setIsProcessingBatch(true);
    
    const itemsToProcess = queue.filter(
      item => item.status === ProcessingStatus.IDLE || item.status === ProcessingStatus.ERROR
    );

    // Process sequentially
    for (const item of itemsToProcess) {
      // Check if item still exists in current queue state (handle removal during processing)
      // We need to check the ref or just let the loop run, but checking existence is safer
      await processSingleItem(item, config);
    }

    setIsProcessingBatch(false);
  };

  return {
    queue,
    activeId,
    activeItem,
    isProcessingBatch,
    completedCount,
    setActiveId,
    addFiles,
    removeItem,
    clearQueue,
    processBatch,
    processSingleItem
  };
};