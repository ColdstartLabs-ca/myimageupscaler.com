'use client';

/**
 * Image Compressor Tool
 * Client-side image compression using Canvas API
 * Target keywords: image compressor, compress image online (300K+ searches)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { InteractiveTool } from './InteractiveTool';
import Image from 'next/image';

interface ICompressOptions {
  quality: number;
  maxWidth: number;
  maxHeight: number;
  format: 'jpeg' | 'png' | 'webp';
  maintainAspectRatio: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function compressImageBlob(file: File, options: ICompressOptions): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Canvas not supported'));
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let targetWidth = img.width;
      let targetHeight = img.height;

      if (options.maintainAspectRatio) {
        const aspectRatio = img.width / img.height;
        if (img.width > options.maxWidth || img.height > options.maxHeight) {
          if (options.maxWidth / options.maxHeight > aspectRatio) {
            targetHeight = options.maxHeight;
            targetWidth = Math.round(options.maxHeight * aspectRatio);
          } else {
            targetWidth = options.maxWidth;
            targetHeight = Math.round(options.maxWidth / aspectRatio);
          }
        }
      } else {
        targetWidth = Math.min(img.width, options.maxWidth);
        targetHeight = Math.min(img.height, options.maxHeight);
      }

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      canvas.toBlob(
        blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        `image/${options.format}`,
        options.quality / 100
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    img.src = objectUrl;
  });
}

export function ImageCompressor(): React.ReactElement {
  const [options, setOptions] = useState<ICompressOptions>({
    quality: 80,
    maxWidth: 1920,
    maxHeight: 1080,
    format: 'jpeg',
    maintainAspectRatio: true,
  });

  const [originalSize, setOriginalSize] = useState<number>(0);
  const [compressedSize, setCompressedSize] = useState<number>(0);
  const [originalDimensions, setOriginalDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [compressedPreviewUrl, setCompressedPreviewUrl] = useState<string | null>(null);

  // Ref to track the current file for debounced preview updates
  const currentFileRef = useRef<File | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPreviewUrlRef = useRef<string | null>(null);
  const markResultStaleRef = useRef<(() => void) | null>(null);

  // Debounced live preview: recompresses whenever file or options change
  useEffect(() => {
    const file = currentFileRef.current;
    if (!file) return;

    // Options changed after processing - mark output stale until user reprocesses.
    markResultStaleRef.current?.();

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const blob = await compressImageBlob(file, options);
        setCompressedSize(blob.size);

        // Revoke previous preview URL to avoid memory leaks
        if (currentPreviewUrlRef.current) {
          URL.revokeObjectURL(currentPreviewUrlRef.current);
        }

        const url = URL.createObjectURL(blob);
        currentPreviewUrlRef.current = url;
        setCompressedPreviewUrl(url);
      } catch {
        // Silently ignore preview errors (user may still be adjusting settings)
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [options]);

  // Cleanup timers/object URLs when component unmounts
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (currentPreviewUrlRef.current) {
        URL.revokeObjectURL(currentPreviewUrlRef.current);
      }
    };
  }, []);

  const handleCompress = useCallback(
    async (file: File): Promise<Blob> => {
      setOriginalSize(file.size);
      currentFileRef.current = file;

      // Measure original image dimensions
      await new Promise<void>(resolve => {
        const img = document.createElement('img');
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
          setOriginalDimensions({ width: img.width, height: img.height });
          URL.revokeObjectURL(objectUrl);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          resolve();
        };
        img.src = objectUrl;
      });

      const blob = await compressImageBlob(file, options);
      setCompressedSize(blob.size);

      // Set initial compressed preview
      if (currentPreviewUrlRef.current) {
        URL.revokeObjectURL(currentPreviewUrlRef.current);
      }
      const url = URL.createObjectURL(blob);
      currentPreviewUrlRef.current = url;
      setCompressedPreviewUrl(url);

      return blob;
    },
    [options]
  );

  const compressionRatio =
    originalSize && compressedSize
      ? Math.round(((originalSize - compressedSize) / originalSize) * 100)
      : 0;

  return (
    <InteractiveTool
      title="Compress Your Image"
      description="Free online image compressor - reduce file size without losing quality"
      onProcess={handleCompress}
    >
      {({ file, previewUrl, processedBlob, markResultStale }) => {
        markResultStaleRef.current = markResultStale;
        currentFileRef.current = file;

        return (
          <div className="space-y-6">
            {/* Preview panels */}
            {previewUrl && (
              <div className="grid md:grid-cols-2 gap-4">
                {/* Original */}
                <div>
                  <label className="text-sm font-medium mb-2 block text-muted-foreground">
                    Original Image
                  </label>
                  <div className="relative border rounded-lg overflow-hidden bg-surface-light">
                    <Image
                      src={previewUrl}
                      alt="Original"
                      width={400}
                      height={300}
                      className="w-full h-auto"
                      unoptimized
                    />
                    {/* Size badge */}
                    {originalSize > 0 && (
                      <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded font-mono">
                        {formatFileSize(originalSize)}
                      </div>
                    )}
                    {/* Dimension badge */}
                    {originalDimensions && (
                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                        {originalDimensions.width} × {originalDimensions.height}
                      </div>
                    )}
                  </div>
                </div>

                {/* Compressed preview */}
                <div>
                  <label className="text-sm font-medium mb-2 block text-muted-foreground">
                    Compressed Preview
                  </label>
                  <div className="relative border rounded-lg overflow-hidden bg-surface-light min-h-[200px]">
                    {compressedPreviewUrl ? (
                      <>
                        <Image
                          src={compressedPreviewUrl}
                          alt="Compressed preview"
                          width={400}
                          height={300}
                          className="w-full h-auto"
                          unoptimized
                        />
                        {/* Compressed size badge */}
                        {compressedSize > 0 && (
                          <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded font-mono">
                            {formatFileSize(compressedSize)}
                          </div>
                        )}
                        {/* Reduction badge */}
                        {compressionRatio > 0 && (
                          <div className="absolute bottom-2 right-2 bg-success/90 text-white text-xs px-2 py-1 rounded font-medium">
                            -{compressionRatio}% smaller
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center justify-center min-h-[200px]">
                        <p className="text-sm text-muted-foreground">
                          Click &ldquo;Process Image&rdquo; to compress
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Quality */}
              <div className="md:col-span-2">
                <div className="flex justify-between items-center mb-2">
                  <label htmlFor="quality" className="text-sm font-medium text-muted-foreground">
                    Compression Quality
                  </label>
                  <span className="text-lg font-bold text-accent">{options.quality}%</span>
                </div>
                <input
                  id="quality"
                  type="range"
                  min={1}
                  max={100}
                  value={options.quality}
                  onChange={e =>
                    setOptions(prev => ({ ...prev, quality: parseInt(e.target.value) }))
                  }
                  className="w-full h-2 bg-surface-light rounded-lg appearance-none cursor-pointer accent-accent"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Smaller file (lower quality)</span>
                  <span>Larger file (higher quality)</span>
                </div>
              </div>

              {/* Max Width */}
              <div>
                <label
                  htmlFor="maxWidth"
                  className="mb-2 block text-sm font-medium text-muted-foreground"
                >
                  Max Width (px)
                </label>
                <input
                  id="maxWidth"
                  type="number"
                  min={100}
                  max={10000}
                  value={options.maxWidth}
                  onChange={e =>
                    setOptions(prev => ({ ...prev, maxWidth: parseInt(e.target.value) || 100 }))
                  }
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-text-primary"
                />
              </div>

              {/* Max Height */}
              <div>
                <label
                  htmlFor="maxHeight"
                  className="mb-2 block text-sm font-medium text-muted-foreground"
                >
                  Max Height (px)
                </label>
                <input
                  id="maxHeight"
                  type="number"
                  min={100}
                  max={10000}
                  value={options.maxHeight}
                  onChange={e =>
                    setOptions(prev => ({ ...prev, maxHeight: parseInt(e.target.value) || 100 }))
                  }
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-text-primary"
                />
              </div>

              {/* Format */}
              <div>
                <label
                  htmlFor="format"
                  className="mb-2 block text-sm font-medium text-muted-foreground"
                >
                  Output Format
                </label>
                <select
                  id="format"
                  value={options.format}
                  onChange={e =>
                    setOptions(prev => ({
                      ...prev,
                      format: e.target.value as 'jpeg' | 'png' | 'webp',
                    }))
                  }
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-surface text-text-primary"
                >
                  <option value="jpeg">JPEG (best for photos)</option>
                  <option value="webp">WebP (best compression)</option>
                  <option value="png">PNG (lossless)</option>
                </select>
              </div>

              {/* Maintain Aspect Ratio */}
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="aspect-ratio"
                  checked={options.maintainAspectRatio}
                  onChange={e =>
                    setOptions(prev => ({ ...prev, maintainAspectRatio: e.target.checked }))
                  }
                  className="w-4 h-4 text-accent border-border rounded focus:ring-accent bg-surface"
                />
                <label
                  htmlFor="aspect-ratio"
                  className="text-sm font-medium text-muted-foreground cursor-pointer"
                >
                  Maintain aspect ratio
                </label>
              </div>
            </div>

            {/* Compression Stats */}
            {file && processedBlob && (
              <div className="bg-surface-light rounded-lg p-4 border border-border">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-primary">
                      {formatFileSize(originalSize)}
                    </p>
                    <p className="text-xs text-muted-foreground">Original Size</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-success">{compressionRatio}%</p>
                    <p className="text-xs text-muted-foreground">Reduction</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-accent">
                      {formatFileSize(compressedSize)}
                    </p>
                    <p className="text-xs text-muted-foreground">Compressed Size</p>
                  </div>
                </div>
              </div>
            )}

            {/* Tips */}
            <div className="bg-surface rounded-lg p-4 text-sm text-muted-foreground">
              <p className="font-medium mb-2">Compression Tips:</p>
              <ul className="space-y-1 ml-4 list-disc">
                <li>For web use, 70-80% quality is usually optimal</li>
                <li>WebP format offers best compression with great quality</li>
                <li>JPEG works best for photos, PNG for graphics with transparency</li>
              </ul>
            </div>
          </div>
        );
      }}
    </InteractiveTool>
  );
}
