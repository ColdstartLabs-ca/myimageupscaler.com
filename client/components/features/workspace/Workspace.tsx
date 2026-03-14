'use client';

import { useBatchQueue } from '@/client/hooks/useBatchQueue';
import {
  DEFAULT_ENHANCEMENT_SETTINGS,
  IBatchItem,
  IUpscaleConfig,
  ProcessingStatus,
  QUALITY_TIER_CONFIG,
} from '@/shared/types/coreflow.types';
import { Dropzone } from '@client/components/features/image-processing/Dropzone';
import { BatchSidebar } from '@client/components/features/workspace/BatchSidebar';
import { PreviewArea } from '@client/components/features/workspace/PreviewArea';
import { QueueStrip } from '@client/components/features/workspace/QueueStrip';
import { AmbientBackground } from '@client/components/landing/AmbientBackground';
import { ErrorAlert } from '@client/components/stripe/ErrorAlert';
import { TabButton } from '@client/components/ui/TabButton';
import { useOnboardingDriver } from '@client/hooks/useOnboardingDriver';
import { useUserData } from '@client/store/userStore';
import { cn } from '@client/utils/cn';
import { downloadSingle } from '@client/utils/download';
import { CheckCircle2, Image, Layers, List, Loader2, Settings, Wand2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AfterUpscaleBanner } from './AfterUpscaleBanner';
import { BatchLimitModal } from './BatchLimitModal';
import { FirstDownloadCelebration, shouldShowCelebration } from './FirstDownloadCelebration';
import { ModelGalleryModal } from './ModelGalleryModal';
import { PremiumUpsellModal } from './PremiumUpsellModal';
import { ProgressSteps, checkIsFirstTimeUser, markFirstUploadCompleted } from './ProgressSteps';
import { SampleImageSelector } from './SampleImageSelector';
import { ISampleImage } from '@shared/config/sample-images.config';
import { UpgradeSuccessBanner } from './UpgradeSuccessBanner';

type MobileTab = 'upload' | 'preview' | 'queue';
const FREE_DOWNLOAD_UPSELL_PROBABILITY = 0.5;

const Workspace: React.FC = () => {
  const t = useTranslations('workspace');
  const router = useRouter();
  // Hook managing all queue state
  const {
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
    addSampleItem,
    removeItem,
    clearQueue,
    processBatch,
    processSingleItem,
    clearBatchLimitError,
  } = useBatchQueue();

  const { isFreeUser } = useUserData();
  const hasSubscription = !isFreeUser;

  // First-time user onboarding state
  const [isFirstTimeUser] = useState(() => checkIsFirstTimeUser());
  const [showCelebration, setShowCelebration] = useState(false);
  const { startTour } = useOnboardingDriver();

  // Current progress step derived from queue state
  const progressStep = useMemo((): 1 | 2 | 3 => {
    if (queue.length === 0) return 1;
    if (queue.some(i => i.status === ProcessingStatus.COMPLETED)) return 3;
    return 2;
  }, [queue]);

  // Mobile tab state
  const [mobileTab, setMobileTab] = useState<MobileTab>('upload');

  // Mobile gallery modal state
  const [mobileGalleryOpen, setMobileGalleryOpen] = useState(false);

  // Config State - default to 'quick' for all users (free and paid)
  const [config, setConfig] = useState<IUpscaleConfig>({
    qualityTier: 'quick',
    scale: 2,
    additionalOptions: {
      smartAnalysis: false, // Hidden when qualityTier='auto'
      enhance: true,
      enhanceFaces: true,
      preserveText: false,
      customInstructions: undefined,
      enhancement: DEFAULT_ENHANCEMENT_SETTINGS,
    },
  });

  // Success banner state
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [showPremiumUpsell, setShowPremiumUpsell] = useState(false);
  const [pendingDownload, setPendingDownload] = useState<{ url: string; filename: string } | null>(
    null
  );
  const wasProcessingRef = React.useRef(false);

  // Global error state for showing ErrorAlert components
  const [globalErrors, setGlobalErrors] = useState<
    Array<{ id: string; message: string; title?: string }>
  >([]);

  // Show success banner only when batch processing finishes (transitions from processing to done)
  useEffect(() => {
    if (isProcessingBatch) {
      wasProcessingRef.current = true;
    } else if (wasProcessingRef.current && completedCount > 0) {
      wasProcessingRef.current = false;
      setShowSuccessBanner(true);
    }
  }, [completedCount, isProcessingBatch]);

  // Monitor queue for errors and add them to global error state
  useEffect(() => {
    const errorItems = queue.filter(item => item.status === 'ERROR');

    errorItems.forEach(item => {
      if (item.error && !globalErrors.some(error => error.id === item.id)) {
        let errorTitle = t('workspace.errors.title');

        if (item.error?.toLowerCase().includes('insufficient credits')) {
          errorTitle = t('workspace.errors.insufficientCredits');
        } else if (item.error?.toLowerCase().includes('timeout')) {
          errorTitle = t('workspace.errors.requestTimeout');
        } else if (
          item.error?.toLowerCase().includes('server error') ||
          item.error?.toLowerCase().includes('ai service')
        ) {
          errorTitle = t('workspace.errors.serverError');
        }

        setGlobalErrors(prev => [
          ...prev,
          {
            id: item.id,
            message: item.error || 'Unknown error occurred',
            title: errorTitle,
          },
        ]);
      }
    });
  }, [queue, globalErrors]);

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
  const executeDownload = async (url: string, filename: string) => {
    try {
      setDownloadError(null);
      await downloadSingle(url, filename, config.qualityTier);

      // First-time user flow: mark completion, show celebration, then start tour
      if (isFirstTimeUser) {
        markFirstUploadCompleted('upload', 0);
        if (shouldShowCelebration()) {
          setShowCelebration(true);
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : t('workspace.downloadError.title');
      setDownloadError(errorMessage);
      console.error('Download error:', error);
    }
  };

  const handleDownloadSingle = async (url: string, filename: string) => {
    // Free users: intercept 50% of download attempts with premium upsell modal.
    if (isFreeUser && Math.random() < FREE_DOWNLOAD_UPSELL_PROBABILITY) {
      setPendingDownload({ url, filename });
      setShowPremiumUpsell(true);
      return;
    }

    await executeDownload(url, filename);
  };

  const handlePremiumUpsellClose = () => {
    setShowPremiumUpsell(false);
    setPendingDownload(null);
  };

  const handlePremiumUpsellProceed = async () => {
    setShowPremiumUpsell(false);
    const queuedDownload = pendingDownload;
    setPendingDownload(null);
    if (!queuedDownload) return;
    await executeDownload(queuedDownload.url, queuedDownload.filename);
  };

  const handlePremiumUpsellViewPlans = () => {
    setShowPremiumUpsell(false);
    setPendingDownload(null);
    router.push('/dashboard/billing');
  };

  // Handler for partial add from modal
  const handleAddPartial = () => {
    clearBatchLimitError();
    // We need to get the pending files somehow
    // For now, just clear the error - the user will need to re-upload fewer files
  };

  // Handler to dismiss global error
  const dismissError = (errorId: string) => {
    setGlobalErrors(prev => prev.filter(error => error.id !== errorId));
  };

  const handleSampleSelect = (sample: ISampleImage) => {
    void addSampleItem(sample.beforeSrc, sample.afterSrc, sample.title);
  };

  const handleCelebrationDismiss = () => {
    setShowCelebration(false);
    // Start the tour after the user closes the celebration
    void startTour();
  };

  // Empty State
  if (queue.length === 0) {
    return (
      <div className="bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col min-h-[600px]">
        {isFirstTimeUser && (
          <div className="px-8 pt-6">
            <ProgressSteps currentStep={1} isFirstUpload={true} />
          </div>
        )}
        <div className="p-8 sm:p-16 flex-grow flex flex-col justify-center relative">
          <AmbientBackground variant="section" />
          <div className="relative z-10">
            <Dropzone onFilesSelected={addFiles} />
            <div className="mt-8 flex justify-center gap-8 text-text-muted flex-wrap">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-secondary" />{' '}
                {t('workspace.features.freeLimit')}
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-secondary" />{' '}
                {t('workspace.features.noWatermark')}
              </div>
              <div className="flex items-center gap-2 text-accent">
                <Layers size={16} /> {t('workspace.features.batch')}{' '}
                {batchLimit === 1
                  ? t('workspace.features.upgradeRequired')
                  : t('workspace.features.upToImages', { count: batchLimit })}
              </div>
            </div>
            {isFirstTimeUser && (
              <div className="mt-10">
                <SampleImageSelector isVisible={true} onSampleSelect={handleSampleSelect} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Active Workspace State
  return (
    <div className="bg-main rounded-3xl shadow-2xl border border-border overflow-hidden flex flex-col md:min-h-[600px] h-[calc(100dvh-5rem)] md:h-auto">
      {/* Desktop: Three columns, Mobile: Single panel */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
        {/* Upload/Batch Sidebar */}
        <div
          className={cn(
            'w-full md:w-80 border-b md:border-b-0 md:border-r bg-surface border-border',
            // Mobile: full height when active, Desktop: fixed width sidebar
            mobileTab === 'upload' ? 'flex-1 min-h-0 md:flex-none' : 'hidden md:block'
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
            'flex flex-col bg-main overflow-hidden relative',
            // Mobile: full height when active, Desktop: flex-grow
            mobileTab === 'preview' ? 'flex-1 min-h-0 md:flex-grow' : 'hidden md:flex md:flex-grow'
          )}
        >
          {/* First-time user progress steps */}
          {isFirstTimeUser && (
            <div className="px-3 pt-3 md:px-4 md:pt-4">
              <ProgressSteps currentStep={progressStep} isFirstUpload={true} />
            </div>
          )}

          {/* Success Banner */}
          {showSuccessBanner && completedCount > 0 && (
            <div className="px-3 pt-3 md:p-4">
              <UpgradeSuccessBanner
                processedCount={completedCount}
                onDismiss={() => setShowSuccessBanner(false)}
                hasSubscription={hasSubscription}
              />
            </div>
          )}

          {/* After 3rd upscale upgrade nudge (free users only, once per session) */}
          {isFreeUser && (
            <div className="px-3 md:px-4 pb-0">
              <AfterUpscaleBanner completedCount={completedCount} isFreeUser={isFreeUser} />
            </div>
          )}

          {/* Global Error Alerts */}
          {globalErrors.map(error => (
            <div key={error.id} className="p-4">
              <ErrorAlert
                title={error.title}
                message={error.message}
                className="cursor-pointer"
                onClick={() => dismissError(error.id)}
              />
            </div>
          ))}

          {/* Download Error Notification */}
          {downloadError && (
            <div className="p-4">
              <div className="bg-error/10 border border-error/20 rounded-lg p-4 flex items-start gap-3">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-error/20 flex items-center justify-center text-error text-sm font-bold">
                  !
                </div>
                <div className="flex-grow">
                  <h4 className="text-sm font-semibold text-error mb-1">Download Failed</h4>
                  <p className="text-sm text-error/80">{downloadError}</p>
                </div>
                <button
                  onClick={() => setDownloadError(null)}
                  className="flex-shrink-0 text-error/70 hover:text-error transition-colors"
                  aria-label="Dismiss error"
                >
                  <span className="sr-only">Dismiss</span>×
                </button>
              </div>
            </div>
          )}

          {/* Main Preview Area */}
          <div className="flex-1 min-h-0 md:flex-grow p-2 md:p-6 flex items-center justify-center overflow-hidden relative">
            <PreviewArea
              activeItem={activeItem}
              onDownload={handleDownloadSingle}
              onRetry={(item: IBatchItem) => processSingleItem(item, config)}
              selectedModel={config.qualityTier}
              batchProgress={batchProgress}
              isProcessingBatch={isProcessingBatch}
              isFreeUser={isFreeUser}
            />
          </div>

          {/* Queue Strip at bottom */}
          <div className="hidden md:block">
            <QueueStrip
              queue={queue}
              activeId={activeId}
              isProcessing={isProcessingBatch}
              onSelect={setActiveId}
              onRemove={removeItem}
              onAddFiles={addFiles}
              batchLimit={batchLimit}
            />
          </div>
        </div>

        {/* Mobile Queue View */}
        {mobileTab === 'queue' && (
          <div className="flex-1 min-h-0 overflow-auto md:hidden bg-main">
            <QueueStrip
              queue={queue}
              activeId={activeId}
              isProcessing={isProcessingBatch}
              onSelect={id => {
                setActiveId(id);
                setMobileTab('preview');
              }}
              onRemove={removeItem}
              onAddFiles={addFiles}
              batchLimit={batchLimit}
            />
          </div>
        )}
      </div>

      {/* Mobile Floating Action Button - Process CTA (hidden when all done) */}
      {mobileTab !== 'upload' &&
        queue.length > 0 &&
        !queue.every(i => i.status === ProcessingStatus.COMPLETED) && (
          <div className="md:hidden px-4 py-2 bg-surface border-t border-border shrink-0">
            <button
              onClick={() => processBatch(config)}
              disabled={isProcessingBatch}
              className={cn(
                'w-full py-3 px-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all relative overflow-hidden',
                isProcessingBatch
                  ? 'bg-white/5 text-text-muted cursor-not-allowed'
                  : 'gradient-cta shine-effect active:scale-[0.98] shadow-lg shadow-accent/20'
              )}
            >
              <span className="relative z-10 flex items-center gap-2">
                {isProcessingBatch ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>
                      {batchProgress
                        ? `Processing ${batchProgress.current}/${batchProgress.total}...`
                        : 'Processing...'}
                    </span>
                  </>
                ) : (
                  <>
                    <Wand2 className="h-5 w-5" />
                    <span>
                      Process All (
                      {queue.filter(i => i.status !== ProcessingStatus.COMPLETED).length})
                    </span>
                  </>
                )}
              </span>
            </button>
          </div>
        )}

      {/* Mobile Quality Tier Selector */}
      <div className="md:hidden border-t border-border bg-surface/80 px-3 py-2 shrink-0">
        <button
          onClick={() => setMobileGalleryOpen(true)}
          disabled={isProcessingBatch}
          className={cn(
            'w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium',
            'bg-gradient-to-r from-accent/20 via-accent/10 to-tertiary/20',
            'border border-accent/25 text-white',
            'shine-effect transition-all hover:border-accent/40',
            isProcessingBatch && 'opacity-50 cursor-not-allowed'
          )}
        >
          <div className="flex items-center gap-2 relative z-10">
            <Layers size={16} className="text-accent shrink-0" />
            <span>
              Quality:{' '}
              <span className="font-bold">{QUALITY_TIER_CONFIG[config.qualityTier].label}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 relative z-10">
            <span className="text-[10px] font-black tracking-widest uppercase text-white/60 bg-black/20 border border-white/10 px-2 py-0.5 rounded-lg">
              {(() => {
                const credits = QUALITY_TIER_CONFIG[config.qualityTier].credits;
                if (credits === 'variable') return '1-4 CR';
                return `${credits} CR`;
              })()}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-accent">
              Change
            </span>
          </div>
        </button>
      </div>
      <ModelGalleryModal
        isOpen={mobileGalleryOpen}
        onClose={() => setMobileGalleryOpen(false)}
        currentTier={config.qualityTier}
        isFreeUser={isFreeUser}
        onSelect={tier => setConfig(prev => ({ ...prev, qualityTier: tier }))}
      />

      {/* Mobile Tab Bar */}
      <nav className="md:hidden flex border-t border-border bg-surface shrink-0">
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

      {/* Batch Limit Modal */}
      <BatchLimitModal
        isOpen={!!batchLimitExceeded}
        onClose={clearBatchLimitError}
        limit={batchLimitExceeded?.limit ?? batchLimit}
        attempted={batchLimitExceeded?.attempted ?? 0}
        currentCount={queue.length}
        onAddPartial={handleAddPartial}
        serverEnforced={batchLimitExceeded?.serverEnforced}
      />

      <PremiumUpsellModal
        isOpen={showPremiumUpsell}
        onClose={handlePremiumUpsellClose}
        onProceed={() => {
          void handlePremiumUpsellProceed();
        }}
        onViewPlans={handlePremiumUpsellViewPlans}
      />

      {/* First-time user celebration modal — shown once after first download */}
      {showCelebration && (
        <FirstDownloadCelebration
          isFreeUser={isFreeUser}
          source="upload"
          onUploadAnother={() => {
            setShowCelebration(false);
            clearQueue();
          }}
          onDismiss={handleCelebrationDismiss}
        />
      )}
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default Workspace;
