import { IBatchItem, ProcessingStage, ProcessingStatus } from '@/shared/types/coreflow.types';
import ImageComparison from '@client/components/features/image-processing/ImageComparison';
import { Button } from '@client/components/ui/Button';
import { AlertTriangle, Check, Layers, Loader2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

export interface IBatchProgress {
  current: number;
  total: number;
}

export interface IPreviewAreaProps {
  activeItem: IBatchItem | null;
  onDownload: (url: string, filename: string) => void;
  onRetry: (item: IBatchItem) => void;
  selectedModel?: string;
  batchProgress?: IBatchProgress | null;
  isProcessingBatch?: boolean;
  isFreeUser?: boolean;
}

// Extracted Components
const ScanningLineAnimation: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    <div
      className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-accent/50 to-transparent"
      style={{
        animation: 'scan 2s ease-in-out infinite',
      }}
    />
    <style>{`
      @keyframes scan {
        0%, 100% { top: 0%; opacity: 0; }
        10% { opacity: 1; }
        90% { opacity: 1; }
        50% { top: 100%; }
      }
    `}</style>
  </div>
);

const BatchProgressIndicator: React.FC<{ batchProgress?: IBatchProgress | null }> = ({
  batchProgress,
}) => {
  if (!batchProgress || batchProgress.total <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 pb-2 border-b border-border">
      <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-1 rounded-full">
        Image {batchProgress.current} of {batchProgress.total}
      </span>
    </div>
  );
};

const StageIndicator: React.FC<{ stageMessage: string }> = ({ stageMessage }) => (
  <div className="flex items-center gap-3">
    <div className="relative">
      <Loader2 size={20} className="text-accent animate-spin" />
      <div className="absolute inset-0 rounded-full border-2 border-accent/30 animate-ping opacity-30" />
    </div>
    <span className="text-sm font-medium text-white">{stageMessage}</span>
  </div>
);

const ProgressBar: React.FC<{
  progress: number;
  isEnhancing: boolean;
  estimatedRemaining: number;
}> = ({ progress, isEnhancing, estimatedRemaining }) => (
  <div className="space-y-2">
    <div className="flex justify-between text-xs text-muted-foreground">
      <span>{Math.round(progress)}%</span>
      {isEnhancing && estimatedRemaining > 0 && <span>~{estimatedRemaining}s remaining</span>}
    </div>
    <div className="h-2 w-full bg-surface-light rounded-full overflow-hidden relative">
      <div
        className="h-full bg-accent transition-all duration-300 relative overflow-hidden"
        style={{ width: `${progress}%` }}
      >
        <div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
          style={{
            animation: 'shimmer 1.5s infinite',
          }}
        />
        <style>{`
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
      </div>
    </div>
  </div>
);

const ProcessingDots: React.FC = () => (
  <div className="flex justify-center gap-1.5 pt-2">
    {[0, 200, 400].map((delay, i) => (
      <span
        key={i}
        className="w-2 h-2 bg-accent rounded-full"
        style={{
          animation: 'pulse-dot 1.4s ease-in-out infinite',
          animationDelay: `${delay}ms`,
        }}
      />
    ))}
    <style>{`
      @keyframes pulse-dot {
        0%, 100% {
          transform: scale(1);
          opacity: 0.4;
        }
        50% {
          transform: scale(1.3);
          opacity: 1;
        }
      }
    `}</style>
  </div>
);

const StageDescription: React.FC<{ stage: ProcessingStage }> = ({ stage }) => {
  const t = useTranslations('workspace');
  const descriptions: Record<ProcessingStage, string> = {
    [ProcessingStage.PREPARING]: t('previewArea.stages.preparing'),
    [ProcessingStage.ANALYZING]: t('previewArea.stages.analyzing'),
    [ProcessingStage.ENHANCING]: t('previewArea.stages.enhancing'),
    [ProcessingStage.FINALIZING]: t('previewArea.stages.finalizing'),
  };

  return <p className="text-xs text-muted-foreground text-center">{descriptions[stage]}</p>;
};

const ErrorOverlay: React.FC<{
  item: IBatchItem;
  onRetry: (item: IBatchItem) => void;
}> = ({ item, onRetry }) => {
  const t = useTranslations('workspace');
  return (
    <div className="absolute inset-0 bg-surface/50 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-surface p-6 rounded-xl shadow-xl border border-error/20 text-center max-w-md">
        <div className="w-12 h-12 bg-error/20 rounded-full flex items-center justify-center mx-auto mb-4 text-error">
          <AlertTriangle size={24} />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">{t('previewArea.errors.title')}</h3>
        <p className="text-muted-foreground mb-4">{item.error}</p>
        <Button size="sm" onClick={() => onRetry(item)}>
          {t('previewArea.errors.tryAgain')}
        </Button>
      </div>
    </div>
  );
};

// Estimated processing times by model (in seconds)
const MODEL_PROCESSING_TIMES: Record<string, number> = {
  'real-esrgan': 15,
  gfpgan: 20,
  'nano-banana': 25,
  'clarity-upscaler': 30,
  'nano-banana-pro': 45,
  'bg-removal': 10, // ~10 seconds for browser-based processing
  auto: 35, // Average
};

export const PreviewArea: React.FC<IPreviewAreaProps> = ({
  activeItem,
  onDownload,
  onRetry,
  selectedModel = 'auto',
  batchProgress,
  isProcessingBatch = false,
  isFreeUser = false,
}) => {
  const t = useTranslations('workspace');

  // Stage messages - defined inside component to access t
  const STAGE_MESSAGES: Record<ProcessingStage, string> = {
    [ProcessingStage.PREPARING]: t('previewArea.statusMessages.preparing'),
    [ProcessingStage.ANALYZING]: t('previewArea.statusMessages.analyzing'),
    [ProcessingStage.ENHANCING]: t('previewArea.statusMessages.enhancing'),
    [ProcessingStage.FINALIZING]: t('previewArea.statusMessages.finalizing'),
  };

  // Interpolated progress for smooth animation
  const [displayProgress, setDisplayProgress] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  // Track elapsed time during processing
  useEffect(() => {
    if (activeItem?.status === ProcessingStatus.PROCESSING) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }

      const interval = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);

      return () => clearInterval(interval);
    } else {
      startTimeRef.current = null;
      setElapsedSeconds(0);
    }
  }, [activeItem?.status]);

  // Smooth progress interpolation during ENHANCING stage
  useEffect(() => {
    if (!activeItem) {
      setDisplayProgress(0);
      return;
    }

    const actualProgress = activeItem.progress;
    const stage = activeItem.stage;

    // During ENHANCING stage (50-95%), smoothly interpolate
    if (stage === ProcessingStage.ENHANCING && actualProgress === 50) {
      const estimatedTime = MODEL_PROCESSING_TIMES[selectedModel] || 30;
      const targetProgress = 90; // Interpolate up to 90%

      const interval = setInterval(() => {
        const elapsed = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0;
        // Asymptotic approach: fast start, slow finish
        const ratio = Math.min(elapsed / estimatedTime, 0.95);
        const interpolated = 50 + (targetProgress - 50) * (1 - Math.pow(1 - ratio, 2));
        setDisplayProgress(Math.min(interpolated, targetProgress));
      }, 100);

      return () => clearInterval(interval);
    } else {
      // For other stages, follow actual progress
      setDisplayProgress(actualProgress);
    }
  }, [activeItem, activeItem?.progress, activeItem?.stage, selectedModel]);

  if (!activeItem) {
    return (
      <div className="text-muted-foreground flex flex-col items-center">
        <Layers size={48} className="mb-4 opacity-50" />
        <p>{t('previewArea.emptyState.title')}</p>
      </div>
    );
  }

  // Check if we're waiting for the next batch item (between items during batch processing)
  const isWaitingForNextBatchItem =
    isProcessingBatch &&
    batchProgress &&
    batchProgress.current < batchProgress.total &&
    activeItem?.status === ProcessingStatus.COMPLETED;

  if (activeItem.status === ProcessingStatus.COMPLETED && activeItem.processedUrl) {
    return (
      <div className="w-full h-full md:h-[65vh] md:min-h-[400px] flex flex-col">
        <div className="mb-1 md:mb-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 md:flex-col md:items-start md:gap-0">
            <h3 className="text-xs md:text-sm font-medium text-white truncate max-w-[180px] md:max-w-none">
              {activeItem.file.name}
            </h3>
            <span className="text-[10px] md:text-xs text-green-400 flex items-center gap-1 shrink-0">
              <Check size={10} className="md:w-3 md:h-3" /> {t('previewArea.completed.title')}
            </span>
          </div>
        </div>
        <div className="flex-grow relative min-h-0">
          <ImageComparison
            beforeUrl={activeItem.previewUrl}
            afterUrl={activeItem.processedUrl}
            onDownload={() => onDownload(activeItem.processedUrl!, activeItem.file.name)}
            showUpgradeNudge={isFreeUser}
          />

          {/* Waiting for next batch item overlay */}
          {isWaitingForNextBatchItem && (
            <div className="absolute inset-0 bg-surface/80 backdrop-blur-sm flex items-center justify-center rounded-xl z-10">
              <div className="bg-surface p-6 rounded-xl shadow-2xl border border-border text-center max-w-sm">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <span className="text-xs font-semibold text-accent bg-accent/10 px-3 py-1.5 rounded-full">
                    {t('previewArea.batch.imageXofYcomplete', {
                      current: batchProgress.current,
                      total: batchProgress.total,
                    })}
                  </span>
                </div>

                <div className="flex items-center justify-center gap-3 mb-4">
                  <Loader2 size={20} className="text-accent animate-spin" />
                  <span className="text-sm font-medium text-white">
                    {t('previewArea.batch.preparingNext')}
                  </span>
                </div>

                {/* Processing indicator dots */}
                <div className="flex justify-center gap-1.5">
                  <span
                    className="w-2 h-2 bg-accent rounded-full"
                    style={{
                      animation: 'pulse-dot 1.4s ease-in-out infinite',
                      animationDelay: '0ms',
                    }}
                  />
                  <span
                    className="w-2 h-2 bg-accent rounded-full"
                    style={{
                      animation: 'pulse-dot 1.4s ease-in-out infinite',
                      animationDelay: '200ms',
                    }}
                  />
                  <span
                    className="w-2 h-2 bg-accent rounded-full"
                    style={{
                      animation: 'pulse-dot 1.4s ease-in-out infinite',
                      animationDelay: '400ms',
                    }}
                  />
                  <style>{`
                    @keyframes pulse-dot {
                      0%, 100% {
                        transform: scale(1);
                        opacity: 0.4;
                      }
                      50% {
                        transform: scale(1.3);
                        opacity: 1;
                      }
                    }
                  `}</style>
                </div>

                <p className="text-xs text-muted-foreground mt-4">
                  {t('previewArea.batch.rateLimitingPause')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const estimatedTotalTime = MODEL_PROCESSING_TIMES[selectedModel] || 30;
  const estimatedRemaining = Math.max(0, estimatedTotalTime - elapsedSeconds);
  const stageMessage = activeItem.stage
    ? STAGE_MESSAGES[activeItem.stage]
    : t('previewArea.statusMessages.processing');
  const isEnhancing = activeItem.stage === ProcessingStage.ENHANCING;

  return (
    <div className="relative w-full h-full md:h-[65vh] md:min-h-[400px] max-w-5xl mx-auto bg-surface-light rounded-xl border border-border overflow-hidden flex items-center justify-center">
      <img
        src={activeItem.previewUrl}
        alt={`Preview of ${activeItem.file.name}`}
        className="max-h-full max-w-full object-contain"
        loading="eager"
        decoding="async"
      />

      {/* Processing Overlay */}
      {activeItem.status === ProcessingStatus.PROCESSING && (
        <div className="absolute inset-0 bg-surface/60 backdrop-blur-sm flex flex-col items-center justify-center">
          {/* Scanning line animation during analyzing */}
          {activeItem.stage === ProcessingStage.ANALYZING && <ScanningLineAnimation />}

          <div className="w-72 space-y-4 p-6 bg-surface rounded-xl shadow-2xl border border-border">
            {/* Batch progress indicator */}
            <BatchProgressIndicator batchProgress={batchProgress} />

            {/* Stage indicator with spinner */}
            <StageIndicator stageMessage={stageMessage} />

            {/* Progress bar with smooth animation */}
            <ProgressBar
              progress={displayProgress}
              isEnhancing={isEnhancing}
              estimatedRemaining={estimatedRemaining}
            />

            {/* Processing indicator dots */}
            <ProcessingDots />

            {/* Stage description */}
            {activeItem.stage && <StageDescription stage={activeItem.stage} />}
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {activeItem.status === ProcessingStatus.ERROR && (
        <ErrorOverlay item={activeItem} onRetry={onRetry} />
      )}
    </div>
  );
};
