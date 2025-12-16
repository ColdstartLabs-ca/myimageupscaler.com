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
                <label className="text-sm font-medium mb-2 block text-slate-700">
                  Original Image
                </label>
                <div className="relative border rounded-lg overflow-hidden bg-slate-100">
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
                <label className="text-sm font-medium mb-2 block text-slate-700">
                  Compression Preview
                </label>
                <div className="border rounded-lg p-6 bg-slate-100 flex items-center justify-center min-h-[200px]">
                  <div className="text-center">
                    <p className="text-4xl font-bold text-blue-600">{options.quality}%</p>
                    <p className="text-sm text-slate-500 mt-2">Quality Setting</p>
                    {processedBlob && (
                      <div className="mt-4 space-y-1">
                        <p className="text-lg font-semibold text-green-600">
                          {compressionRatio}% smaller
                        </p>
                        <p className="text-xs text-slate-600">
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
                <label htmlFor="quality" className="text-sm font-medium text-slate-700">
                  Compression Quality
                </label>
                <span className="text-lg font-bold text-blue-600">{options.quality}%</span>
              </div>
              <input
                id="quality"
                type="range"
                min={1}
                max={100}
                value={options.quality}
                onChange={e => setOptions(prev => ({ ...prev, quality: parseInt(e.target.value) }))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>Smaller file (lower quality)</span>
                <span>Larger file (higher quality)</span>
              </div>
            </div>

            {/* Max Width */}
            <div>
              <label htmlFor="maxWidth" className="mb-2 block text-sm font-medium text-slate-700">
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
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Max Height */}
            <div>
              <label htmlFor="maxHeight" className="mb-2 block text-sm font-medium text-slate-700">
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
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Format */}
            <div>
              <label htmlFor="format" className="mb-2 block text-sm font-medium text-slate-700">
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
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
              />
              <label
                htmlFor="aspect-ratio"
                className="text-sm font-medium text-slate-700 cursor-pointer"
              >
                Maintain aspect ratio
              </label>
            </div>
          </div>

          {/* Compression Stats */}
          {file && processedBlob && (
            <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-4 border border-blue-200">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-slate-900">
                    {(originalSize / 1024).toFixed(0)}KB
                  </p>
                  <p className="text-xs text-slate-600">Original Size</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{compressionRatio}%</p>
                  <p className="text-xs text-slate-600">Reduction</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600">
                    {(compressedSize / 1024).toFixed(0)}KB
                  </p>
                  <p className="text-xs text-slate-600">Compressed Size</p>
                </div>
              </div>
            </div>
          )}

          {/* Tips */}
          <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600">
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
