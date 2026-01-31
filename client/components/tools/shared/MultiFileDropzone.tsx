'use client';

import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { AlertCircle, FileUp, UploadCloud, X, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { formatBytes } from '@client/utils/image-compression';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';

export interface IMultiFileDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  maxFiles?: number;
  maxSize?: number; // Max file size in bytes
  accept?: string[]; // MIME types
  className?: string;
  showFileList?: boolean;
  showClearAll?: boolean;
  compact?: boolean;
}

export interface IFileWithPreview {
  file: File;
  previewUrl: string;
  id: string;
}

export const MultiFileDropzone: React.FC<IMultiFileDropzoneProps> = ({
  onFilesSelected,
  disabled = false,
  maxFiles = 10,
  maxSize,
  accept = IMAGE_VALIDATION.ALLOWED_TYPES,
  className = '',
  showFileList = true,
  showClearAll = true,
  compact = false,
}) => {
  const t = useTranslations('toolsUi.dropzone');
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<IFileWithPreview[]>([]);

  // Default size limit to 5MB if not specified
  const currentLimit = maxSize ?? IMAGE_VALIDATION.MAX_SIZE_FREE;

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      selectedFiles.forEach(({ previewUrl }) => {
        URL.revokeObjectURL(previewUrl);
      });
    };
  }, [selectedFiles]);

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

  const validateFile = useCallback(
    (file: File): { valid: boolean; error?: string } => {
      // Check file type
      const isValidType = accept.some(type => type === file.type);
      if (!isValidType) {
        return {
          valid: false,
          error: t('errors.invalidType', { type: file.type, types: accept.join(', ') }),
        };
      }

      // Check file size
      if (file.size > currentLimit) {
        return {
          valid: false,
          error: t('errors.fileTooLarge', {
            name: file.name,
            size: formatBytes(file.size),
            limit: formatBytes(currentLimit),
          }),
        };
      }

      return { valid: true };
    },
    [accept, currentLimit, t]
  );

  const handleFilesReceived = useCallback(
    (files: FileList | File[]) => {
      setError(null);

      const fileArray = Array.from(files);

      // Check if adding files would exceed maxFiles
      if (selectedFiles.length + fileArray.length > maxFiles) {
        setError(
          t('errors.maxFiles', {
            n: maxFiles,
            count: selectedFiles.length,
            attempted: fileArray.length,
          })
        );
        return;
      }

      // Validate all files
      const validFiles: File[] = [];
      const validationErrors: string[] = [];

      for (const file of fileArray) {
        const result = validateFile(file);
        if (result.valid) {
          validFiles.push(file);
        } else {
          validationErrors.push(result.error || `Invalid file: ${file.name}`);
        }
      }

      if (validationErrors.length > 0) {
        setError(validationErrors.join('; '));
      }

      if (validFiles.length > 0) {
        // Create preview URLs for valid files
        const filesWithPreview: IFileWithPreview[] = validFiles.map(file => ({
          file,
          previewUrl: URL.createObjectURL(file),
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        }));

        const newFiles = [...selectedFiles, ...filesWithPreview];
        setSelectedFiles(newFiles);

        // Notify parent component with all files
        onFilesSelected(newFiles.map(f => f.file));
      }
    },
    [selectedFiles, maxFiles, validateFile, onFilesSelected, t]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      handleFilesReceived(e.dataTransfer.files);
    },
    [disabled, handleFilesReceived]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFilesReceived(e.target.files);
      }
      // Reset input so same files can be selected again if needed
      e.target.value = '';
    },
    [handleFilesReceived]
  );

  const handleRemoveFile = useCallback(
    (id: string) => {
      setSelectedFiles(prev => {
        const fileToRemove = prev.find(f => f.id === id);
        if (fileToRemove) {
          URL.revokeObjectURL(fileToRemove.previewUrl);
        }

        const newFiles = prev.filter(f => f.id !== id);
        onFilesSelected(newFiles.map(f => f.file));
        return newFiles;
      });
    },
    [onFilesSelected]
  );

  const handleClearAll = useCallback(() => {
    selectedFiles.forEach(({ previewUrl }) => {
      URL.revokeObjectURL(previewUrl);
    });
    setSelectedFiles([]);
    onFilesSelected([]);
    setError(null);
  }, [selectedFiles, onFilesSelected]);

  const getAcceptAttribute = useMemo(() => {
    return accept.join(', ');
  }, [accept]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Dropzone */}
      <div
        data-testid="multi-file-dropzone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative group cursor-pointer transition-all duration-300 ease-out
          ${compact ? 'p-4' : 'p-12'}
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
          accept={getAcceptAttribute}
          multiple
          disabled={disabled}
          aria-label={t('clickOrDrag')}
        />

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
                {isDragging ? t('dropToUpload') : t('clickOrDrag')}
              </h3>
              <p className="text-muted-foreground text-sm font-medium leading-relaxed">
                {t('supportedFormats')}
                <span className="block text-xs text-muted-foreground mt-1 font-normal">
                  {t('limits', { size: formatBytes(currentLimit), n: maxFiles })}
                </span>
              </p>
            </div>
          )}

          {selectedFiles.length > 0 && !compact && (
            <div className="text-sm font-medium text-accent mt-2">
              {t('selectedCount', { n: selectedFiles.length })}
            </div>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center justify-center">
          <div className="bg-red-500/20 text-red-400 text-sm font-medium px-4 py-2 rounded-full shadow-sm border border-red-500/20 flex items-center animate-fade-in-up">
            <AlertCircle size={16} className="mr-2" />
            {error}
          </div>
        </div>
      )}

      {/* File List */}
      {showFileList && selectedFiles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">
              {t('selectedTitle', { n: selectedFiles.length })}
            </h4>
            {showClearAll && selectedFiles.length > 1 && (
              <button
                onClick={handleClearAll}
                disabled={disabled}
                className="text-xs font-medium text-accent hover:text-accent-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-accent/10 transition-colors"
              >
                <Trash2 size={14} />
                {t('clearAll')}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {selectedFiles.map(({ file, previewUrl, id }) => (
              <div
                key={id}
                className="relative group rounded-xl overflow-hidden bg-surface-light border border-border aspect-square"
              >
                <Image
                  src={previewUrl}
                  alt={file.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                  unoptimized
                />

                {/* File info overlay */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-xs text-white font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                </div>

                {/* Remove button */}
                <button
                  onClick={() => handleRemoveFile(id)}
                  disabled={disabled}
                  className="absolute top-2 right-2 p-1.5 bg-red-500/80 hover:bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-110"
                  title={t('removeFile')}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
