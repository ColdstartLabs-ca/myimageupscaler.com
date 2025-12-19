import { IBatchItem, ProcessingStage, ProcessingStatus } from '@/shared/types/coreflow.types';
import ImageComparison from '@client/components/features/image-processing/ImageComparison';
import { Button } from '@client/components/ui/Button';
import { AlertTriangle, Check, Layers, Loader2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

// Extracted Components
const ScanningLineAnimation: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    <div
      className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent"
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
    <div className="flex items-center justify-center gap-2 pb-2 border-b border-slate-100">
      <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full">
        Image {batchProgress.current} of {batchProgress.total}
      </span>
    </div>
  );
};

const StageIndicator: React.FC<{ stageMessage: string }> = ({ stageMessage }) => (
  <div className="flex items-center gap-3">
    <div className="relative">
      <Loader2 size={20} className="text-indigo-600 animate-spin" />
      <div className="absolute inset-0 rounded-full border-2 border-indigo-300 animate-ping opacity-30" />
    </div>
    <span className="text-sm font-medium text-slate-900">{stageMessage}</span>
  </div>
);

const ProgressBar: React.FC<{
  progress: number;
  isEnhancing: boolean;
  estimatedRemaining: number;
}> = ({ progress, isEnhancing, estimatedRemaining }) => (
  <div className="space-y-2">
    <div className="flex justify-between text-xs text-slate-500">
      <span>{Math.round(progress)}%</span>
      {isEnhancing && estimatedRemaining > 0 && <span>~{estimatedRemaining}s remaining</span>}
    </div>
    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden relative">
      <div
        className="h-full bg-indigo-600 transition-all duration-300 relative overflow-hidden"
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
        className="w-2 h-2 bg-indigo-500 rounded-full"
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
  const descriptions: Record<ProcessingStage, string> = {
    [ProcessingStage.PREPARING]: 'Encoding and validating your image',
    [ProcessingStage.ANALYZING]: 'AI is analyzing image quality',
    [ProcessingStage.ENHANCING]: 'AI model is enhancing your image',
    [ProcessingStage.FINALIZING]: 'Preparing your enhanced image',
  };

  return <p className="text-xs text-slate-400 text-center">{descriptions[stage]}</p>;
};

const ErrorOverlay: React.FC<{
  item: IBatchItem;
  onRetry: (item: IBatchItem) => void;
}> = ({ item, onRetry }) => (
  <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center">
    <div className="bg-white p-6 rounded-xl shadow-xl border border-red-100 text-center max-w-md">
      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
        <AlertTriangle size={24} />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">Processing Failed</h3>
      <p className="text-slate-600 mb-4">{item.error}</p>
      <Button size="sm" onClick={() => onRetry(item)}>
        Try Again
      </Button>
    </div>
  </div>
);

// Estimated processing times by model (in seconds)
const MODEL_PROCESSING_TIMES: Record<string, number> = {
  'real-esrgan': 15,
  gfpgan: 20,
  'nano-banana': 25,
  'clarity-upscaler': 30,
  'nano-banana-pro': 45,
  auto: 35, // Average
};

const STAGE_MESSAGES: Record<ProcessingStage, string> = {
  [ProcessingStage.PREPARING]: 'Preparing image...',
  [ProcessingStage.ANALYZING]: 'Analyzing image...',
  [ProcessingStage.ENHANCING]: 'Enhancing image...',
  [ProcessingStage.FINALIZING]: 'Finalizing...',
};

interface IBatchProgress {
  current: number;
  total: number;
}

interface IPreviewAreaProps {
  activeItem: IBatchItem | null;
  onDownload: (url: string, filename: string) => void;
  onRetry: (item: IBatchItem) => void;
  selectedModel?: string; // For time estimation
  batchProgress?: IBatchProgress | null;
  isProcessingBatch?: boolean;
}

export const PreviewArea: React.FC<IPreviewAreaProps> = ({
  activeItem,
  onDownload,
  onRetry,
  selectedModel = 'auto',
  batchProgress,
  isProcessingBatch = false,
}) => {
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
      <div className="text-slate-400 flex flex-col items-center">
        <Layers size={48} className="mb-4 opacity-50" />
        <p>Select an image from the queue below</p>
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
      <div className="w-full h-[65vh] min-h-[400px] flex flex-col">
        <div className="mb-4 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-sm font-medium text-slate-900">{activeItem.file.name}</h3>
            <span className="text-xs text-green-600 flex items-center gap-1">
              <Check size={12} /> Processing Complete
            </span>
          </div>
        </div>
        <div className="flex-grow relative min-h-0">
          <ImageComparison
            beforeUrl={activeItem.previewUrl}
            afterUrl={activeItem.processedUrl}
            onDownload={() => onDownload(activeItem.processedUrl!, activeItem.file.name)}
          />

          {/* Waiting for next batch item overlay */}
          {isWaitingForNextBatchItem && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-xl z-10">
              <div className="bg-white p-6 rounded-xl shadow-2xl border border-slate-100 text-center max-w-sm">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full">
                    Image {batchProgress.current} of {batchProgress.total} complete
                  </span>
                </div>

                <div className="flex items-center justify-center gap-3 mb-4">
                  <Loader2 size={20} className="text-indigo-600 animate-spin" />
                  <span className="text-sm font-medium text-slate-900">
                    Preparing next image...
                  </span>
                </div>

                {/* Processing indicator dots */}
                <div className="flex justify-center gap-1.5">
                  <span
                    className="w-2 h-2 bg-indigo-500 rounded-full"
                    style={{
                      animation: 'pulse-dot 1.4s ease-in-out infinite',
                      animationDelay: '0ms',
                    }}
                  />
                  <span
                    className="w-2 h-2 bg-indigo-500 rounded-full"
                    style={{
                      animation: 'pulse-dot 1.4s ease-in-out infinite',
                      animationDelay: '200ms',
                    }}
                  />
                  <span
                    className="w-2 h-2 bg-indigo-500 rounded-full"
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

                <p className="text-xs text-slate-400 mt-4">
                  Rate limiting pause to ensure reliable processing
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
  const stageMessage = activeItem.stage ? STAGE_MESSAGES[activeItem.stage] : 'Processing...';
  const isEnhancing = activeItem.stage === ProcessingStage.ENHANCING;

  return (
    <div className="relative w-full h-[65vh] min-h-[400px] max-w-5xl mx-auto bg-slate-100 rounded-xl border border-slate-200 overflow-hidden flex items-center justify-center">
      <img
        src={activeItem.previewUrl}
        alt={`Preview of ${activeItem.file.name}`}
        className="max-h-full max-w-full object-contain"
        loading="eager"
        decoding="async"
      />

      {/* Processing Overlay */}
      {activeItem.status === ProcessingStatus.PROCESSING && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center">
          {/* Scanning line animation during analyzing */}
          {activeItem.stage === ProcessingStage.ANALYZING && <ScanningLineAnimation />}

          <div className="w-72 space-y-4 p-6 bg-white rounded-xl shadow-2xl border border-slate-100">
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
