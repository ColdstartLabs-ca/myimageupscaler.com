import React, { useCallback, useState } from 'react';
import { UploadCloud, AlertCircle, FileUp } from 'lucide-react';

interface IDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  compact?: boolean; // Prop to render a smaller version if needed
}

const Dropzone: React.FC<IDropzoneProps> = ({ onFilesSelected, disabled, compact = false }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const validateFile = (file: File): boolean => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return false;
    }
    if (file.size > 5 * 1024 * 1024) {
      // 5MB
      return false;
    }
    return true;
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        const validFiles = droppedFiles.filter(validateFile);

        if (validFiles.length !== droppedFiles.length) {
          setError(`Some files were rejected. Only JPG, PNG, WEBP under 5MB are allowed.`);
        } else {
          setError(null);
        }

        if (validFiles.length > 0) {
          onFilesSelected(validFiles);
        }
      }
    },
    [onFilesSelected, disabled]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []);
      if (selectedFiles.length > 0) {
        const validFiles = selectedFiles.filter(validateFile);

        if (validFiles.length !== selectedFiles.length) {
          setError(`Some files were rejected. Only JPG, PNG, WEBP under 5MB are allowed.`);
        } else {
          setError(null);
        }

        if (validFiles.length > 0) {
          onFilesSelected(validFiles);
        }
      }
    },
    [onFilesSelected]
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative group cursor-pointer transition-all duration-300 ease-out
        ${compact ? 'p-4' : 'p-12'}
        ${
          isDragging
            ? 'bg-indigo-50 border-indigo-500 scale-[1.02] shadow-xl ring-4 ring-indigo-100'
            : 'bg-slate-50/50 hover:bg-white border-slate-300 hover:border-indigo-400 hover:shadow-lg hover:shadow-indigo-50/50'
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
      />

      <div className="flex flex-col items-center justify-center text-center space-y-4 pointer-events-none select-none">
        {/* Icon Container */}
        <div
          className={`
          relative flex items-center justify-center rounded-2xl transition-all duration-300
          ${isDragging ? 'bg-indigo-600 text-white shadow-lg scale-110' : 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-900/5 group-hover:scale-110 group-hover:text-indigo-500'}
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
            <div className="absolute -inset-4 bg-indigo-100/50 rounded-full blur-xl -z-10 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>

        {!compact && (
          <div className="space-y-2 max-w-xs mx-auto">
            <h3
              className={`font-bold text-slate-900 transition-colors ${isDragging ? 'text-indigo-700' : 'group-hover:text-indigo-600'} text-xl`}
            >
              {isDragging ? 'Drop to upload' : 'Click or drag images'}
            </h3>
            <p className="text-slate-500 text-sm font-medium leading-relaxed">
              Support for JPG, PNG, and WEBP
              <span className="block text-xs text-slate-400 mt-1 font-normal">
                Up to 5MB per file • Batch processing available
              </span>
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="absolute inset-x-0 -bottom-16 flex items-center justify-center">
          <div className="bg-red-50 text-red-600 text-sm font-medium px-4 py-2 rounded-full shadow-sm border border-red-100 flex items-center animate-fade-in-up">
            <AlertCircle size={16} className="mr-2" />
            {error}
          </div>
        </div>
      )}
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default Dropzone;
