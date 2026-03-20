'use client';

import { AlertCircle, FileUp, UploadCloud, Loader2, Sparkles } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useUserData } from '@client/store/userStore';
import { useToastStore } from '@client/store/toastStore';
import { analytics } from '@client/analytics';
import { processFilesAsync, IDimensionInfo } from '@client/utils/file-validation';
import { compressImage } from '@client/utils/image-compression';
import { OversizedImageModal, isAutoResizeEnabled } from './OversizedImageModal';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';

interface IDropzoneProps {
  onFilesSelected: (files: File[], source?: 'drag_drop' | 'file_picker') => void;
  disabled?: boolean;
  compact?: boolean; // Prop to render a smaller version if needed
  children?: React.ReactNode;
  className?: string;
  onUpgrade?: () => void;
}

// Union type for oversized files that can be either byte-size or dimension oversized
interface IOversizedFileEntry {
  file: File;
  dimensions?: IDimensionInfo; // Present only for dimension-oversized files
  reason: 'size' | 'dimensions';
}

export const Dropzone: React.FC<IDropzoneProps> = ({
  onFilesSelected,
  disabled,
  compact = false,
  children,
  className = '',
  onUpgrade,
}) => {
  const t = useTranslations('workspace');
  const { showToast } = useToastStore();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [showOversizedModal, setShowOversizedModal] = useState(false);
  const [oversizedFiles, setOversizedFiles] = useState<IOversizedFileEntry[]>([]);
  const [currentOversizedIndex, setCurrentOversizedIndex] = useState(0);
  // Store valid files to add after all oversized files are handled
  const [pendingValidFiles, setPendingValidFiles] = useState<File[]>([]);
  // Store resized files as they are processed
  const [resizedFiles, setResizedFiles] = useState<File[]>([]);
  // Store the upload source for the current batch (drag_drop or file_picker)
  const [pendingSource, setPendingSource] = useState<'drag_drop' | 'file_picker'>('file_picker');
  const { subscription, isFreeUser } = useUserData();
  const isPaidUser = !!subscription?.price_id;
  const currentLimit = isPaidUser ? IMAGE_VALIDATION.MAX_SIZE_PAID : IMAGE_VALIDATION.MAX_SIZE_FREE;

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (disabled) return;
      setIsDragging(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFilesReceived = useCallback(
    async (files: File[], source: 'drag_drop' | 'file_picker' = 'file_picker') => {
      setIsValidating(true);
      setError(null);

      try {
        const {
          validFiles,
          oversizedFiles: oversizedBySize,
          oversizedDimensionFiles,
          invalidTypeFiles,
        } = await processFilesAsync(files, isPaidUser);

        // Check if auto-resize is enabled
        const autoResize = isAutoResizeEnabled();

        // Auto-resize dimension-oversized files
        let autoResizedFiles: File[] = [];
        let dimensionFilesNeedingModal = oversizedDimensionFiles;

        if (autoResize && oversizedDimensionFiles.length > 0) {
          const resizePromises = oversizedDimensionFiles.map(async ({ file }) => {
            try {
              const result = await compressImage(file, {
                maxPixels: IMAGE_VALIDATION.MAX_PIXELS,
                format: 'jpeg',
                maintainAspectRatio: true,
              });
              return new File([result.blob], file.name.replace(/\.\w+$/, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
            } catch {
              return null;
            }
          });

          const resizeResults = await Promise.all(resizePromises);
          autoResizedFiles = resizeResults.filter((f): f is File => f !== null);
          dimensionFilesNeedingModal = oversizedDimensionFiles.filter(
            (_, index) => resizeResults[index] === null
          );
        }

        // Auto-compress size-oversized files
        let sizeFilesNeedingModal = oversizedBySize;

        if (autoResize && oversizedBySize.length > 0) {
          const compressPromises = oversizedBySize.map(async file => {
            try {
              const result = await compressImage(file, {
                targetSizeBytes: Math.floor(currentLimit * 0.9),
                format: 'jpeg',
                maintainAspectRatio: true,
              });
              return new File([result.blob], file.name.replace(/\.\w+$/, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
            } catch {
              return null;
            }
          });

          const compressResults = await Promise.all(compressPromises);
          const autoCompressedFiles = compressResults.filter((f): f is File => f !== null);
          autoResizedFiles = [...autoResizedFiles, ...autoCompressedFiles];
          sizeFilesNeedingModal = oversizedBySize.filter(
            (_, index) => compressResults[index] === null
          );
        }

        // Show toast if any files were auto-resized
        if (autoResize && autoResizedFiles.length > 0) {
          showToast({
            message: t('oversizedImage.autoResizeToast'),
            type: 'info',
            duration: 3000,
          });
        }

        // Combine remaining oversized files into a unified list for the modal
        const oversizedEntries: IOversizedFileEntry[] = [
          ...sizeFilesNeedingModal.map(file => ({ file, reason: 'size' as const })),
          ...dimensionFilesNeedingModal.map(({ file, dimensions }) => ({
            file,
            dimensions,
            reason: 'dimensions' as const,
          })),
        ];

        if (oversizedEntries.length > 0) {
          // Store all oversized files and show modal for the first one
          // Hold valid files until oversized files are handled (prevents Dropzone unmounting)
          setOversizedFiles(oversizedEntries);
          setCurrentOversizedIndex(0);
          setPendingValidFiles([...validFiles, ...autoResizedFiles]);
          setPendingSource(source);
          setResizedFiles([]);
          setShowOversizedModal(true);
          setError(null);

          // Track validation errors for oversized files
          oversizedEntries.forEach(entry => {
            analytics.track('error_occurred', {
              errorType: 'validation_failed',
              errorMessage:
                entry.reason === 'size'
                  ? 'File size exceeds limit'
                  : `Image dimensions exceed ${IMAGE_VALIDATION.MAX_PIXELS / 1_000_000}MP limit`,
              context: {
                fileName: entry.file.name,
                fileSize: entry.file.size,
                rejectionReason: entry.reason === 'size' ? 'file_size_limit' : 'dimension_limit',
                ...(entry.dimensions
                  ? {
                      width: entry.dimensions.width,
                      height: entry.dimensions.height,
                      pixels: entry.dimensions.pixels,
                    }
                  : {}),
              },
            });
          });
        } else {
          // No oversized files, add valid files immediately (including auto-resized)
          const allValidFiles = [...validFiles, ...autoResizedFiles];
          // Only show error for files that are still rejected (invalid type).
          // Don't use errorMessage from processFilesAsync since auto-resize may have
          // resolved dimension/size issues that were counted as rejections.
          if (invalidTypeFiles.length > 0) {
            setError('Some files were rejected. Only JPG, PNG, WEBP are allowed.');

            // Track validation errors for analytics
            invalidTypeFiles.forEach(file => {
              analytics.track('error_occurred', {
                errorType: 'validation_failed',
                errorMessage: 'Invalid file type - only JPG, PNG, WEBP allowed',
                context: {
                  fileName: file.name,
                  fileSize: file.size,
                  fileType: file.type,
                  rejectionReason: 'invalid_type',
                },
              });
            });
          } else {
            setError(null);
          }
          if (allValidFiles.length > 0) {
            onFilesSelected(allValidFiles, source);
          }
        }
      } catch (err) {
        console.error('Error processing files:', err);
        setError('Failed to process files. Please try again.');
      } finally {
        setIsValidating(false);
      }
    },
    [isPaidUser, currentLimit, onFilesSelected, showToast, t]
  );

  const finishOversizedHandling = useCallback(
    (finalResizedFiles: File[]) => {
      // Combine pending valid files with all resized files and submit together
      const allFiles = [...pendingValidFiles, ...finalResizedFiles];
      if (allFiles.length > 0) {
        onFilesSelected(allFiles, pendingSource);
      }
      // Reset all state
      setShowOversizedModal(false);
      setOversizedFiles([]);
      setCurrentOversizedIndex(0);
      setPendingValidFiles([]);
      setResizedFiles([]);
    },
    [onFilesSelected, pendingValidFiles, pendingSource]
  );

  const handleResizeAndContinue = useCallback(
    (resizedFile: File) => {
      const newResizedFiles = [...resizedFiles, resizedFile];

      // Move to next oversized file if there are more
      if (currentOversizedIndex < oversizedFiles.length - 1) {
        setResizedFiles(newResizedFiles);
        setCurrentOversizedIndex(prev => prev + 1);
      } else {
        // All oversized files handled, submit all files together
        finishOversizedHandling(newResizedFiles);
      }
    },
    [currentOversizedIndex, oversizedFiles.length, resizedFiles, finishOversizedHandling]
  );

  const handleSkipOversized = useCallback(() => {
    // Skip current file and move to next
    if (currentOversizedIndex < oversizedFiles.length - 1) {
      setCurrentOversizedIndex(prev => prev + 1);
    } else {
      // All oversized files handled, submit all files together
      finishOversizedHandling(resizedFiles);
    }
  }, [currentOversizedIndex, oversizedFiles.length, resizedFiles, finishOversizedHandling]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      handleFilesReceived(Array.from(e.dataTransfer.files), 'drag_drop');
    },
    [disabled, handleFilesReceived]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFilesReceived(Array.from(e.target.files || []), 'file_picker');
    },
    [handleFilesReceived]
  );

  return (
    <div
      data-testid="dropzone"
      data-driver="upload-zone"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative group cursor-pointer transition-all duration-300 ease-out
        ${className}
        ${!children && (compact ? 'p-4' : 'p-12')}
        ${
          isDragging
            ? 'bg-accent/10 border-accent scale-[1.02] shadow-xl ring-4 ring-accent/20'
            : 'bg-surface-light/50 hover:bg-surface-light border-border hover:border-accent/50 hover:shadow-lg hover:shadow-accent/10'
        }
        border-2 border-dashed rounded-3xl
        ${disabled ? 'opacity-60 cursor-not-allowed grayscale' : ''}
      `}
    >
      <input
        type="file"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
        onChange={handleFileInput}
        accept="image/jpeg, image/png, image/webp"
        multiple
        disabled={disabled}
        aria-label={t('dropzone.clickOrDragImages')}
      />

      {children ? (
        children
      ) : (
        <div className="flex flex-col items-center justify-center text-center space-y-4 pointer-events-none select-none">
          {/* Icon Container */}
          <div
            className={`
          relative flex items-center justify-center rounded-2xl transition-all duration-300
          ${isDragging ? 'bg-accent text-white shadow-lg scale-110' : 'bg-surface text-accent shadow-sm ring-1 ring-white/5 group-hover:scale-110 group-hover:text-accent'}
          ${compact ? 'w-12 h-12' : 'w-20 h-20'}
        `}
          >
            {isValidating ? (
              <Loader2 size={compact ? 24 : 40} className="animate-spin" />
            ) : isDragging ? (
              <FileUp size={compact ? 24 : 40} className="animate-bounce" />
            ) : (
              <UploadCloud size={compact ? 24 : 40} strokeWidth={1.5} />
            )}

            {/* Decorative background blob behind icon */}
            {!isDragging && !isValidating && !compact && (
              <div className="absolute -inset-4 bg-accent/10 rounded-full blur-xl -z-10 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>

          {!compact && (
            <div className="space-y-2 max-w-xs mx-auto">
              <h3
                className={`font-bold text-white transition-colors ${isDragging ? 'text-accent' : 'group-hover:text-accent'} text-xl`}
              >
                {isDragging ? t('dropzone.dropToUpload') : t('dropzone.clickOrDragImages')}
              </h3>
              <p className="text-muted-foreground text-sm font-medium leading-relaxed">
                {t('dropzone.supportForFormats')}
                <span className="block text-xs text-muted-foreground mt-1 font-normal">
                  {isPaidUser ? t('dropzone.paidLimitText') : t('dropzone.freeLimitText')}
                </span>
              </p>
              {isFreeUser && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onUpgrade?.();
                  }}
                  className="relative z-20 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent/80 transition-colors pointer-events-auto"
                >
                  <Sparkles size={12} />
                  Upgrade for HD quality &amp; larger files
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="absolute inset-x-0 -bottom-16 flex items-center justify-center">
          <div className="bg-error/20 text-error text-sm font-medium px-4 py-2 rounded-full shadow-sm border border-error/20 flex items-center animate-fade-in-up">
            <AlertCircle size={16} className="mr-2" />
            {error}
          </div>
        </div>
      )}

      {/* Oversized Image Modal */}
      {oversizedFiles.length > 0 && oversizedFiles[currentOversizedIndex] && (
        <OversizedImageModal
          file={oversizedFiles[currentOversizedIndex].file}
          isOpen={showOversizedModal}
          onClose={handleSkipOversized}
          onResizeAndContinue={handleResizeAndContinue}
          currentLimit={currentLimit}
          currentIndex={currentOversizedIndex}
          totalCount={oversizedFiles.length}
          dimensions={oversizedFiles[currentOversizedIndex].dimensions}
          onUpgrade={onUpgrade}
        />
      )}
    </div>
  );
};
