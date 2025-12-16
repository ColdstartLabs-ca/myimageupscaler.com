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
            ? 'border-blue-500 bg-blue-50'
            : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-slate-100',
          disabled && 'opacity-50 cursor-not-allowed hover:border-slate-300 hover:bg-slate-50',
          className
        )}
      >
        <Upload
          className={cn('w-12 h-12 mx-auto mb-4', isDragging ? 'text-blue-500' : 'text-slate-400')}
        />
        <p className="text-lg font-medium text-slate-700 mb-2">
          {isDragging ? 'Drop your image here' : 'Drop your image here or click to browse'}
        </p>
        <p className="text-sm text-slate-500 mb-4">
          Supports {formatList} up to {maxFileSizeMB}MB
        </p>
        <div
          className={cn(
            'inline-block px-6 py-3 bg-blue-600 text-white font-medium rounded-lg transition-colors',
            !disabled && 'hover:bg-blue-700',
            disabled && 'opacity-50'
          )}
        >
          Choose File
        </div>
      </div>
    </>
  );
}
