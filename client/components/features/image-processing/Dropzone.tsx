'use client';

import { AlertCircle, FileUp, UploadCloud } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useUserData } from '@client/store/userStore';
import { processFiles } from '@client/utils/file-validation';
import { OversizedImageModal } from './OversizedImageModal';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';

interface IDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  compact?: boolean; // Prop to render a smaller version if needed
  children?: React.ReactNode;
  className?: string;
}

export const Dropzone: React.FC<IDropzoneProps> = ({
  onFilesSelected,
  disabled,
  compact = false,
  children,
  className = '',
}) => {
  const t = useTranslations('workspace');
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOversizedModal, setShowOversizedModal] = useState(false);
  const [oversizedFiles, setOversizedFiles] = useState<File[]>([]);
  const [currentOversizedIndex, setCurrentOversizedIndex] = useState(0);
  // Store valid files to add after all oversized files are handled
  const [pendingValidFiles, setPendingValidFiles] = useState<File[]>([]);
  // Store resized files as they are processed
  const [resizedFiles, setResizedFiles] = useState<File[]>([]);
  const { subscription } = useUserData();
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
    (files: File[]) => {
      const {
        validFiles,
        oversizedFiles: oversized,
        errorMessage,
      } = processFiles(files, isPaidUser);

      if (oversized.length > 0) {
        // Store all oversized files and show modal for the first one
        // Hold valid files until oversized files are handled (prevents Dropzone unmounting)
        setOversizedFiles(oversized);
        setCurrentOversizedIndex(0);
        setPendingValidFiles(validFiles);
        setResizedFiles([]);
        setShowOversizedModal(true);
        setError(null);
      } else {
        // No oversized files, add valid files immediately
        if (errorMessage) {
          setError(errorMessage);
        } else {
          setError(null);
        }
        if (validFiles.length > 0) {
          onFilesSelected(validFiles);
        }
      }
    },
    [isPaidUser, onFilesSelected]
  );

  const finishOversizedHandling = useCallback(
    (finalResizedFiles: File[]) => {
      // Combine pending valid files with all resized files and submit together
      const allFiles = [...pendingValidFiles, ...finalResizedFiles];
      if (allFiles.length > 0) {
        onFilesSelected(allFiles);
      }
      // Reset all state
      setShowOversizedModal(false);
      setOversizedFiles([]);
      setCurrentOversizedIndex(0);
      setPendingValidFiles([]);
      setResizedFiles([]);
    },
    [onFilesSelected, pendingValidFiles]
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
      handleFilesReceived(Array.from(e.dataTransfer.files));
    },
    [disabled, handleFilesReceived]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFilesReceived(Array.from(e.target.files || []));
    },
    [handleFilesReceived]
  );

  return (
    <div
      data-testid="dropzone"
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
            {isDragging ? (
              <FileUp size={compact ? 24 : 40} className="animate-bounce" />
            ) : (
              <UploadCloud size={compact ? 24 : 40} strokeWidth={1.5} />
            )}

            {/* Decorative background blob behind icon */}
            {!isDragging && !compact && (
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
          file={oversizedFiles[currentOversizedIndex]}
          isOpen={showOversizedModal}
          onClose={handleSkipOversized}
          onResizeAndContinue={handleResizeAndContinue}
          currentLimit={currentLimit}
          currentIndex={currentOversizedIndex}
          totalCount={oversizedFiles.length}
        />
      )}
    </div>
  );
};
