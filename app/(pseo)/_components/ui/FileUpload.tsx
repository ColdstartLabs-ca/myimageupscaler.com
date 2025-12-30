'use client';

/**
 * Reusable File Upload Component
 * Provides drag-and-drop and click-to-upload functionality
 */

import React, { useCallback, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface IFileUploadProps {
  onFileSelect: (file: File) => void;
  acceptedFormats?: string[];
  maxFileSizeMB?: number;
  className?: string;
  disabled?: boolean;
}

export function FileUpload({
  onFileSelect,
  acceptedFormats = ['image/jpeg', 'image/png', 'image/webp'],
  maxFileSizeMB = 25,
  className,
  disabled = false,
}: IFileUploadProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleClick = useCallback(() => {
    if (!disabled) {
      inputRef.current?.click();
    }
  }, [disabled]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && !disabled) {
        onFileSelect(file);
        // Reset input so same file can be selected again
        e.target.value = '';
      }
    },
    [onFileSelect, disabled]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled) return;

      const file = e.dataTransfer.files[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect, disabled]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!disabled) {
        setIsDragging(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const formatList = acceptedFormats.map(f => f.split('/')[1].toUpperCase()).join(', ');

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={acceptedFormats.join(',')}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'border-2 border-dashed rounded-lg p-12 text-center transition-all cursor-pointer',
          isDragging
            ? 'border-accent bg-surface-light'
            : 'border-border bg-surface hover:border-accent hover:bg-surface-light',
          disabled && 'opacity-50 cursor-not-allowed hover:border-border hover:bg-surface',
          className
        )}
      >
        <Upload
          className={cn('w-12 h-12 mx-auto mb-4', isDragging ? 'text-accent' : 'text-text-muted')}
        />
        <p className="text-lg font-medium text-text-secondary mb-2">
          {isDragging ? 'Drop your image here' : 'Drop your image here or click to browse'}
        </p>
        <p className="text-sm text-text-secondary mb-4">
          Supports {formatList} up to {maxFileSizeMB}MB
        </p>
        <div
          className={cn(
            'inline-block px-6 py-3 bg-accent text-white font-medium rounded-lg transition-colors',
            !disabled && 'hover:bg-accent-hover',
            disabled && 'opacity-50'
          )}
        >
          Choose File
        </div>
      </div>
    </>
  );
}
