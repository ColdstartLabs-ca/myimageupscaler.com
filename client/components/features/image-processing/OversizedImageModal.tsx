'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AlertCircle, Sparkles, Zap, ArrowRight, Loader2 } from 'lucide-react';
import { Modal } from '@client/components/ui/Modal';
import { compressImage, formatBytes } from '@client/utils/image-compression';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';

// Extracted Components
const WarningBanner: React.FC<{ fileSize: number; currentLimit: number; isPaidLimit: boolean }> = ({
  fileSize,
  currentLimit,
  isPaidLimit,
}) => {
  const limitMB = currentLimit / (1024 * 1024);
  const fileSizeMB = fileSize / (1024 * 1024);
  const excessMB = fileSizeMB - limitMB;

  return (
    <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-900">
          Your image is <span className="font-bold">{formatBytes(fileSize)}</span>, which exceeds
          the{' '}
          <span className="font-bold">
            {formatBytes(currentLimit)} {isPaidLimit ? 'Pro' : 'free tier'}
          </span>{' '}
          limit by <span className="font-bold">{excessMB.toFixed(1)}MB</span>.
        </p>
      </div>
    </div>
  );
};

const ImagePreview: React.FC<{ file: File; previewUrl: string }> = ({ file, previewUrl }) => (
  <div className="relative rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
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
    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
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
}> = ({ onClick, isCompressing, currentLimit, progress }) => (
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
          <p className="font-bold text-slate-900">
            {isCompressing ? (
              <span className="inline-flex items-center gap-2">
                Compressing
                <CompressingDots />
              </span>
            ) : (
              'Resize & Continue'
            )}
          </p>
          <p className="text-sm text-slate-600">
            {isCompressing
              ? 'Optimizing quality while reducing file size...'
              : `Automatically compress to fit under ${formatBytes(currentLimit)} and proceed`}
          </p>
        </div>
      </div>
      {!isCompressing && (
        <ArrowRight className="w-5 h-5 text-blue-600 group-hover:translate-x-1 transition-transform" />
      )}
    </div>

    {/* Progress Bar */}
    {isCompressing && (
      <div className="w-full mt-3">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>Processing image...</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-100 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    )}
  </button>
);

const UpgradeOption: React.FC<{ isPaidLimit: boolean }> = ({ isPaidLimit }) => {
  if (isPaidLimit) return null;

  return (
    <Link
      href="/pricing"
      className="block w-full flex flex-col p-4 bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 border-2 border-purple-200 hover:border-purple-300 rounded-xl transition-all group"
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-white group-hover:scale-110 transition-transform">
            <Sparkles size={20} />
          </div>
          <div className="text-left">
            <p className="font-bold text-slate-900">Upgrade to Pro</p>
            <p className="text-sm text-slate-600">Upload images up to 50MB with full resolution</p>
          </div>
        </div>
        <ArrowRight className="w-5 h-5 text-purple-600 group-hover:translate-x-1 transition-transform" />
      </div>
    </Link>
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
}

export const OversizedImageModal: React.FC<IOversizedImageModalProps> = ({
  file,
  isOpen,
  onClose,
  onResizeAndContinue,
  currentLimit,
  currentIndex = 0,
  totalCount = 1,
}) => {
  const [isCompressing, setIsCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef(progress);

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
      // Target 90% of the limit to ensure we're safely under
      const targetSize = Math.floor(currentLimit * 0.9);

      const result = await compressImage(file, {
        targetSizeBytes: targetSize,
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
      setError('Failed to compress image. Please try a smaller file or upgrade to Pro.');
    } finally {
      setIsCompressing(false);
    }
  };

  const isPaidLimit = currentLimit === IMAGE_VALIDATION.MAX_SIZE_PAID;

  const showMultipleIndicator = totalCount > 1;
  const modalTitle = showMultipleIndicator
    ? `Image Too Large (${currentIndex + 1} of ${totalCount})`
    : 'Image Too Large';

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" title={modalTitle}>
      <div className="space-y-6">
        {/* Warning Banner */}
        <WarningBanner fileSize={file.size} currentLimit={currentLimit} isPaidLimit={isPaidLimit} />

        {/* Image Preview */}
        {previewUrl && <ImagePreview file={file} previewUrl={previewUrl} />}

        {/* Error Message */}
        <ErrorMessage error={error} />

        {/* Options */}
        <div className="space-y-3">
          {/* Option 1: Resize & Continue */}
          <ResizeButton
            onClick={handleResize}
            isCompressing={isCompressing}
            currentLimit={currentLimit}
            progress={progress}
          />

          {/* Option 2: Upgrade to Pro (only if not already on paid plan) */}
          <UpgradeOption isPaidLimit={isPaidLimit} />

          {/* Option 3: Skip/Cancel */}
          <button
            onClick={onClose}
            disabled={isCompressing}
            className="w-full p-4 border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all text-slate-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {showMultipleIndicator ? 'Skip This Image' : 'Use a Different Image'}
          </button>
        </div>

        {/* Info Footer */}
        <div className="p-4 bg-slate-50 rounded-xl text-xs text-slate-600">
          <p className="font-medium mb-2">💡 What happens when you resize?</p>
          <ul className="space-y-1 ml-4 list-disc">
            <li>Image is compressed to fit under the size limit</li>
            <li>Quality is automatically optimized for best results</li>
            <li>Processing happens instantly in your browser</li>
            <li>Original aspect ratio is maintained</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
};
