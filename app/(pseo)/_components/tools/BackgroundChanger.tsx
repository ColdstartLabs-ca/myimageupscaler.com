'use client';

/**
 * Background Changer Tool
 * Client-side background removal + replacement using @imgly/background-removal (WASM/ONNX)
 * Target keywords: background changer, change background, replace background online
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Loader2, Download, RefreshCw, AlertCircle } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

type BgType = 'transparent' | 'solid' | 'gradient-linear' | 'gradient-radial';

type ToolStage =
  | 'idle'
  | 'removing-bg'
  | 'loading-model'
  | 'bg-removed'
  | 'applying-bg'
  | 'done'
  | 'error';

interface IBgOptions {
  type: BgType;
  solidColor: string;
  gradientColor1: string;
  gradientColor2: string;
}

function applyBackgroundToCanvas(removedBgBlob: Blob, options: IBgOptions): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const blobUrl = URL.createObjectURL(removedBgBlob);
    img.onload = () => {
      // Revoke the temporary blob URL as soon as the image is loaded into memory
      URL.revokeObjectURL(blobUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context not supported'));
        return;
      }

      if (options.type === 'solid') {
        ctx.fillStyle = options.solidColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (options.type === 'gradient-linear') {
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0, options.gradientColor1);
        gradient.addColorStop(1, options.gradientColor2);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (options.type === 'gradient-radial') {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const radius = Math.max(cx, cy);
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, options.gradientColor1);
        gradient.addColorStop(1, options.gradientColor2);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      // transparent: skip fill — canvas is already transparent

      ctx.drawImage(img, 0, 0);

      canvas.toBlob(b => {
        if (b) {
          resolve(b);
        } else {
          reject(new Error('Failed to export canvas'));
        }
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error('Failed to load processed image'));
    };
    img.src = blobUrl;
  });
}

export function BackgroundChanger(): React.ReactElement {
  const [stage, setStage] = useState<ToolStage>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [removedBgBlob, setRemovedBgBlob] = useState<Blob | null>(null);

  const [bgOptions, setBgOptions] = useState<IBgOptions>({
    type: 'solid',
    solidColor: '#ffffff',
    gradientColor1: '#6366f1',
    gradientColor2: '#ec4899',
  });

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [finalBlob, setFinalBlob] = useState<Blob | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const removeBackgroundRef = useRef<
    typeof import('@imgly/background-removal').removeBackground | null
  >(null);
  const originalUrlRef = useRef<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    originalUrlRef.current = originalUrl;
  }, [originalUrl]);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const regeneratePreview = useCallback(async (blob: Blob, opts: IBgOptions) => {
    try {
      setStage('applying-bg');
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      const resultBlob = await applyBackgroundToCanvas(blob, opts);
      const url = URL.createObjectURL(resultBlob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setFinalBlob(resultBlob);
      setStage('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply background');
      setStage('error');
    }
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }
      const accepted = ['image/jpeg', 'image/png', 'image/webp'];
      if (!accepted.includes(file.type)) {
        setError('Invalid format. Accepted: JPEG, PNG, WebP');
        return;
      }

      setError(null);
      setFinalBlob(null);
      setRemovedBgBlob(null);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setPreviewUrl(null);
      if (originalUrlRef.current) {
        URL.revokeObjectURL(originalUrlRef.current);
        originalUrlRef.current = null;
      }

      setOriginalFile(file);
      const origUrl = URL.createObjectURL(file);
      originalUrlRef.current = origUrl;
      setOriginalUrl(origUrl);

      try {
        if (!removeBackgroundRef.current) {
          setStage('loading-model');
          setProgress(0);
          // eslint-disable-next-line no-restricted-syntax -- Dynamic import required for 15MB+ WASM library lazy loading
          const { removeBackground } = await import('@imgly/background-removal');
          removeBackgroundRef.current = removeBackground;
          setProgress(100);
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        setStage('removing-bg');
        setProgress(5);

        const result = await removeBackgroundRef.current(file, {
          progress: (_key: string, current: number, total: number) => {
            const percentage = Math.round((current / total) * 100);
            setProgress(percentage);
          },
          output: {
            format: 'image/png',
            quality: 1,
          },
        });

        setRemovedBgBlob(result);
        setStage('bg-removed');

        // Auto-generate preview with current options
        await regeneratePreview(result, bgOptions);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Background removal failed');
        setStage('error');
      }
    },
    [bgOptions, regeneratePreview]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        void processFile(file);
        e.target.value = '';
      }
    },
    [processFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) void processFile(file);
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleBgOptionsChange = useCallback(
    (newOpts: IBgOptions) => {
      setBgOptions(newOpts);
      if (removedBgBlob) {
        void regeneratePreview(removedBgBlob, newOpts);
      }
    },
    [removedBgBlob, regeneratePreview]
  );

  const handleDownload = useCallback(() => {
    if (!finalBlob || !originalFile) return;
    const baseName = originalFile.name.replace(/\.[^/.]+$/, '');
    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}-new-bg.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [finalBlob, originalFile]);

  const handleReset = useCallback(() => {
    if (originalUrlRef.current) {
      URL.revokeObjectURL(originalUrlRef.current);
      originalUrlRef.current = null;
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setOriginalFile(null);
    setOriginalUrl(null);
    setRemovedBgBlob(null);
    setPreviewUrl(null);
    setFinalBlob(null);
    setStage('idle');
    setError(null);
    setProgress(0);
  }, []);

  const isProcessing =
    stage === 'loading-model' || stage === 'removing-bg' || stage === 'applying-bg';
  const showControls = stage === 'bg-removed' || stage === 'applying-bg' || stage === 'done';

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="p-6 border-2 border-border bg-surface shadow-lg rounded-xl">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-primary mb-2">Change Image Background</h2>
          <p className="text-muted-foreground">
            Remove background and replace it with a solid color, gradient, or keep it transparent.
            Runs entirely in your browser.
          </p>
        </div>

        {/* Upload Area */}
        {!originalFile && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileInput}
              className="hidden"
              id="bg-changer-upload"
            />
            <label htmlFor="bg-changer-upload" className="sr-only">
              Upload image
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                'border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all',
                isDragging
                  ? 'border-accent bg-surface-light'
                  : 'border-border bg-surface hover:border-accent hover:bg-surface-light'
              )}
            >
              <Upload
                className={cn(
                  'w-12 h-12 mx-auto mb-4',
                  isDragging ? 'text-accent' : 'text-muted-foreground'
                )}
              />
              <p className="text-lg font-medium text-primary mb-2">
                {isDragging ? 'Drop your image here' : 'Drop your image here or click to browse'}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Supports JPEG, PNG, WebP up to 10MB
              </p>
              <div className="inline-block px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-colors">
                Choose File
              </div>
            </div>
          </>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-error/10 border border-error/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-error flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-primary">{error}</p>
              {stage === 'error' && (
                <button onClick={handleReset} className="mt-2 text-sm text-accent hover:underline">
                  Try again
                </button>
              )}
            </div>
          </div>
        )}

        {/* Processing Status */}
        {isProcessing && (
          <div className="mb-4 bg-surface-light rounded-lg p-4 border border-border">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="w-5 h-5 animate-spin text-accent" />
              <span className="text-sm font-medium text-primary">
                {stage === 'loading-model'
                  ? 'Loading AI model (first time only)...'
                  : stage === 'removing-bg'
                    ? 'Removing background...'
                    : 'Applying background...'}
              </span>
            </div>
            {(stage === 'loading-model' || stage === 'removing-bg') && (
              <>
                <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
                  {stage === 'removing-bg' && progress < 10 ? (
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
                    ? 'Downloading AI model (~15MB). Cached for future use.'
                    : progress < 10
                      ? 'Analyzing image...'
                      : `Processing: ${progress}%`}
                </p>
              </>
            )}
          </div>
        )}

        {/* Main Layout: Original | Controls | Preview */}
        {originalFile && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-3 gap-4">
              {/* Left: Original Image */}
              <div>
                <label className="text-sm font-medium mb-2 block text-muted-foreground">
                  Original
                </label>
                <div className="relative aspect-square border rounded-lg overflow-hidden bg-surface-light">
                  {originalUrl && (
                    <Image
                      src={originalUrl}
                      alt="Original image"
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  )}
                </div>
              </div>

              {/* Center: Controls */}
              <div>
                <label className="text-sm font-medium mb-2 block text-muted-foreground">
                  Background Options
                </label>
                <div className="border rounded-lg p-4 bg-surface-light space-y-4 min-h-[200px]">
                  {/* Background Type */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                      Type
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { value: 'transparent', label: 'Transparent' },
                          { value: 'solid', label: 'Solid Color' },
                          { value: 'gradient-linear', label: 'Linear Gradient' },
                          { value: 'gradient-radial', label: 'Radial Gradient' },
                        ] as { value: BgType; label: string }[]
                      ).map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => handleBgOptionsChange({ ...bgOptions, type: opt.value })}
                          disabled={isProcessing}
                          className={cn(
                            'px-2 py-2 text-xs font-medium rounded-lg border transition-all',
                            bgOptions.type === opt.value
                              ? 'border-accent bg-accent text-white'
                              : 'border-border bg-surface text-primary hover:border-accent',
                            isProcessing && 'opacity-50 cursor-not-allowed'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Solid Color Picker */}
                  {bgOptions.type === 'solid' && (
                    <div>
                      <label
                        htmlFor="solid-color"
                        className="text-xs font-medium text-muted-foreground mb-2 block uppercase tracking-wide"
                      >
                        Color
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          id="solid-color"
                          type="color"
                          value={bgOptions.solidColor}
                          onChange={e =>
                            handleBgOptionsChange({
                              ...bgOptions,
                              solidColor: e.target.value,
                            })
                          }
                          disabled={isProcessing}
                          className="w-12 h-10 rounded border border-border cursor-pointer disabled:opacity-50"
                        />
                        <span className="text-sm text-primary font-mono">
                          {bgOptions.solidColor}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Gradient Color Pickers */}
                  {(bgOptions.type === 'gradient-linear' ||
                    bgOptions.type === 'gradient-radial') && (
                    <div className="space-y-3">
                      <div>
                        <label
                          htmlFor="gradient-color-1"
                          className="text-xs font-medium text-muted-foreground mb-2 block uppercase tracking-wide"
                        >
                          {bgOptions.type === 'gradient-radial' ? 'Center Color' : 'Start Color'}
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            id="gradient-color-1"
                            type="color"
                            value={bgOptions.gradientColor1}
                            onChange={e =>
                              handleBgOptionsChange({
                                ...bgOptions,
                                gradientColor1: e.target.value,
                              })
                            }
                            disabled={isProcessing}
                            className="w-12 h-10 rounded border border-border cursor-pointer disabled:opacity-50"
                          />
                          <span className="text-sm text-primary font-mono">
                            {bgOptions.gradientColor1}
                          </span>
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="gradient-color-2"
                          className="text-xs font-medium text-muted-foreground mb-2 block uppercase tracking-wide"
                        >
                          {bgOptions.type === 'gradient-radial' ? 'Edge Color' : 'End Color'}
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            id="gradient-color-2"
                            type="color"
                            value={bgOptions.gradientColor2}
                            onChange={e =>
                              handleBgOptionsChange({
                                ...bgOptions,
                                gradientColor2: e.target.value,
                              })
                            }
                            disabled={isProcessing}
                            className="w-12 h-10 rounded border border-border cursor-pointer disabled:opacity-50"
                          />
                          <span className="text-sm text-primary font-mono">
                            {bgOptions.gradientColor2}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {bgOptions.type === 'transparent' && (
                    <p className="text-xs text-muted-foreground">
                      The image will be saved as PNG with a transparent background.
                    </p>
                  )}
                </div>
              </div>

              {/* Right: Live Preview */}
              <div>
                <label className="text-sm font-medium mb-2 block text-muted-foreground">
                  Preview
                </label>
                <div
                  className="relative aspect-square border rounded-lg overflow-hidden"
                  style={
                    bgOptions.type === 'transparent' && showControls
                      ? {
                          backgroundImage: `
                            linear-gradient(45deg, #e0e0e0 25%, transparent 25%),
                            linear-gradient(-45deg, #e0e0e0 25%, transparent 25%),
                            linear-gradient(45deg, transparent 75%, #e0e0e0 75%),
                            linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)
                          `,
                          backgroundSize: '20px 20px',
                          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                        }
                      : {}
                  }
                >
                  {previewUrl && showControls ? (
                    <Image
                      src={previewUrl}
                      alt="Image with new background"
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm text-center px-4">
                      {isProcessing ? (
                        <Loader2 className="w-6 h-6 animate-spin text-accent" />
                      ) : (
                        'Preview will appear here after processing'
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
              {finalBlob && (
                <button
                  onClick={handleDownload}
                  className="flex-1 min-w-[160px] px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download PNG
                </button>
              )}
              <button
                onClick={handleReset}
                className="px-6 py-3 bg-surface-light text-muted-foreground font-medium rounded-lg border border-border hover:border-accent transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Start Over
              </button>
            </div>
          </div>
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
