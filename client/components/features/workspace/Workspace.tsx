'use client';

import { useBatchQueue } from '@/client/hooks/useBatchQueue';
import {
  DEFAULT_ENHANCEMENT_SETTINGS,
  IBatchItem,
  IUpscaleConfig,
  ProcessingStatus,
  QUALITY_TIER_CONFIG,
} from '@/shared/types/coreflow.types';
import { CheckoutModal } from '@client/components/stripe/CheckoutModal';
import { PurchaseModal } from '@client/components/stripe/PurchaseModal';
import { Dropzone } from '@client/components/features/image-processing/Dropzone';
import { BatchSidebar } from '@client/components/features/workspace/BatchSidebar';
import { PreviewArea } from '@client/components/features/workspace/PreviewArea';
import { QueueStrip } from '@client/components/features/workspace/QueueStrip';
import { AmbientBackground } from '@client/components/landing/AmbientBackground';
import { ErrorAlert } from '@client/components/stripe/ErrorAlert';
import { TabButton } from '@client/components/ui/TabButton';
import { analytics } from '@client/analytics';
import { useEngagementTracker } from '@client/hooks/useEngagementTracker';
import { useOnboardingDriver } from '@client/hooks/useOnboardingDriver';
import { useRegionTier } from '@client/hooks/useRegionTier';
import { useUserData } from '@client/store/userStore';
import { cn } from '@client/utils/cn';
import { EngagementDiscountBanner } from '@client/components/engagement-discount';
import { clientEnv } from '@shared/config/env';
import { downloadSingle } from '@client/utils/download';
import {
  CheckCircle2,
  HelpCircle,
  Image,
  Layers,
  List,
  Loader2,
  Settings,
  Wand2,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AfterUpscaleBanner } from './AfterUpscaleBanner';
import { BatchLimitModal } from './BatchLimitModal';
import { ModelGalleryModal } from './ModelGalleryModal';
import { PremiumUpsellModal } from './PremiumUpsellModal';
import { ProgressSteps, checkIsFirstTimeUser, markFirstUploadCompleted } from './ProgressSteps';
import { SampleImageSelector } from './SampleImageSelector';
import { ISampleImage } from '@shared/config/sample-images.config';
import { UpgradeSuccessBanner } from './UpgradeSuccessBanner';
import { MobileUpgradePrompt } from './MobileUpgradePrompt';
import { PostDownloadPrompt } from './PostDownloadPrompt';
import { FirstDownloadCelebration } from './FirstDownloadCelebration';

type MobileTab = 'upload' | 'preview' | 'queue';
const FREE_DOWNLOAD_UPSELL_PROBABILITY = 0.5;

const Workspace: React.FC = () => {
  const t = useTranslations('workspace');
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
  const searchParams = useSearchParams();
  const { trackUpscale, trackDownload, trackModelSwitch } = useEngagementTracker();
  const { isPaywalled, country } = useRegionTier();

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeModalOutOfCredits, setUpgradeModalOutOfCredits] = useState(false);
  const [upgradeModalTrigger, setUpgradeModalTrigger] = useState('workspace');

  const openUpgradeModal = (outOfCredits = false, trigger = 'workspace') => {
    setUpgradeModalOutOfCredits(outOfCredits);
    setUpgradeModalTrigger(trigger);
    setShowUpgradeModal(true);
  };
  const closeUpgradeModal = () => {
    setShowUpgradeModal(false);
    setUpgradeModalOutOfCredits(false);
  };
  const [postAuthCheckoutPriceId, setPostAuthCheckoutPriceId] = useState<string | null>(null);
  const processedCheckoutParamRef = React.useRef(false);

  // Auto-open checkout after post-auth redirect: /?checkout=<priceId>
  useEffect(() => {
    if (processedCheckoutParamRef.current) return;
    const checkoutParam = searchParams.get('checkout');
    if (!checkoutParam) return;
    processedCheckoutParamRef.current = true;
    setPostAuthCheckoutPriceId(checkoutParam);
    // Fire checkout_opened here — useCheckoutFlow can't fire it for unauthenticated paths
    analytics.track('checkout_opened', {
      priceId: checkoutParam,
      source: 'post_auth_redirect',
    });
  }, [searchParams]);

  // First-time user onboarding state
  const [isFirstTimeUser] = useState(() => checkIsFirstTimeUser());
  const [showSamplesModal, setShowSamplesModal] = useState(false);
  const { startTourPhase1, startTour, startTourPhase3 } = useOnboardingDriver();

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

  // Track model switches for engagement discount
  const prevQualityTierRef = React.useRef(config.qualityTier);
  useEffect(() => {
    if (prevQualityTierRef.current !== config.qualityTier) {
      prevQualityTierRef.current = config.qualityTier;
      trackModelSwitch();
    }
  }, [config.qualityTier, trackModelSwitch]);

  // Track upscale completions for engagement discount
  const prevCompletedCountRef = React.useRef(completedCount);
  useEffect(() => {
    if (completedCount > prevCompletedCountRef.current) {
      const delta = completedCount - prevCompletedCountRef.current;
      for (let i = 0; i < delta; i++) trackUpscale();
    }
    prevCompletedCountRef.current = completedCount;
  }, [completedCount, trackUpscale]);

  // Track paywall_shown event for authenticated workspace users
  const paywallTrackedRef = React.useRef(false);
  useEffect(() => {
    if (isPaywalled && isFreeUser && country && !paywallTrackedRef.current) {
      paywallTrackedRef.current = true;
      analytics.track('paywall_shown', {
        country,
        context: 'authenticated_workspace',
      });
    }
  }, [isPaywalled, isFreeUser, country]);

  // Success banner state
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [showPremiumUpsell, setShowPremiumUpsell] = useState(false);
  const [pendingDownload, setPendingDownload] = useState<{ url: string; filename: string } | null>(
    null
  );
  const [downloadCount, setDownloadCount] = useState(0);
  const wasProcessingRef = React.useRef(false);
  const firstUploadSourceRef = React.useRef<'sample' | 'upload'>('upload');
  const firstUploadStartedAtRef = React.useRef<number>(0);

  // Global error state for showing ErrorAlert components
  const [globalErrors, setGlobalErrors] = useState<
    Array<{ id: string; message: string; title?: string }>
  >([]);

  // Auto-start phase 1 tour (dropzone tip) on first visit
  useEffect(() => {
    if (isFirstTimeUser && queue.length === 0) {
      void startTourPhase1();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-start phase 2 tour (quality + process) when first image is uploaded
  const tourPhase2StartedRef = React.useRef(false);
  useEffect(() => {
    if (queue.length > 0 && !tourPhase2StartedRef.current) {
      tourPhase2StartedRef.current = true;
      void startTour();
    }
  }, [queue.length, startTour]);

  // Auto-start phase 3 tour (download button) when first result is ready
  const tourPhase3StartedRef = React.useRef(false);
  useEffect(() => {
    if (completedCount > 0 && !tourPhase3StartedRef.current) {
      tourPhase3StartedRef.current = true;
      void startTourPhase3();
    }
  }, [completedCount, startTourPhase3]);

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
          // Auto-open upgrade modal with outOfCredits: true
          openUpgradeModal(true, 'insufficient_credits');
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
  // Skip auto-switch if Phase 2 tour hasn't been seen yet — sidebar must stay visible for tour
  useEffect(() => {
    const wasEmpty = prevQueueLengthRef.current === 0;
    const hasImages = queue.length > 0;

    if (wasEmpty && hasImages) {
      if (mobileTab === 'upload') setMobileTab('preview');
      // Record when first image entered the queue for activation metric
      if (firstUploadStartedAtRef.current === 0) {
        firstUploadStartedAtRef.current = Date.now();
      }
    }

    prevQueueLengthRef.current = queue.length;
  }, [queue.length, mobileTab]);

  // Handlers
  const executeDownload = async (url: string, filename: string) => {
    try {
      setDownloadError(null);

      await downloadSingle(url, filename, config.qualityTier);
      trackDownload();
      const newCount = downloadCount + 1;
      setDownloadCount(newCount);

      // Show celebration modal on first download and fire activation event
      if (newCount === 1) {
        setShowCelebration(true);
        const durationMs = firstUploadStartedAtRef.current
          ? Date.now() - firstUploadStartedAtRef.current
          : 0;
        markFirstUploadCompleted(firstUploadSourceRef.current, durationMs);
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
    openUpgradeModal(false, 'workspace_premium_upsell');
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
    setShowSamplesModal(false);
    firstUploadSourceRef.current = 'sample';
    void addSampleItem(sample.beforeSrc, sample.afterSrc, sample.title);
  };

  const handleHelpClick = () => {
    analytics.track('sample_help_button_clicked', { queueLength: queue.length });
    setShowSamplesModal(true);
  };

  // Empty State
  if (queue.length === 0) {
    return (
      <div className="bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col h-[calc(100dvh-5rem)] md:h-auto md:min-h-[600px]">
        <div className="px-8 pt-6 relative">
          <ProgressSteps currentStep={1} isFirstUpload={isFirstTimeUser} />
          <button
            onClick={handleHelpClick}
            className="absolute right-8 top-6 flex items-center justify-center w-7 h-7 rounded-lg text-text-muted hover:text-text hover:bg-white/10 transition-colors"
            aria-label="Try sample images"
            title="Try sample images"
          >
            <HelpCircle size={16} />
          </button>
        </div>
        <div className="p-8 sm:p-16 flex-grow flex flex-col justify-center relative">
          <AmbientBackground variant="section" />
          <div className="relative z-10">
            <Dropzone
              onFilesSelected={addFiles}
              onUpgrade={() => openUpgradeModal(false, 'workspace_dropzone')}
            />
            <div className="mt-4 md:mt-8 flex justify-center gap-4 md:gap-8 text-text-muted flex-wrap text-xs md:text-sm">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-secondary shrink-0" />{' '}
                {t('workspace.features.freeLimit')}
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-secondary shrink-0" />{' '}
                {t('workspace.features.noWatermark')}
              </div>
              <div className="flex items-center gap-1.5 text-accent">
                <Layers size={13} className="shrink-0" /> {t('workspace.features.batch')}{' '}
                {batchLimit === 1
                  ? t('workspace.features.upgradeRequired')
                  : t('workspace.features.upToImages', { count: batchLimit })}
              </div>
            </div>
          </div>
        </div>

        {showSamplesModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSamplesModal(false)}
          >
            <div
              className="relative bg-surface rounded-2xl shadow-2xl border border-border p-6 max-w-2xl w-full mx-4"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => setShowSamplesModal(false)}
                className="absolute right-4 top-4 text-text-muted hover:text-text transition-colors p-1"
                aria-label="Close"
              >
                <X size={20} />
              </button>
              <SampleImageSelector isVisible={true} onSampleSelect={handleSampleSelect} />
            </div>
          </div>
        )}
        <div className="px-8 pb-4">
          <MobileUpgradePrompt
            variant="upload"
            isFreeUser={isFreeUser}
            onUpgrade={() => openUpgradeModal(false, 'workspace_mobile_upload')}
          />
        </div>

        <PurchaseModal
          isOpen={showUpgradeModal}
          onClose={closeUpgradeModal}
          onPurchaseComplete={closeUpgradeModal}
          outOfCredits={upgradeModalOutOfCredits}
          trigger={upgradeModalTrigger}
        />

        {postAuthCheckoutPriceId && (
          <CheckoutModal
            priceId={postAuthCheckoutPriceId}
            onClose={() => setPostAuthCheckoutPriceId(null)}
            onSuccess={() => setPostAuthCheckoutPriceId(null)}
          />
        )}
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
            onUpgrade={() => openUpgradeModal(true, 'workspace_batch_sidebar')}
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
          {/* Progress steps */}
          <div className="px-3 pt-3 md:px-4 md:pt-4 relative">
            <ProgressSteps currentStep={progressStep} isFirstUpload={isFirstTimeUser} />
            <button
              onClick={handleHelpClick}
              className="absolute right-3 top-3 md:right-4 md:top-4 flex items-center justify-center w-7 h-7 rounded-lg text-text-muted hover:text-text hover:bg-white/10 transition-colors"
              aria-label="Try sample images"
              title="Try sample images"
            >
              <HelpCircle size={16} />
            </button>
          </div>

          {/* Success Banner */}
          {showSuccessBanner && completedCount > 0 && (
            <div className="px-3 pt-3 md:p-4">
              <UpgradeSuccessBanner
                processedCount={completedCount}
                onDismiss={() => setShowSuccessBanner(false)}
                hasSubscription={hasSubscription}
                onUpgrade={() => openUpgradeModal(false, 'after_batch')}
              />
            </div>
          )}

          {/* After 3rd upscale upgrade nudge (free users only, once per session) */}
          {isFreeUser && (
            <div className="px-3 md:px-4 pb-0">
              <AfterUpscaleBanner
                completedCount={completedCount}
                isFreeUser={isFreeUser}
                currentModel={config.qualityTier}
                onUpgrade={() => openUpgradeModal(false, 'workspace_after_upscale_banner')}
              />
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
              onUpgrade={() => openUpgradeModal(false, 'workspace_preview_area')}
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
              data-driver="mobile-process-button"
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
          data-driver="mobile-quality-selector"
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
        onUpgrade={() => openUpgradeModal(false, 'workspace_model_gallery')}
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
        onUpgrade={() => openUpgradeModal(false, 'workspace_batch_limit')}
        serverEnforced={batchLimitExceeded?.serverEnforced}
      />

      <PremiumUpsellModal
        isOpen={showPremiumUpsell}
        onClose={handlePremiumUpsellClose}
        onProceed={() => {
          void handlePremiumUpsellProceed();
        }}
        onViewPlans={handlePremiumUpsellViewPlans}
        currentModel={config.qualityTier}
      />

      <PostDownloadPrompt
        isFreeUser={isFreeUser}
        downloadCount={downloadCount}
        currentModel={config.qualityTier}
        onUpgrade={() => openUpgradeModal(false, 'after_download')}
      />

      {showCelebration && (
        <FirstDownloadCelebration
          isFreeUser={isFreeUser}
          source="upload"
          onUploadAnother={() => {
            setShowCelebration(false);
            // Focus on dropzone
          }}
          onDismiss={() => setShowCelebration(false)}
          onUpgrade={() => openUpgradeModal(false, 'celebration')}
        />
      )}

      <PurchaseModal
        isOpen={showUpgradeModal}
        onClose={closeUpgradeModal}
        onPurchaseComplete={closeUpgradeModal}
        trigger={upgradeModalTrigger}
      />

      {postAuthCheckoutPriceId && (
        <CheckoutModal
          priceId={postAuthCheckoutPriceId}
          onClose={() => setPostAuthCheckoutPriceId(null)}
          onSuccess={() => setPostAuthCheckoutPriceId(null)}
        />
      )}

      {/* Engagement discount banner — shown to eligible free users */}
      <EngagementDiscountBanner
        onClaimDiscount={() =>
          setPostAuthCheckoutPriceId(clientEnv.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_MEDIUM)
        }
      />

      {/* Samples modal — triggered by help button */}
      {showSamplesModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSamplesModal(false)}
        >
          <div
            className="relative bg-surface rounded-2xl shadow-2xl border border-border p-6 max-w-2xl w-full mx-4"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setShowSamplesModal(false)}
              className="absolute right-4 top-4 text-text-muted hover:text-text transition-colors p-1"
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <SampleImageSelector isVisible={true} onSampleSelect={handleSampleSelect} />
          </div>
        </div>
      )}
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default Workspace;
