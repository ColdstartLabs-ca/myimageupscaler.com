'use client';

import React, { useState, useEffect } from 'react';
import { Dropzone } from '@client/components/features/image-processing/Dropzone';
import { CheckCircle2, Layers, Image, List, Wand2, Loader2, Settings } from 'lucide-react';
import { useBatchQueue } from '@client/hooks/pixelperfect/useBatchQueue';
import { IUpscaleConfig, IBatchItem, ProcessingStatus } from '@shared/types/pixelperfect';
import { BatchSidebar } from '@client/components/features/workspace/BatchSidebar';
import { PreviewArea } from '@client/components/features/workspace/PreviewArea';
import { QueueStrip } from '@client/components/features/workspace/QueueStrip';
import { downloadSingle } from '@client/utils/download';
import { UpgradeSuccessBanner } from './UpgradeSuccessBanner';
import { useUserData } from '@client/store/userStore';
import { DEFAULT_ENHANCEMENT_SETTINGS } from '@shared/types/pixelperfect';
import { TabButton } from '@client/components/ui/TabButton';
import { cn } from '@client/utils/cn';

type MobileTab = 'upload' | 'preview' | 'queue';

const Workspace: React.FC = () => {
  // Hook managing all queue state
  const {
    queue,
    activeId,
    activeItem,
    isProcessingBatch,
    batchProgress,
    completedCount,
    setActiveId,
    addFiles,
    removeItem,
    clearQueue,
    processBatch,
    processSingleItem,
  } = useBatchQueue();

  const { subscription } = useUserData();
  const hasSubscription = !!subscription?.price_id;

  // Mobile tab state
  const [mobileTab, setMobileTab] = useState<MobileTab>('upload');

  // Config State
  const [config, setConfig] = useState<IUpscaleConfig>({
    mode: 'both',
    scale: 2,
    enhanceFace: true,
    preserveText: false,
    denoise: true,
    selectedModel: 'real-esrgan',
    enhancement: DEFAULT_ENHANCEMENT_SETTINGS,
  });

  // Success banner state
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Show success banner after first successful batch completion
  useEffect(() => {
    if (completedCount > 0 && !isProcessingBatch) {
      setShowSuccessBanner(true);
    }
  }, [completedCount, isProcessingBatch]);

  // Track previous queue length to detect new uploads
  const prevQueueLengthRef = React.useRef(queue.length);

  // Auto-switch to preview tab ONLY when NEW images are added (not on tab click)
  useEffect(() => {
    const wasEmpty = prevQueueLengthRef.current === 0;
    const hasImages = queue.length > 0;

    // Only auto-switch if we went from empty to having images
    if (wasEmpty && hasImages && mobileTab === 'upload') {
      setMobileTab('preview');
    }

    prevQueueLengthRef.current = queue.length;
  }, [queue.length, mobileTab]);

  // Handlers
  const handleDownloadSingle = async (url: string, filename: string) => {
    try {
      setDownloadError(null);
      await downloadSingle(url, filename, config.mode);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to download image';
      setDownloadError(errorMessage);
      console.error('Download error:', error);
    }
  };

  // Empty State
  if (queue.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col min-h-[600px]">
        <div className="p-8 sm:p-16 flex-grow flex flex-col justify-center">
          <Dropzone onFilesSelected={addFiles} />
          <div className="mt-8 flex justify-center gap-8 text-slate-400 flex-wrap">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} /> Free 5MB limit
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} /> No Watermark
            </div>
            <div className="flex items-center gap-2 text-indigo-500">
              <Layers size={16} /> Batch Supported
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active Workspace State
  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col min-h-[600px]">
      {/* Desktop: Three columns, Mobile: Single panel */}
      <div className="flex flex-col md:flex-row flex-grow h-full">
        {/* Upload/Batch Sidebar */}
        <div
          className={cn(
            'w-full md:w-80 border-b md:border-b-0 md:border-r bg-white',
            // Mobile: full height when active, Desktop: fixed width sidebar
            mobileTab === 'upload' ? 'flex-1 md:flex-none' : 'hidden md:block'
          )}
        >
          <BatchSidebar
            config={config}
            setConfig={setConfig}
            queue={queue}
            isProcessing={isProcessingBatch}
            batchProgress={batchProgress}
            completedCount={completedCount}
            onProcess={() => processBatch(config)}
            onClear={clearQueue}
          />
        </div>

        {/* Right Area: Main View + Queue Strip */}
        <div
          className={cn(
            'flex flex-col bg-slate-50 overflow-hidden relative',
            // Mobile: full height when active, Desktop: flex-grow
            mobileTab === 'preview' ? 'flex-1 md:flex-grow' : 'hidden md:flex md:flex-grow'
          )}
        >
          {/* Success Banner */}
          {showSuccessBanner && (
            <div className="p-4">
              <UpgradeSuccessBanner
                processedCount={completedCount}
                onDismiss={() => setShowSuccessBanner(false)}
                hasSubscription={hasSubscription}
              />
            </div>
          )}

          {/* Download Error Notification */}
          {downloadError && (
            <div className="p-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-sm font-bold">
                  !
                </div>
                <div className="flex-grow">
                  <h4 className="text-sm font-semibold text-red-900 mb-1">Download Failed</h4>
                  <p className="text-sm text-red-700">{downloadError}</p>
                </div>
                <button
                  onClick={() => setDownloadError(null)}
                  className="flex-shrink-0 text-red-400 hover:text-red-600 transition-colors"
                  aria-label="Dismiss error"
                >
                  <span className="sr-only">Dismiss</span>×
                </button>
              </div>
            </div>
          )}

          {/* Main Preview Area */}
          <div className="flex-grow p-6 flex items-center justify-center overflow-hidden relative">
            <PreviewArea
              activeItem={activeItem}
              onDownload={handleDownloadSingle}
              onRetry={(item: IBatchItem) => processSingleItem(item, config)}
              selectedModel={config.selectedModel}
              batchProgress={batchProgress}
              isProcessingBatch={isProcessingBatch}
            />
          </div>
        </div>

        {/* Queue Strip */}
        <div
          className={cn(
            'w-full md:w-64 border-t md:border-t-0 md:border-l bg-white',
            // Mobile: full height when active, Desktop: fixed width sidebar
            mobileTab === 'queue' ? 'flex-1 md:flex-none' : 'hidden md:block'
          )}
        >
          <QueueStrip
            queue={queue}
            activeId={activeId}
            isProcessing={isProcessingBatch}
            onSelect={setActiveId}
            onRemove={removeItem}
            onAddFiles={addFiles}
          />
        </div>
      </div>

      {/* Mobile Floating Action Button - Process CTA */}
      {mobileTab !== 'upload' && queue.length > 0 && (
        <div className="md:hidden px-4 py-3 bg-white border-t border-slate-200">
          <button
            onClick={() => processBatch(config)}
            disabled={
              isProcessingBatch || queue.every(i => i.status === ProcessingStatus.COMPLETED)
            }
            className={cn(
              'w-full py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all',
              isProcessingBatch || queue.every(i => i.status === ProcessingStatus.COMPLETED)
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 active:scale-[0.98] shadow-lg shadow-indigo-200'
            )}
          >
            {isProcessingBatch ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>
                  {batchProgress
                    ? `Processing ${batchProgress.current}/${batchProgress.total}...`
                    : 'Processing...'}
                </span>
              </>
            ) : queue.every(i => i.status === ProcessingStatus.COMPLETED) ? (
              <>
                <CheckCircle2 className="h-5 w-5" />
                <span>All Processed</span>
              </>
            ) : (
              <>
                <Wand2 className="h-5 w-5" />
                <span>
                  Process All ({queue.filter(i => i.status !== ProcessingStatus.COMPLETED).length})
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Mobile Tab Bar */}
      <nav className="md:hidden flex border-t border-slate-200 bg-white">
        <TabButton
          active={mobileTab === 'upload'}
          onClick={() => setMobileTab('upload')}
          icon={Settings}
        >
          Settings
        </TabButton>
        <TabButton
          active={mobileTab === 'preview'}
          onClick={() => setMobileTab('preview')}
          icon={Image}
        >
          Preview
        </TabButton>
        <TabButton active={mobileTab === 'queue'} onClick={() => setMobileTab('queue')} icon={List}>
          Queue
        </TabButton>
      </nav>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default Workspace;
