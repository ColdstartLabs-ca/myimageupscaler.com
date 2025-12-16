'use client';

/**
 * Interactive Tool Base Component
 * Provides common UI and functionality for client-side image tools
 */

import React, { useState, useCallback, ReactNode } from 'react';
import { Download, RefreshCw, AlertCircle } from 'lucide-react';
import { FileUpload } from '@/components/ui/FileUpload';

export interface IInteractiveToolProps {
  title: string;
  description: string;
  maxFileSizeMB?: number;
  acceptedFormats?: string[];
  children: (props: IToolChildProps) => ReactNode;
  onProcess?: (file: File) => Promise<Blob>;
}

export interface IToolChildProps {
  file: File | null;
  previewUrl: string | null;
  processedBlob: Blob | null;
  isProcessing: boolean;
  error: string | null;
}

export function InteractiveTool({
  title,
  description,
  maxFileSizeMB = 25,
  acceptedFormats = ['image/jpeg', 'image/png', 'image/webp'],
  children,
  onProcess,
}: IInteractiveToolProps): React.ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    (selectedFile: File) => {
      setError(null);

      // Validate file size
      if (selectedFile.size > maxFileSizeMB * 1024 * 1024) {
        setError(`File size must be less than ${maxFileSizeMB}MB`);
        return;
      }

      // Validate file type
      if (!acceptedFormats.includes(selectedFile.type)) {
        setError(
          `Invalid file format. Accepted formats: ${acceptedFormats.map(f => f.split('/')[1].toUpperCase()).join(', ')}`
        );
        return;
      }

      setFile(selectedFile);
      setProcessedBlob(null);

      // Create preview URL
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
    },
    [maxFileSizeMB, acceptedFormats]
  );

  const handleProcess = useCallback(async () => {
    if (!file || !onProcess) return;

    setError(null);
    setIsProcessing(true);

    try {
      const result = await onProcess(file);
      setProcessedBlob(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed');
    } finally {
      setIsProcessing(false);
    }
  }, [file, onProcess]);

  const handleDownload = useCallback(() => {
    if (!processedBlob || !file) return;

    // Get correct extension from processed blob's MIME type
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const ext = mimeToExt[processedBlob.type] || 'jpg';

    // Remove original extension and add correct one
    const baseName = file.name.replace(/\.[^/.]+$/, '');

    const url = URL.createObjectURL(processedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}-processed.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [processedBlob, file]);

  const handleReset = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setFile(null);
    setPreviewUrl(null);
    setProcessedBlob(null);
    setError(null);
  }, [previewUrl]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="p-6 border-2 border-slate-200 bg-white shadow-lg rounded-xl">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">{title}</h2>
          <p className="text-slate-600">{description}</p>
        </div>

        {/* Upload Area */}
        {!file && (
          <FileUpload
            onFileSelect={handleFileSelect}
            acceptedFormats={acceptedFormats}
            maxFileSizeMB={maxFileSizeMB}
          />
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Tool-Specific Content */}
        {file && (
          <>
            {children({
              file,
              previewUrl,
              processedBlob,
              isProcessing,
              error,
            })}

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6">
              {onProcess && !processedBlob && (
                <button
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Process Image'
                  )}
                </button>
              )}

              {processedBlob && (
                <button
                  onClick={handleDownload}
                  className="flex-1 px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download Result
                </button>
              )}

              <button
                onClick={handleReset}
                className="px-6 py-3 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Start Over
              </button>
            </div>
          </>
        )}
      </div>

      {/* Info Footer */}
      <div className="mt-4 text-center text-sm text-slate-500">
        <p>
          All processing happens in your browser. Your images are never uploaded to our servers.
        </p>
      </div>
    </div>
  );
}
