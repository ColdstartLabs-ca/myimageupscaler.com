'use client';

/**
 * Image Compressor Tool
 * Client-side image compression using Canvas API
 * Target keywords: image compressor, compress image online (300K+ searches)
 */

import React, { useState, useCallback } from 'react';
import { InteractiveTool } from './InteractiveTool';
import Image from 'next/image';

interface ICompressOptions {
  quality: number;
  maxWidth: number;
  maxHeight: number;
  format: 'jpeg' | 'png' | 'webp';
  maintainAspectRatio: boolean;
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

  const handleCompress = useCallback(
    async (file: File): Promise<Blob> => {
      setOriginalSize(file.size);

      return new Promise((resolve, reject) => {
        const img = document.createElement('img');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Canvas not supported'));
          return;
        }

        img.onload = () => {
          // Store original dimensions
          if (!originalDimensions) {
            setOriginalDimensions({ width: img.width, height: img.height });
          }

          let targetWidth = img.width;
          let targetHeight = img.height;

          // Resize if image exceeds max dimensions
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

          // High-quality rendering
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          canvas.toBlob(
            blob => {
              if (blob) {
                setCompressedSize(blob.size);
                resolve(blob);
              } else {
                reject(new Error('Failed to compress image'));
              }
            },
            `image/${options.format}`,
            options.quality / 100
          );
        };

        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = URL.createObjectURL(file);
      });
    },
    [options, originalDimensions]
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
      {({ file, previewUrl, processedBlob }) => (
        <div className="space-y-6">
          {/* Preview */}
          {previewUrl && (
            <div className="grid md:grid-cols-2 gap-4">
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
                  {originalDimensions && (
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      {originalDimensions.width} × {originalDimensions.height}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block text-muted-foreground">
                  Compression Preview
                </label>
                <div className="border rounded-lg p-6 bg-surface-light flex items-center justify-center min-h-[200px]">
                  <div className="text-center">
                    <p className="text-4xl font-bold text-accent">{options.quality}%</p>
                    <p className="text-sm text-muted-foreground mt-2">Quality Setting</p>
                    {processedBlob && (
                      <div className="mt-4 space-y-1">
                        <p className="text-lg font-semibold text-success">
                          {compressionRatio}% smaller
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(originalSize / 1024 / 1024).toFixed(2)}MB →{' '}
                          {(compressedSize / 1024 / 1024).toFixed(2)}MB
                        </p>
                      </div>
                    )}
                  </div>
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
                onChange={e => setOptions(prev => ({ ...prev, quality: parseInt(e.target.value) }))}
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
                    {(originalSize / 1024).toFixed(0)}KB
                  </p>
                  <p className="text-xs text-muted-foreground">Original Size</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-success">{compressionRatio}%</p>
                  <p className="text-xs text-muted-foreground">Reduction</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-accent">
                    {(compressedSize / 1024).toFixed(0)}KB
                  </p>
                  <p className="text-xs text-muted-foreground">Compressed Size</p>
                </div>
              </div>
            </div>
          )}

          {/* Tips */}
          <div className="bg-surface rounded-lg p-4 text-sm text-muted-foreground">
            <p className="font-medium mb-2">💡 Compression Tips:</p>
            <ul className="space-y-1 ml-4 list-disc">
              <li>For web use, 70-80% quality is usually optimal</li>
              <li>WebP format offers best compression with great quality</li>
              <li>JPEG works best for photos, PNG for graphics with transparency</li>
            </ul>
          </div>
        </div>
      )}
    </InteractiveTool>
  );
}
