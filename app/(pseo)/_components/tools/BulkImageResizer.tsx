'use client';

/**
 * Bulk Image Resizer Tool
 * Client-side batch image resizing using Canvas API with ZIP download
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Download,
  RefreshCw,
  Upload,
  X,
  Check,
  Package,
  Sparkles,
  ArrowRight,
  Zap,
} from 'lucide-react';
import JSZip from 'jszip';
import Link from 'next/link';

interface IResizeOptions {
  width: number;
  height: number;
  maintainAspectRatio: boolean;
  fitMode: 'fit' | 'fill';
  format: 'jpeg' | 'png' | 'webp';
  quality: number;
}

interface IImageFile {
  file: File;
  id: string;
  previewUrl: string;
  originalWidth: number;
  originalHeight: number;
  processedBlob: Blob | null;
  processedWidth: number | null;
  processedHeight: number | null;
  isProcessing: boolean;
  error: string | null;
  progress: number;
}

interface IBulkImageResizerProps {
  /** Default width */
  defaultWidth?: number;
  /** Default height */
  defaultHeight?: number;
  /** Custom title */
  title?: string;
  /** Custom description */
  description?: string;
  /** Maximum number of files */
  maxFiles?: number;
}

export function BulkImageResizer({
  defaultWidth = 1920,
  defaultHeight = 1080,
  title = 'Bulk Image Resizer',
  description = 'Resize multiple images at once with our free bulk image resizer. All processing happens in your browser.',
  maxFiles = 20,
}: IBulkImageResizerProps): React.ReactElement {
  const [options, setOptions] = useState<IResizeOptions>({
    width: defaultWidth,
    height: defaultHeight,
    maintainAspectRatio: true,
    fitMode: 'fit',
    format: 'jpeg',
    quality: 85,
  });

  const [images, setImages] = useState<IImageFile[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showUpscalerCTA, setShowUpscalerCTA] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFilesRef = useRef<((files: File[]) => Promise<void>) | null>(
    null
  ) as React.MutableRefObject<((files: File[]) => Promise<void>) | null>;

  const addFiles = useCallback(
    async (files: File[]) => {
      // Check max files limit using functional update
      setImages(prevImages => {
        if (prevImages.length + files.length > maxFiles) {
          alert(`You can only process up to ${maxFiles} images at once.`);
          return prevImages;
        }

        return prevImages; // Return early, we'll update asynchronously
      });

      const newImages: IImageFile[] = [];

      for (const file of files) {
        // Get dimensions asynchronously
        const dimensions = await getImageDimensions(file);
        const previewUrl = URL.createObjectURL(file);

        newImages.push({
          file,
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          previewUrl,
          originalWidth: dimensions.width,
          originalHeight: dimensions.height,
          processedBlob: null,
          processedWidth: null,
          processedHeight: null,
          isProcessing: false,
          error: null,
          progress: 0,
        });
      }

      setImages(prevImages => {
        if (prevImages.length + newImages.length > maxFiles) {
          return prevImages;
        }
        return [...prevImages, ...newImages];
      });
    },
    [maxFiles]
  );

  // Update ref whenever addFiles changes
  addFilesRef.current = addFiles;

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));

    if (files.length === 0) return;

    addFilesRef.current?.(files);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    addFilesRef.current?.(files);
  }, []);

  const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = document.createElement('img');
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const removeImage = useCallback((id: string) => {
    setImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img?.previewUrl) {
        URL.revokeObjectURL(img.previewUrl);
      }
      return prev.filter(i => i.id !== id);
    });
  }, []);

  interface IResizeResult {
    blob: Blob;
    width: number;
    height: number;
  }

  const resizeImage = useCallback(
    async (image: IImageFile): Promise<IResizeResult> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(image.file);

        img.onload = () => {
          // Use naturalWidth/naturalHeight for accurate source dimensions
          const srcWidth = img.naturalWidth;
          const srcHeight = img.naturalHeight;
          const srcAspect = srcWidth / srcHeight;

          // Calculate output dimensions
          let outWidth = options.width;
          let outHeight = options.height;

          if (options.maintainAspectRatio) {
            const targetAspect = options.width / options.height;

            if (options.fitMode === 'fit') {
              // Scale to fit within bounds, maintaining aspect ratio
              if (srcAspect > targetAspect) {
                // Source is wider - constrain by width
                outWidth = options.width;
                outHeight = Math.round(options.width / srcAspect);
              } else {
                // Source is taller - constrain by height
                outHeight = options.height;
                outWidth = Math.round(options.height * srcAspect);
              }
            }
            // For 'fill' mode, we keep outWidth/outHeight as target dimensions
          }

          // Create canvas with calculated output dimensions
          const canvas = document.createElement('canvas');
          canvas.width = outWidth;
          canvas.height = outHeight;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Canvas not supported'));
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          if (options.maintainAspectRatio && options.fitMode === 'fill') {
            // Fill mode: crop center of source to match target aspect ratio
            const targetAspect = options.width / options.height;
            let sx = 0,
              sy = 0,
              sw = srcWidth,
              sh = srcHeight;

            if (srcAspect > targetAspect) {
              // Source is wider - crop sides
              sw = srcHeight * targetAspect;
              sx = (srcWidth - sw) / 2;
            } else {
              // Source is taller - crop top/bottom
              sh = srcWidth / targetAspect;
              sy = (srcHeight - sh) / 2;
            }

            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outWidth, outHeight);
          } else {
            // Fit mode or no aspect ratio: scale entire source to output
            ctx.drawImage(img, 0, 0, srcWidth, srcHeight, 0, 0, outWidth, outHeight);
          }

          // Clean up object URL
          URL.revokeObjectURL(objectUrl);

          // Create output blob
          canvas.toBlob(
            blob => {
              if (blob) {
                resolve({ blob, width: outWidth, height: outHeight });
              } else {
                reject(new Error('Failed to create image blob'));
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
    },
    [options]
  );

  const processSingleImage = useCallback(
    async (id: string) => {
      setImages(prev =>
        prev.map(img =>
          img.id === id ? { ...img, isProcessing: true, error: null, progress: 0 } : img
        )
      );

      try {
        const image = images.find(i => i.id === id);
        if (!image) throw new Error('Image not found');

        const result = await resizeImage(image);

        setImages(prev =>
          prev.map(img =>
            img.id === id
              ? {
                  ...img,
                  processedBlob: result.blob,
                  processedWidth: result.width,
                  processedHeight: result.height,
                  isProcessing: false,
                  progress: 100,
                }
              : img
          )
        );
      } catch (err) {
        setImages(prev =>
          prev.map(img =>
            img.id === id
              ? {
                  ...img,
                  isProcessing: false,
                  error: err instanceof Error ? err.message : 'Processing failed',
                  progress: 0,
                }
              : img
          )
        );
      }
    },
    [images, resizeImage]
  );

  const processAllImages = useCallback(async () => {
    setIsProcessingAll(true);
    const unprocessed = images.filter(img => !img.processedBlob && !img.isProcessing);

    for (const image of unprocessed) {
      await processSingleImage(image.id);
    }

    setIsProcessingAll(false);
    // Show upscaler CTA after processing completes
    setShowUpscalerCTA(true);
  }, [images, processSingleImage]);

  const downloadSingleImage = useCallback((image: IImageFile) => {
    if (!image.processedBlob) return;

    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const ext = mimeToExt[image.processedBlob.type] || 'jpg';
    const baseName = image.file.name.replace(/\.[^/.]+$/, '');

    const url = URL.createObjectURL(image.processedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}-resized.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const downloadAllAsZip = useCallback(async () => {
    const processed = images.filter(img => img.processedBlob);
    if (processed.length === 0) return;

    const zip = new JSZip();

    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };

    processed.forEach(image => {
      if (!image.processedBlob) return;

      const ext = mimeToExt[image.processedBlob.type] || 'jpg';
      const baseName = image.file.name.replace(/\.[^/.]+$/, '');
      const filename = `${baseName}-resized.${ext}`;

      zip.file(filename, image.processedBlob);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-resized-images-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [images]);

  const resetAll = useCallback(() => {
    images.forEach(img => {
      if (img.previewUrl) {
        URL.revokeObjectURL(img.previewUrl);
      }
    });
    setImages([]);
  }, [images]);

  const allProcessed = images.length > 0 && images.every(img => img.processedBlob);
  const anyProcessing = images.some(img => img.isProcessing);

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="p-6 border-2 border-border bg-surface shadow-lg rounded-xl">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-text-primary mb-2">{title}</h2>
          <p className="text-text-secondary">{description}</p>
        </div>

        {/* Settings Panel */}
        <div className="bg-surface-light/50 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-accent" />
            Resize Settings
          </h3>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Width */}
            <div>
              <label htmlFor="width" className="mb-2 block text-sm font-medium text-text-secondary">
                Width (px)
              </label>
              <input
                id="width"
                type="number"
                min={1}
                max={10000}
                value={options.width}
                onChange={e =>
                  setOptions(prev => ({ ...prev, width: parseInt(e.target.value) || 1 }))
                }
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-surface text-text-primary"
              />
            </div>

            {/* Height */}
            <div>
              <label
                htmlFor="height"
                className="mb-2 block text-sm font-medium text-text-secondary"
              >
                {options.maintainAspectRatio ? 'Height' : 'Height (px)'}
              </label>
              {options.maintainAspectRatio ? (
                <div className="w-full px-3 py-2 border border-border rounded-lg bg-surface/50 text-text-muted italic">
                  Auto (keeps aspect ratio)
                </div>
              ) : (
                <input
                  id="height"
                  type="number"
                  min={1}
                  max={10000}
                  value={options.height}
                  onChange={e =>
                    setOptions(prev => ({ ...prev, height: parseInt(e.target.value) || 1 }))
                  }
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-surface text-text-primary"
                />
              )}
            </div>

            {/* Format */}
            <div>
              <label
                htmlFor="format"
                className="mb-2 block text-sm font-medium text-text-secondary"
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
                <option value="jpeg">JPEG</option>
                <option value="png">PNG</option>
                <option value="webp">WebP</option>
              </select>
            </div>

            {/* Quality */}
            <div>
              <label
                htmlFor="quality"
                className="mb-2 block text-sm font-medium text-text-secondary"
              >
                Quality: {options.quality}%
              </label>
              <input
                id="quality"
                type="range"
                min={1}
                max={100}
                value={options.quality}
                onChange={e => setOptions(prev => ({ ...prev, quality: parseInt(e.target.value) }))}
                className="w-full"
              />
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
                className="w-4 h-4 text-accent border-border rounded focus:ring-accent"
              />
              <label
                htmlFor="aspect-ratio"
                className="text-sm font-medium text-text-secondary cursor-pointer"
              >
                Maintain aspect ratio
              </label>
            </div>

            {/* Fit Mode */}
            {options.maintainAspectRatio && (
              <div>
                <label
                  htmlFor="fit-mode"
                  className="mb-2 block text-sm font-medium text-text-secondary"
                >
                  Fit Mode
                </label>
                <select
                  id="fit-mode"
                  value={options.fitMode}
                  onChange={e =>
                    setOptions(prev => ({
                      ...prev,
                      fitMode: e.target.value as 'fit' | 'fill',
                    }))
                  }
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-surface text-text-primary"
                >
                  <option value="fit">Fit (within bounds)</option>
                  <option value="fill">Fill (may crop)</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Hidden file input - must be outside conditional to persist for "Add More" button */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileInput}
          aria-label="Upload images for bulk resizing"
          className="hidden"
        />

        {/* Upload Area */}
        {images.length === 0 ? (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer
              ${
                dragActive
                  ? 'border-accent bg-accent/10 scale-[1.02]'
                  : 'border-border hover:border-accent/50 bg-surface-light/30'
              }
            `}
          >
            <Upload className="w-16 h-16 mx-auto mb-4 text-accent" />
            <h3 className="text-xl font-semibold text-text-primary mb-2">
              Drag & Drop Images Here
            </h3>
            <p className="text-text-secondary mb-4">
              or click to browse • Up to {maxFiles} images at once
            </p>
            <p className="text-sm text-text-muted">Supports JPEG, PNG, and WebP formats</p>
          </div>
        ) : (
          <>
            {/* Image List */}
            <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto pr-2">
              {images.map(image => (
                <div
                  key={image.id}
                  className="bg-surface-light/50 rounded-lg p-4 flex items-center gap-4"
                >
                  {/* Thumbnail */}
                  <div className="relative w-16 h-16 flex-shrink-0">
                    <img
                      src={image.previewUrl}
                      alt={image.file.name}
                      className="w-full h-full object-cover rounded"
                    />
                    {image.processedBlob && (
                      <div className="absolute inset-0 bg-success/80 rounded flex items-center justify-center">
                        <Check className="w-6 h-6 text-text-primary" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {image.file.name}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {image.originalWidth} × {image.originalHeight}
                      {image.processedWidth && image.processedHeight ? (
                        <span className="text-success">
                          {' '}
                          → {image.processedWidth} × {image.processedHeight}
                        </span>
                      ) : (
                        <span className="text-text-muted">
                          {' '}
                          → {options.width} ×{' '}
                          {options.maintainAspectRatio ? '(auto)' : options.height}
                        </span>
                      )}
                    </p>
                    {image.error && <p className="text-xs text-error mt-1">{image.error}</p>}
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-3">
                    {image.isProcessing ? (
                      <div className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-accent animate-spin" />
                        <span className="text-xs text-text-secondary">Processing...</span>
                      </div>
                    ) : image.processedBlob ? (
                      <button
                        onClick={() => downloadSingleImage(image)}
                        className="p-2 text-accent hover:bg-accent/10 rounded-lg transition-colors"
                        title="Download this image"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    ) : image.error ? (
                      <button
                        onClick={() => processSingleImage(image.id)}
                        className="px-3 py-1 text-xs bg-accent text-text-primary rounded-lg hover:bg-accent-hover transition-colors"
                      >
                        Retry
                      </button>
                    ) : (
                      <button
                        onClick={() => processSingleImage(image.id)}
                        className="px-3 py-1 text-xs bg-surface text-text-secondary rounded-lg hover:bg-surface-light transition-colors"
                      >
                        Process
                      </button>
                    )}

                    <button
                      onClick={() => removeImage(image.id)}
                      className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add More Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 border-2 border-dashed border-border rounded-lg text-text-secondary hover:border-accent hover:text-accent transition-colors mb-4"
            >
              + Add More Images
            </button>
          </>
        )}

        {/* Action Buttons */}
        {images.length > 0 && (
          <div className="flex gap-3">
            {!allProcessed && (
              <button
                onClick={processAllImages}
                disabled={isProcessingAll || anyProcessing}
                className="flex-1 px-6 py-3 bg-accent text-text-primary font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isProcessingAll || anyProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  `Process All (${images.filter(i => !i.processedBlob).length})`
                )}
              </button>
            )}

            {allProcessed && (
              <button
                onClick={downloadAllAsZip}
                className="flex-1 px-6 py-3 bg-success text-text-primary font-medium rounded-lg hover:bg-success/90 transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download All as ZIP
              </button>
            )}

            <button
              onClick={resetAll}
              className="px-6 py-3 bg-surface-light text-text-secondary font-medium rounded-lg hover:bg-surface transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Info Footer */}
      <div className="mt-4 text-center text-sm text-text-secondary">
        <p>
          All processing happens in your browser using the Canvas API. Your images are never
          uploaded to our servers.
        </p>
      </div>

      {/* Upscaler CTA Modal */}
      {showUpscalerCTA && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Close button */}
            <button
              onClick={() => setShowUpscalerCTA(false)}
              className="absolute top-4 right-4 p-2 text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Success icon */}
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/20 flex items-center justify-center">
              <Check className="w-8 h-8 text-success" />
            </div>

            <h3 className="text-xl font-bold text-text-primary text-center mb-2">
              Images Resized Successfully!
            </h3>
            <p className="text-text-secondary text-center mb-6">
              Your {images.length} image{images.length > 1 ? 's have' : ' has'} been resized and
              ready to download.
            </p>

            {/* Divider */}
            <div className="border-t border-border my-6" />

            {/* Upsell */}
            <div className="bg-gradient-to-br from-accent/10 to-purple-500/10 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h4 className="font-semibold text-text-primary mb-1">
                    Want to enhance quality too?
                  </h4>
                  <p className="text-sm text-text-secondary">
                    Our AI upscaler can increase resolution up to 4x while enhancing details,
                    perfect for print or large displays.
                  </p>
                </div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="space-y-3">
              <Link
                href="/?signup=1"
                className="w-full px-6 py-3 bg-accent text-text-primary font-medium rounded-lg hover:bg-accent-hover transition-colors flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" />
                Try AI Upscaler Free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                onClick={() => {
                  downloadAllAsZip();
                  setShowUpscalerCTA(false);
                }}
                className="w-full px-6 py-3 bg-success text-text-primary font-medium rounded-lg hover:bg-success/90 transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download My Files
              </button>
            </div>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-4 mt-4 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <Check className="w-3 h-3 text-success" />
                10 free credits
              </span>
              <span className="flex items-center gap-1">
                <Check className="w-3 h-3 text-success" />
                No signup required
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
