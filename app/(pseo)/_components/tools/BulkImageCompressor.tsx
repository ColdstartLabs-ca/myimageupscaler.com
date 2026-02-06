'use client';

/**
 * Bulk Image Compressor Tool
 * Client-side bulk image compression using Canvas API
 * Target keywords: bulk image compressor, batch image compressor (480+ searches)
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Download,
  RefreshCw,
  AlertCircle,
  FileImage,
  X,
  Package,
  Sparkles,
  ArrowRight,
  Zap,
  Check,
} from 'lucide-react';
import JSZip from 'jszip';
import Link from 'next/link';

interface ICompressOptions {
  quality: number;
  targetSizeKB: number;
  format: 'jpeg' | 'png' | 'webp';
}

interface IImageFile {
  file: File;
  id: string;
  previewUrl: string;
  originalSize: number;
  compressedBlob: Blob | null;
  compressedSize: number;
  compressionRatio: number;
  isProcessing: boolean;
  error: string | null;
  originalDimensions: { width: number; height: number } | null;
}

export function BulkImageCompressor(): React.ReactElement {
  const [options, setOptions] = useState<ICompressOptions>({
    quality: 80,
    targetSizeKB: 0, // 0 means no target size
    format: 'jpeg',
  });

  const [images, setImages] = useState<IImageFile[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [showUpscalerCTA, setShowUpscalerCTA] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newImages: IImageFile[] = Array.from(files).map(file => ({
      file,
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      previewUrl: URL.createObjectURL(file),
      originalSize: file.size,
      compressedBlob: null,
      compressedSize: 0,
      compressionRatio: 0,
      isProcessing: false,
      error: null,
      originalDimensions: null,
    }));

    setImages(prev => [...prev, ...newImages]);
    setProcessedCount(0);
  }, []);

  const compressImage = useCallback(
    async (
      image: IImageFile,
      quality: number
    ): Promise<{ blob: Blob; dimensions: { width: number; height: number } } | null> => {
      return new Promise(resolve => {
        const img = document.createElement('img');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(null);
          return;
        }

        img.onload = () => {
          const dimensions = { width: img.width, height: img.height };
          canvas.width = img.width;
          canvas.height = img.height;

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0);

          canvas.toBlob(
            blob => {
              if (blob) {
                resolve({ blob, dimensions });
              } else {
                resolve(null);
              }
            },
            `image/${options.format}`,
            quality / 100
          );
        };

        img.onerror = () => resolve(null);
        img.src = URL.createObjectURL(image.file);
      });
    },
    [options.format]
  );

  const compressWithTargetSize = useCallback(
    async (
      image: IImageFile,
      targetKB: number
    ): Promise<{ blob: Blob; dimensions: { width: number; height: number } } | null> => {
      let minQuality = 1;
      let maxQuality = 100;
      let bestResult: { blob: Blob; dimensions: { width: number; height: number } } | null = null;
      const targetBytes = targetKB * 1024;

      // Binary search for optimal quality
      for (let i = 0; i < 10; i++) {
        const midQuality = Math.round((minQuality + maxQuality) / 2);
        const result = await compressImage(image, midQuality);

        if (!result) break;

        if (result.blob.size <= targetBytes) {
          bestResult = result;
          minQuality = midQuality;
        } else {
          maxQuality = midQuality;
        }

        // Early exit if we're close enough
        if (bestResult && Math.abs(bestResult.blob.size - targetBytes) < 100) {
          break;
        }
      }

      return bestResult;
    },
    [compressImage]
  );

  const processSingleImage = useCallback(
    async (imageId: string) => {
      setImages(prev =>
        prev.map(img =>
          img.id === imageId
            ? { ...img, isProcessing: true, error: null, compressedBlob: null }
            : img
        )
      );

      const image = images.find(img => img.id === imageId);
      if (!image) return;

      try {
        let result: { blob: Blob; dimensions: { width: number; height: number } } | null = null;

        if (options.targetSizeKB > 0) {
          result = await compressWithTargetSize(image, options.targetSizeKB);
        } else {
          result = await compressImage(image, options.quality);
        }

        if (result) {
          const compressedSize = result.blob.size;
          const compressionRatio = Math.round(
            ((image.originalSize - compressedSize) / image.originalSize) * 100
          );

          setImages(prev =>
            prev.map(img =>
              img.id === imageId
                ? {
                    ...img,
                    compressedBlob: result.blob,
                    compressedSize,
                    compressionRatio,
                    isProcessing: false,
                    originalDimensions: result.dimensions,
                  }
                : img
            )
          );
        } else {
          setImages(prev =>
            prev.map(img =>
              img.id === imageId
                ? { ...img, isProcessing: false, error: 'Failed to compress image' }
                : img
            )
          );
        }
      } catch {
        setImages(prev =>
          prev.map(img =>
            img.id === imageId ? { ...img, isProcessing: false, error: 'Compression failed' } : img
          )
        );
      }
    },
    [images, options.quality, options.targetSizeKB, compressImage, compressWithTargetSize]
  );

  const processAllImages = useCallback(async () => {
    setIsProcessingAll(true);
    setProcessedCount(0);

    for (const image of images) {
      if (!image.compressedBlob && !image.error) {
        await processSingleImage(image.id);
        setProcessedCount(prev => prev + 1);
      }
    }

    setIsProcessingAll(false);
    // Show upscaler CTA after processing completes
    setShowUpscalerCTA(true);
  }, [images, processSingleImage]);

  const downloadSingle = useCallback(
    (image: IImageFile) => {
      if (!image.compressedBlob) return;

      const ext = options.format === 'jpeg' ? 'jpg' : options.format;
      const baseName = image.file.name.replace(/\.[^/.]+$/, '');
      const url = URL.createObjectURL(image.compressedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}-compressed.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [options.format]
  );

  const downloadAllAsZip = useCallback(async () => {
    const zip = new JSZip();
    const ext = options.format === 'jpeg' ? 'jpg' : options.format;

    let count = 0;
    for (const image of images) {
      if (image.compressedBlob) {
        const baseName = image.file.name.replace(/\.[^/.]+$/, '');
        zip.file(`${baseName}-compressed.${ext}`, image.compressedBlob);
        count++;
      }
    }

    if (count === 0) return;

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compressed-images-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [images, options.format]);

  const removeImage = useCallback((imageId: string) => {
    setImages(prev => {
      const img = prev.find(i => i.id === imageId);
      if (img?.previewUrl) {
        URL.revokeObjectURL(img.previewUrl);
      }
      return prev.filter(i => i.id !== imageId);
    });
  }, []);

  const clearAll = useCallback(() => {
    images.forEach(img => {
      if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
    });
    setImages([]);
    setProcessedCount(0);
  }, [images]);

  const allProcessed = images.length > 0 && images.every(img => img.compressedBlob || img.error);
  const totalOriginalSize = images.reduce((sum, img) => sum + img.originalSize, 0);
  const totalCompressedSize = images.reduce((sum, img) => sum + (img.compressedBlob?.size || 0), 0);
  const totalSaved = totalOriginalSize - totalCompressedSize;
  const avgCompressionRatio =
    totalOriginalSize > 0 ? Math.round((totalSaved / totalOriginalSize) * 100) : 0;

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="p-6 border-2 border-border bg-surface shadow-lg rounded-xl">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-text-primary mb-2">Bulk Image Compressor</h2>
          <p className="text-text-secondary">
            Compress multiple images at once. All processing happens in your browser.
          </p>
        </div>

        {/* Hidden file input - must be outside conditional to persist */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={e => handleFileSelect(e.target.files)}
          aria-label="Upload images for bulk compression"
        />

        {/* Upload Area */}
        {images.length === 0 && (
          <div className="border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-accent/50 transition-colors">
            <FileImage className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold text-text-primary mb-2">
              Drop images here or click to upload
            </h3>
            <p className="text-text-secondary mb-4">
              Upload up to 20 images at once (JPEG, PNG, WebP)
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-colors"
            >
              Select Images
            </button>
          </div>
        )}

        {/* Add More Button */}
        {images.length > 0 && images.length < 20 && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full p-4 border-2 border-dashed border-border rounded-lg text-text-secondary hover:border-accent/50 hover:text-accent transition-colors flex items-center justify-center gap-2 mb-6"
          >
            <FileImage className="w-5 h-5" />
            Add More Images
          </button>
        )}

        {/* Controls - Always visible */}
        <div className="grid md:grid-cols-3 gap-6 mb-6 p-4 bg-surface-light rounded-lg">
          {/* Quality Slider */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label htmlFor="quality" className="text-sm font-medium text-text-secondary">
                Quality
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
              className="w-full h-2 bg-surface rounded-lg appearance-none cursor-pointer accent-accent"
            />
            <p className="text-xs text-text-muted mt-1">
              {options.quality < 50
                ? 'Lower quality, smaller files'
                : options.quality > 80
                  ? 'Higher quality, larger files'
                  : 'Balanced quality and size'}
            </p>
          </div>

          {/* Target Size (Optional) */}
          <div>
            <label
              htmlFor="targetSize"
              className="text-sm font-medium text-text-secondary mb-2 block"
            >
              Target Size (KB, optional)
            </label>
            <input
              id="targetSize"
              type="number"
              min={0}
              max={5000}
              step={10}
              value={options.targetSizeKB || ''}
              onChange={e =>
                setOptions(prev => ({ ...prev, targetSizeKB: parseInt(e.target.value) || 0 }))
              }
              placeholder="No limit"
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-text-primary"
            />
            <p className="text-xs text-text-muted mt-1">
              Leave empty for quality-based compression
            </p>
          </div>

          {/* Format */}
          <div>
            <label htmlFor="format" className="text-sm font-medium text-text-secondary mb-2 block">
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
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-text-primary"
            >
              <option value="jpeg">JPEG (best for photos)</option>
              <option value="webp">WebP (best compression)</option>
              <option value="png">PNG (lossless)</option>
            </select>
          </div>
        </div>

        {/* Image List */}
        {images.length > 0 && (
          <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
            {images.map(image => (
              <div
                key={image.id}
                className="flex items-center gap-4 p-3 bg-surface-light rounded-lg border border-border"
              >
                {/* Thumbnail */}
                <div className="relative w-16 h-16 flex-shrink-0">
                  <img
                    src={image.previewUrl}
                    alt={image.file.name}
                    className="w-full h-full object-cover rounded"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {image.file.name}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-text-secondary mt-1">
                    <span>{(image.originalSize / 1024).toFixed(0)}KB</span>
                    {image.originalDimensions && (
                      <span>
                        {image.originalDimensions.width} × {image.originalDimensions.height}
                      </span>
                    )}
                    {image.compressedBlob && (
                      <>
                        <span className="text-text-muted">→</span>
                        <span className="text-accent">
                          {(image.compressedSize / 1024).toFixed(0)}KB
                        </span>
                        <span className="text-success font-medium">
                          (-{image.compressionRatio}%)
                        </span>
                      </>
                    )}
                  </div>
                  {image.error && (
                    <p className="text-xs text-error mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {image.error}
                    </p>
                  )}
                  {image.isProcessing && (
                    <p className="text-xs text-accent mt-1 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Compressing...
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {image.compressedBlob && (
                    <button
                      onClick={() => downloadSingle(image)}
                      className="p-2 text-accent hover:bg-accent/10 rounded-lg transition-colors"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => removeImage(image.id)}
                    className="p-2 text-text-muted hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                    title="Remove"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary Stats */}
        {images.length > 0 && allProcessed && (
          <div className="mb-6 p-4 bg-surface-light rounded-lg">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-text-primary">{images.length}</p>
                <p className="text-xs text-text-secondary">Images</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">
                  {(totalOriginalSize / 1024).toFixed(0)}KB
                </p>
                <p className="text-xs text-text-secondary">Original</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-success">{avgCompressionRatio}%</p>
                <p className="text-xs text-text-secondary">Avg Reduction</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-accent">
                  {(totalCompressedSize / 1024).toFixed(0)}KB
                </p>
                <p className="text-xs text-text-secondary">Compressed</p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {images.length > 0 && (
          <div className="flex gap-3">
            {!allProcessed && (
              <button
                onClick={processAllImages}
                disabled={isProcessingAll}
                className="flex-1 px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isProcessingAll ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Processing {processedCount}/{images.length}...
                  </>
                ) : (
                  `Compress ${images.length} Image${images.length > 1 ? 's' : ''}`
                )}
              </button>
            )}

            {allProcessed && (
              <button
                onClick={downloadAllAsZip}
                className="flex-1 px-6 py-3 bg-success text-white font-medium rounded-lg hover:bg-success/90 transition-colors flex items-center justify-center gap-2"
              >
                <Package className="w-4 h-4" />
                Download All as ZIP
              </button>
            )}

            <button
              onClick={clearAll}
              className="px-6 py-3 bg-surface text-text-secondary font-medium rounded-lg hover:bg-surface-light transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="mt-4 p-4 bg-surface rounded-lg text-sm text-text-secondary">
        <p className="font-medium mb-2">Tips:</p>
        <ul className="space-y-1 ml-4 list-disc">
          <li>70-80% quality is optimal for web use</li>
          <li>WebP format offers best compression with modern browser support</li>
          <li>Set a target size (KB) to automatically find the best quality</li>
        </ul>
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
              Images Compressed Successfully!
            </h3>
            <p className="text-text-secondary text-center mb-2">
              You saved <span className="text-success font-semibold">{avgCompressionRatio}%</span>{' '}
              on {images.length} image{images.length > 1 ? 's' : ''}.
            </p>
            <p className="text-text-muted text-center text-sm mb-6">
              Download your files below or try our premium tools.
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
                  <h4 className="font-semibold text-text-primary mb-1">Need higher resolution?</h4>
                  <p className="text-sm text-text-secondary">
                    Our AI upscaler can increase resolution up to 4x while enhancing details and
                    sharpness.
                  </p>
                </div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="space-y-3">
              <Link
                href="/?signup=1"
                className="w-full px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-colors flex items-center justify-center gap-2"
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
                className="w-full px-6 py-3 bg-success text-white font-medium rounded-lg hover:bg-success/90 transition-colors flex items-center justify-center gap-2"
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
