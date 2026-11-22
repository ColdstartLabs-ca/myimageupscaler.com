'use client';

/**
 * Interactive Tool Base Component
 * Provides common UI and functionality for client-side image tools
 */

import React, { useState, useCallback, useMemo, ReactNode } from 'react';
import { Download, RefreshCw, AlertCircle } from 'lucide-react';
import { FileUpload } from '@/app/(pseo)/_components/ui/FileUpload';
import { analytics } from '@client/analytics/analyticsClient';
import { PostToolUpsell } from './PostToolUpsell';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface IInteractiveToolProps {
  title: string;
  description: string;
  maxFileSizeMB?: number;
  acceptedFormats?: string[];
  children: (props: IToolChildProps) => ReactNode;
  onProcess?: (file: File) => Promise<Blob>;
  /** Stable tool identifier for analytics and the workspace handoff. */
  toolId?: string;
}

export interface IToolChildProps {
  file: File | null;
  previewUrl: string | null;
  processedBlob: Blob | null;
  isProcessing: boolean;
  error: string | null;
  markResultStale: () => void;
}

export function InteractiveTool({
  title,
  description,
  maxFileSizeMB = 25,
  acceptedFormats = ['image/jpeg', 'image/png', 'image/webp'],
  children,
  onProcess,
  toolId,
}: IInteractiveToolProps): React.ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResultStale, setIsResultStale] = useState(false);

  const resolvedToolId = useMemo(
    () =>
      toolId ??
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    [toolId, title]
  );

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
      setIsResultStale(false);

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
      setIsResultStale(false);
      analytics.track('interactive_tool_processed', {
        tool: resolvedToolId,
        outputType: result.type,
        outputBytes: result.size,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed');
    } finally {
      setIsProcessing(false);
    }
  }, [file, onProcess, resolvedToolId]);

  const markResultStale = useCallback(() => {
    if (processedBlob) {
      setIsResultStale(true);
    }
  }, [processedBlob]);

  const getOutputFileName = useCallback(
    (blob: Blob): string | null => {
      if (!file) return null;
      const ext = MIME_TO_EXT[blob.type] || 'jpg';
      // Remove original extension and add correct one
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      return `${baseName}-processed.${ext}`;
    },
    [file]
  );

  const handleDownload = useCallback(() => {
    if (!processedBlob) return;
    const outputFileName = getOutputFileName(processedBlob);
    if (!outputFileName) return;

    analytics.track('interactive_tool_downloaded', {
      tool: resolvedToolId,
      outputType: processedBlob.type,
      outputBytes: processedBlob.size,
    });

    const url = URL.createObjectURL(processedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = outputFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [processedBlob, resolvedToolId, getOutputFileName]);

  const handleReset = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setFile(null);
    setPreviewUrl(null);
    setProcessedBlob(null);
    setIsResultStale(false);
    setError(null);
  }, [previewUrl]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="p-6 border-2 border-border bg-surface shadow-lg rounded-xl">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-primary mb-2">{title}</h2>
          <p className="text-muted-foreground">{description}</p>
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
          <div className="mb-4 p-4 bg-error/10 border border-error/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-error flex-shrink-0 mt-0.5" />
            <p className="text-sm text-text-primary">{error}</p>
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
              markResultStale,
            })}

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6">
              {onProcess && (
                <button
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="flex-1 px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : processedBlob ? (
                    'Reprocess Image'
                  ) : (
                    'Process Image'
                  )}
                </button>
              )}

              {processedBlob && (
                <button
                  onClick={handleDownload}
                  disabled={isResultStale}
                  className="flex-1 px-6 py-3 bg-success text-white font-medium rounded-lg hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {isResultStale ? 'Reprocess to Download' : 'Download Result'}
                </button>
              )}

              <button
                onClick={handleReset}
                className="px-6 py-3 bg-surface-light text-muted-foreground font-medium rounded-lg hover:bg-surface-light transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Start Over
              </button>
            </div>

            {processedBlob && processedBlob.type.startsWith('image/') && (
              <div className="mt-3">
                <PostToolUpsell
                  blob={processedBlob}
                  fileName={getOutputFileName(processedBlob) ?? 'image-processed.jpg'}
                  toolId={resolvedToolId}
                />
              </div>
            )}

            {processedBlob && isResultStale && (
              <p className="mt-2 text-xs text-warning">
                Settings changed after processing. Reprocess before downloading to match the
                preview.
              </p>
            )}
          </>
        )}
      </div>

      {/* Info Footer */}
      <div className="mt-4 text-center text-sm text-muted-foreground">
        <p>
          All processing happens in your browser. Your images are never uploaded to our servers.
        </p>
      </div>
    </div>
  );
}
