'use client';

/**
 * Background Remover Tool
 * Client-side background removal using @imgly/background-removal (WASM/ONNX)
 * Target keywords: background remover, remove bg, ai background remover (3M+ searches)
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { InteractiveTool } from './InteractiveTool';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

type ProcessingStage = 'idle' | 'loading-model' | 'processing' | 'done';

export function BackgroundRemover(): React.ReactElement {
  const t = useTranslations('pseo-tools.backgroundRemover');
  const [stage, setStage] = useState<ProcessingStage>('idle');
  const [progress, setProgress] = useState(0);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const removeBackgroundRef = useRef<
    typeof import('@imgly/background-removal').removeBackground | null
  >(null);

  // Cleanup processed URL on unmount
  useEffect(() => {
    return () => {
      if (processedUrl) {
        URL.revokeObjectURL(processedUrl);
      }
    };
  }, [processedUrl]);

  const handleRemoveBackground = useCallback(
    async (file: File): Promise<Blob> => {
      // Lazy load the library
      if (!removeBackgroundRef.current) {
        setStage('loading-model');
        setProgress(0);

        // eslint-disable-next-line no-restricted-syntax -- Dynamic import required for 15MB+ WASM library lazy loading
        const { removeBackground } = await import('@imgly/background-removal');
        removeBackgroundRef.current = removeBackground;

        // Brief pause to show model loaded before processing starts
        setProgress(100);
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      setStage('processing');
      setProgress(5); // Start at 5% to show immediate feedback

      // Clean up previous processed URL
      if (processedUrl) {
        URL.revokeObjectURL(processedUrl);
        setProcessedUrl(null);
      }

      const result = await removeBackgroundRef.current(file, {
        progress: (key: string, current: number, total: number) => {
          const percentage = Math.round((current / total) * 100);
          setProgress(percentage);
        },
        output: {
          format: 'image/png',
          quality: 1,
        },
      });

      // Create URL for preview
      const url = URL.createObjectURL(result);
      setProcessedUrl(url);
      setStage('done');

      return result;
    },
    [processedUrl]
  );

  return (
    <InteractiveTool
      title={t('title')}
      description={t('description')}
      maxFileSizeMB={10}
      acceptedFormats={['image/jpeg', 'image/png', 'image/webp']}
      onProcess={handleRemoveBackground}
    >
      {({ file, previewUrl, processedBlob, isProcessing }) => (
        <div className="space-y-6">
          {/* Processing Status */}
          {isProcessing && (
            <div className="bg-surface-light rounded-lg p-4 border border-border">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 className="w-5 h-5 animate-spin text-accent" />
                <span className="text-sm font-medium text-primary">
                  {stage === 'loading-model'
                    ? t('loadingModel')
                    : t('removingBackground')}
                </span>
              </div>
              <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
                {stage === 'processing' && progress < 10 ? (
                  // Indeterminate progress bar when waiting for actual progress
                  <div className="bg-accent h-2 w-1/3 rounded-full animate-pulse" />
                ) : (
                  <div
                    className="bg-accent h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {stage === 'loading-model'
                  ? t('downloadingModel')
                  : progress < 10
                    ? t('analyzingImage')
                    : t('processingPercent', { percent: progress })}
              </p>
            </div>
          )}

          {/* Preview Grid */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Original Image */}
            <div>
              <label className="text-sm font-medium mb-2 block text-muted-foreground">
                {t('originalLabel')}
              </label>
              <div className="relative aspect-square border rounded-lg overflow-hidden bg-surface-light">
                {previewUrl && (
                  <Image
                    src={previewUrl}
                    alt="Original image"
                    fill
                    className="object-contain"
                    unoptimized
                  />
                )}
              </div>
            </div>

            {/* Result Image */}
            <div>
              <label className="text-sm font-medium mb-2 block text-muted-foreground">
                {t('backgroundRemovedLabel')}
              </label>
              <div
                className="relative aspect-square border rounded-lg overflow-hidden"
                style={{
                  // Checkerboard pattern to show transparency
                  backgroundImage: `
                    linear-gradient(45deg, #e0e0e0 25%, transparent 25%),
                    linear-gradient(-45deg, #e0e0e0 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, #e0e0e0 75%),
                    linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)
                  `,
                  backgroundSize: '20px 20px',
                  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                }}
              >
                {processedUrl ? (
                  <Image
                    src={processedUrl}
                    alt="Image with background removed"
                    fill
                    className="object-contain"
                    unoptimized
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                    {isProcessing ? t('processingLabel') : t('resultWillAppear')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* File Info */}
          {file && (
            <div className="bg-surface-light rounded-lg p-4 border border-border">
              <h3 className="text-sm font-medium text-primary mb-2">{t('fileDetailsTitle')}</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('nameLabel')}</span>{' '}
                  <span className="text-primary">{file.name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('sizeLabel')}</span>{' '}
                  <span className="text-primary">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('typeLabel')}</span>{' '}
                  <span className="text-primary">{file.type}</span>
                </div>
                {processedBlob && (
                  <div>
                    <span className="text-muted-foreground">{t('outputLabel')}</span>{' '}
                    <span className="text-success">
                      PNG ({(processedBlob.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </InteractiveTool>
  );
}
