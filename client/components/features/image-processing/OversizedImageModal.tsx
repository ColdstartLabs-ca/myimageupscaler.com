'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { AlertCircle, Sparkles, Zap, ArrowRight, Loader2 } from 'lucide-react';
import { Modal } from '@client/components/ui/Modal';
import { useTranslations } from 'next-intl';
import { compressImage, formatBytes } from '@client/utils/image-compression';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';

/** LocalStorage key for auto-resize preference */
export const AUTO_RESIZE_STORAGE_KEY = 'image-upscaler-auto-resize';

/** Check if auto-resize preference is enabled (defaults to true) */
export function isAutoResizeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(AUTO_RESIZE_STORAGE_KEY);
  return stored === null ? true : stored === 'true';
}

/** Set auto-resize preference */
export function setAutoResizePreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTO_RESIZE_STORAGE_KEY, String(enabled));
}

// Extracted Components
const WarningBanner: React.FC<{
  fileSize: number;
  currentLimit: number;
  isPaidLimit: boolean;
  dimensions?: { width: number; height: number; pixels: number };
}> = ({ fileSize, currentLimit, isPaidLimit, dimensions }) => {
  const t = useTranslations('workspace');
  const limitMB = currentLimit / (1024 * 1024);
  const fileSizeMB = fileSize / (1024 * 1024);
  const excessMB = fileSizeMB - limitMB;

  // If we have dimension info, show pixel-based warning instead
  if (dimensions) {
    const maxPixelsMP = (IMAGE_VALIDATION.MAX_PIXELS / 1_000_000).toFixed(0);
    const imagePixelsMP = (dimensions.pixels / 1_000_000).toFixed(1);
    const excessPixels = dimensions.pixels - IMAGE_VALIDATION.MAX_PIXELS;
    const excessPixelsMP = (excessPixels / 1_000_000).toFixed(1);

    return (
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-900">
            {t('oversizedImage.yourImageIs')}{' '}
            <span className="font-bold">
              {dimensions.width}x{dimensions.height}
            </span>{' '}
            ({imagePixelsMP}MP), {t('oversizedImage.whichExceeds')}{' '}
            <span className="font-bold">{maxPixelsMP}MP</span> {t('oversizedImage.limitBy')}{' '}
            <span className="font-bold">{excessPixelsMP}MP</span>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-900">
          {t('oversizedImage.yourImageIs')}{' '}
          <span className="font-bold">{formatBytes(fileSize)}</span>,{' '}
          {t('oversizedImage.whichExceeds')}{' '}
          <span className="font-bold">
            {formatBytes(currentLimit)} {isPaidLimit ? 'Pro' : 'free tier'}
          </span>{' '}
          {t('oversizedImage.limitBy')} <span className="font-bold">{excessMB.toFixed(1)}MB</span>.
        </p>
      </div>
    </div>
  );
};

const ImagePreview: React.FC<{ file: File; previewUrl: string }> = ({ file, previewUrl }) => (
  <div className="relative rounded-xl overflow-hidden bg-surface-light border border-border">
    <Image
      src={previewUrl}
      alt={file.name}
      width={600}
      height={400}
      className="w-full h-auto max-h-64 object-contain"
      unoptimized
    />
    <div className="absolute bottom-3 left-3 bg-black/70 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
      {file.name}
    </div>
  </div>
);

const ErrorMessage: React.FC<{ error: string | null }> = ({ error }) => {
  if (!error) return null;
  return (
    <div className="p-4 bg-error/10 border border-error/20 rounded-xl text-sm text-error">
      {error}
    </div>
  );
};

const CompressingDots: React.FC = () => (
  <span className="inline-flex">
    <span className="animate-bounce" style={{ animationDelay: '0ms' }}>
      .
    </span>
    <span className="animate-bounce" style={{ animationDelay: '150ms' }}>
      .
    </span>
    <span className="animate-bounce" style={{ animationDelay: '300ms' }}>
      .
    </span>
  </span>
);

const ResizeButton: React.FC<{
  onClick: () => void;
  isCompressing: boolean;
  currentLimit: number;
  progress: number;
  dimensions?: { width: number; height: number; pixels: number };
}> = ({ onClick, isCompressing, currentLimit, progress, dimensions }) => {
  const t = useTranslations('workspace');

  const getDescription = () => {
    if (isCompressing) {
      return t('oversizedImage.optimizingQuality');
    }
    if (dimensions) {
      const maxPixelsMP = (IMAGE_VALIDATION.MAX_PIXELS / 1_000_000).toFixed(0);
      return t('oversizedImage.autoResizeToPixelLimit', { maxPixels: maxPixelsMP });
    }
    return `${t('oversizedImage.automaticallyCompress')}${formatBytes(currentLimit)}${t('oversizedImage.limitBy')}`;
  };

  return (
    <button
      onClick={onClick}
      disabled={isCompressing}
      className="w-full flex flex-col p-4 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-2 border-blue-200 hover:border-blue-300 rounded-xl transition-all group disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden relative"
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg text-white group-hover:scale-110 transition-transform">
            {isCompressing ? <Loader2 size={20} className="animate-spin" /> : <Zap size={20} />}
          </div>
          <div className="text-left">
            <p className="font-bold text-primary">
              {isCompressing ? (
                <span className="inline-flex items-center gap-2">
                  {t('oversizedImage.compressing')}
                  <CompressingDots />
                </span>
              ) : (
                t('oversizedImage.resizeAndContinue')
              )}
            </p>
            <p className="text-sm text-muted-foreground">{getDescription()}</p>
          </div>
        </div>
        {!isCompressing && (
          <ArrowRight className="w-5 h-5 text-blue-600 group-hover:translate-x-1 transition-transform" />
        )}
      </div>

      {/* Progress Bar */}
      {isCompressing && (
        <div className="w-full mt-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{t('oversizedImage.processingImage')}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-2 bg-surface-light rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-100 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </button>
  );
};

const UpgradeOption: React.FC<{ isPaidLimit: boolean; onUpgrade?: () => void }> = ({
  isPaidLimit,
  onUpgrade,
}) => {
  const t = useTranslations('workspace');
  if (isPaidLimit) return null;

  return (
    <button
      onClick={onUpgrade}
      className="block w-full flex flex-col p-4 bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 border-2 border-purple-200 hover:border-purple-300 rounded-xl transition-all group text-left"
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-white group-hover:scale-110 transition-transform">
            <Sparkles size={20} />
          </div>
          <div className="text-left">
            <p className="font-bold text-primary">{t('oversizedImage.upgradeToPro')}</p>
            <p className="text-sm text-muted-foreground">
              {t('oversizedImage.upgradeToProDescription')}
            </p>
          </div>
        </div>
        <ArrowRight className="w-5 h-5 text-purple-600 group-hover:translate-x-1 transition-transform" />
      </div>
    </button>
  );
};

const AutoResizeToggle: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ checked, onChange }) => {
  const t = useTranslations('workspace');

  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="sr-only peer"
          aria-label={t('oversizedImage.autoResizeToggle')}
        />
        <div className="w-5 h-5 border-2 border-border rounded bg-surface-light peer-checked:bg-accent peer-checked:border-accent transition-colors flex items-center justify-center">
          {checked && (
            <svg
              className="w-3 h-3 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
      <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
        {t('oversizedImage.autoResizeToggle')}
      </span>
    </label>
  );
};

export interface IOversizedImageModalProps {
  file: File;
  isOpen: boolean;
  onClose: () => void;
  onResizeAndContinue: (resizedFile: File) => void;
  currentLimit: number;
  currentIndex?: number;
  totalCount?: number;
  /** Optional dimension info for pixel-oversized images */
  dimensions?: { width: number; height: number; pixels: number };
  onUpgrade?: () => void;
}

export const OversizedImageModal: React.FC<IOversizedImageModalProps> = ({
  file,
  isOpen,
  onClose,
  onResizeAndContinue,
  currentLimit,
  currentIndex = 0,
  totalCount = 1,
  dimensions,
  onUpgrade,
}) => {
  const t = useTranslations('workspace');
  const [isCompressing, setIsCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [autoResizeChecked, setAutoResizeChecked] = useState(false);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef(progress);

  // Load auto-resize preference on mount
  useEffect(() => {
    if (isOpen) {
      setAutoResizeChecked(isAutoResizeEnabled());
    }
  }, [isOpen]);

  // Keep ref in sync with state
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // Simulated progress animation - fills to ~90% over time, completes on finish
  useEffect(() => {
    if (isCompressing) {
      setProgress(0);
      const startTime = Date.now();
      const duration = 8000; // 8 seconds to reach ~90%

      progressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        // Ease-out curve that approaches but never quite reaches 90%
        const newProgress = Math.min(90, 90 * (1 - Math.exp(-elapsed / (duration / 3))));
        setProgress(newProgress);
      }, 50);
    } else {
      // Clear interval and complete progress
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (progressRef.current > 0) {
        setProgress(100);
        // Reset after animation completes
        const timeout = setTimeout(() => setProgress(0), 300);
        return () => clearTimeout(timeout);
      }
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isCompressing]);

  const previewUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  const handleResize = async () => {
    setIsCompressing(true);
    setError(null);

    try {
      // For dimension-oversized images, resize to fit within pixel limit
      // For byte-size oversized images, compress to fit within byte limit
      const result = await compressImage(file, {
        targetSizeBytes: dimensions ? undefined : Math.floor(currentLimit * 0.9),
        maxPixels: dimensions ? IMAGE_VALIDATION.MAX_PIXELS : undefined,
        format: 'jpeg', // JPEG typically gives best compression for photos
        maintainAspectRatio: true,
      });

      // Convert blob to File
      const resizedFile = new File([result.blob], file.name.replace(/\.\w+$/, '.jpg'), {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });

      // onResizeAndContinue handles advancing to next file or closing modal
      onResizeAndContinue(resizedFile);
    } catch (err) {
      console.error('Compression error:', err);
      setError(t('oversizedImage.processingFailed'));
    } finally {
      setIsCompressing(false);
    }
  };

  const handleAutoResizeToggle = useCallback((checked: boolean) => {
    setAutoResizeChecked(checked);
    setAutoResizePreference(checked);
  }, []);

  const isPaidLimit = currentLimit === IMAGE_VALIDATION.MAX_SIZE_PAID;

  const showMultipleIndicator = totalCount > 1;
  const modalTitle = showMultipleIndicator
    ? `${t('oversizedImage.imageTooLarge')} (${currentIndex + 1} of ${totalCount})`
    : t('oversizedImage.imageTooLarge');

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" title={modalTitle}>
      <div className="space-y-6">
        {/* Warning Banner */}
        <WarningBanner
          fileSize={file.size}
          currentLimit={currentLimit}
          isPaidLimit={isPaidLimit}
          dimensions={dimensions}
        />

        {/* Image Preview */}
        {previewUrl && <ImagePreview file={file} previewUrl={previewUrl} />}

        {/* Error Message */}
        <ErrorMessage error={error} />

        {/* Auto-Resize Toggle */}
        <AutoResizeToggle checked={autoResizeChecked} onChange={handleAutoResizeToggle} />

        {/* Options */}
        <div className="space-y-3">
          {/* Option 1: Resize & Continue */}
          <ResizeButton
            onClick={handleResize}
            isCompressing={isCompressing}
            currentLimit={currentLimit}
            progress={progress}
            dimensions={dimensions}
          />

          {/* Option 2: Upgrade to Pro (only if not already on paid plan and not dimension-based) */}
          {!dimensions && <UpgradeOption isPaidLimit={isPaidLimit} onUpgrade={onUpgrade} />}

          {/* Option 3: Skip/Cancel */}
          <button
            onClick={onClose}
            disabled={isCompressing}
            className="w-full p-4 border-2 border-border hover:border-border hover:bg-surface rounded-xl transition-all text-muted-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {showMultipleIndicator
              ? t('oversizedImage.skipThisImage')
              : t('oversizedImage.useDifferentImage')}
          </button>
        </div>

        {/* Info Footer */}
        <div className="p-4 bg-surface rounded-xl text-xs text-muted-foreground">
          <p className="font-medium mb-2">{t('oversizedImage.whatHappens')}</p>
          <ul className="space-y-1 ml-4 list-disc">
            <li>{t('oversizedImage.imageCompressed')}</li>
            <li>{t('oversizedImage.qualityOptimized')}</li>
            <li>{t('oversizedImage.processingInstantly')}</li>
            <li>{t('oversizedImage.aspectRatioMaintained')}</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
};
