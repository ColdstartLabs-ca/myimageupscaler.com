'use client';

/**
 * Image to PDF Converter Tool
 * Client-side PDF generation from images using pdf-lib (lazy-loaded)
 * Target keywords: image to pdf converter, jpg to pdf, png to pdf online
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  RefreshCw,
  AlertCircle,
  FileImage,
  X,
  ChevronUp,
  ChevronDown,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type PageSize = 'a4' | 'letter' | 'fit';
type MarginSize = 'none' | 'small' | 'medium' | 'large';

interface IImageEntry {
  id: string;
  file: File;
  previewUrl: string;
  sizeBytes: number;
}

interface IConvertOptions {
  pageSize: PageSize;
  margin: MarginSize;
}

const PAGE_SIZE_LABELS: Record<PageSize, string> = {
  a4: 'A4 (210 × 297mm)',
  letter: 'Letter (8.5 × 11in)',
  fit: 'Fit to Image',
};

const MARGIN_PX: Record<MarginSize, number> = {
  none: 0,
  small: 20,
  medium: 40,
  large: 72,
};

// Points (1pt = 1/72 inch). A4: 595×842, Letter: 612×792
const PAGE_DIMENSIONS: Record<Exclude<PageSize, 'fit'>, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

const DEFAULT_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_IMAGES = 30;
const MAX_FILE_MB = 20;

interface IImageToPdfConverterProps {
  acceptedInputFormats?: readonly string[];
}

export function ImageToPdfConverter({
  acceptedInputFormats = Array.from(DEFAULT_ACCEPTED_TYPES),
}: IImageToPdfConverterProps): React.ReactElement {
  const normalizedAcceptedFormats = acceptedInputFormats.filter(
    format => format === 'image/jpeg' || format === 'image/png' || format === 'image/webp'
  );
  const acceptedFormats: string[] =
    normalizedAcceptedFormats.length > 0
      ? normalizedAcceptedFormats
      : Array.from(DEFAULT_ACCEPTED_TYPES);

  const [images, setImages] = useState<IImageEntry[]>([]);
  const [options, setOptions] = useState<IConvertOptions>({
    pageSize: 'a4',
    margin: 'medium',
  });
  const [isConverting, setIsConverting] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragSrcId = useRef<string | null>(null);
  const imagesRef = useRef<IImageEntry[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach(entry => URL.revokeObjectURL(entry.previewUrl));
    };
  }, []);

  const addFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setError(null);
      setPdfBlob(null);

      const newEntries: IImageEntry[] = [];
      const skipped: string[] = [];

      for (const file of Array.from(files)) {
        if (!acceptedFormats.includes(file.type)) {
          skipped.push(file.name);
          continue;
        }
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          skipped.push(`${file.name} (too large)`);
          continue;
        }
        newEntries.push({
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          file,
          previewUrl: URL.createObjectURL(file),
          sizeBytes: file.size,
        });
      }

      setImages(prev => {
        const combined = [...prev, ...newEntries];
        if (combined.length > MAX_IMAGES) {
          combined.slice(MAX_IMAGES).forEach(e => URL.revokeObjectURL(e.previewUrl));
          return combined.slice(0, MAX_IMAGES);
        }
        return combined;
      });

      if (skipped.length > 0) {
        setError(
          `Skipped ${skipped.length} file(s): unsupported format or too large. Accepted formats up to ${MAX_FILE_MB}MB.`
        );
      }
    },
    [acceptedFormats]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      addFiles(e.target.files);
      e.target.value = '';
    },
    [addFiles]
  );

  const removeImage = useCallback((id: string) => {
    setImages(prev => {
      const entry = prev.find(e => e.id === id);
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter(e => e.id !== id);
    });
    setPdfBlob(null);
  }, []);

  const moveImage = useCallback((id: string, direction: 'up' | 'down') => {
    setImages(prev => {
      const idx = prev.findIndex(e => e.id === id);
      if (idx === -1) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
    setPdfBlob(null);
  }, []);

  // Drag-to-reorder handlers for the thumbnail list
  const handleItemDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, id: string) => {
    dragSrcId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleItemDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(id);
  }, []);

  const handleItemDrop = useCallback((e: React.DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    const srcId = dragSrcId.current;
    if (!srcId || srcId === targetId) return;

    setImages(prev => {
      const srcIdx = prev.findIndex(e => e.id === srcId);
      const tgtIdx = prev.findIndex(e => e.id === targetId);
      if (srcIdx === -1 || tgtIdx === -1) return prev;
      const next = [...prev];
      const [removed] = next.splice(srcIdx, 1);
      next.splice(tgtIdx, 0, removed);
      return next;
    });
    setPdfBlob(null);
    dragSrcId.current = null;
  }, []);

  const handleItemDragEnd = useCallback(() => {
    setDragOverId(null);
    dragSrcId.current = null;
  }, []);

  const convertToPdf = useCallback(async () => {
    if (images.length === 0) return;

    setError(null);
    setIsConverting(true);
    setPdfBlob(null);

    try {
      // eslint-disable-next-line no-restricted-syntax -- Dynamic import required for lazy-loading pdf-lib (~180KB)
      const { PDFDocument } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();
      const marginPt = MARGIN_PX[options.margin];

      for (const entry of images) {
        const arrayBuffer = await entry.file.arrayBuffer();

        // Determine embed method based on type
        // pdf-lib supports JPEG and PNG natively; WebP must be converted via canvas
        let pdfImage;
        if (entry.file.type === 'image/png') {
          pdfImage = await pdfDoc.embedPng(arrayBuffer);
        } else if (entry.file.type === 'image/jpeg') {
          pdfImage = await pdfDoc.embedJpg(arrayBuffer);
        } else {
          // WebP: render to canvas and re-encode as JPEG
          const jpegBlob = await new Promise<Blob>((resolve, reject) => {
            const img = document.createElement('img');
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                reject(new Error('Canvas not available'));
                return;
              }
              ctx.drawImage(img, 0, 0);
              canvas.toBlob(
                b => {
                  if (b) resolve(b);
                  else reject(new Error('Failed to convert WebP to JPEG'));
                },
                'image/jpeg',
                0.92
              );
            };
            img.onerror = () => reject(new Error(`Failed to load image: ${entry.file.name}`));
            img.src = entry.previewUrl;
          });
          const jpegBuffer = await jpegBlob.arrayBuffer();
          pdfImage = await pdfDoc.embedJpg(jpegBuffer);
        }

        const { width: imgW, height: imgH } = pdfImage;

        let pageW: number;
        let pageH: number;

        if (options.pageSize === 'fit') {
          pageW = imgW + marginPt * 2;
          pageH = imgH + marginPt * 2;
        } else {
          const [pw, ph] = PAGE_DIMENSIONS[options.pageSize];
          // Choose portrait or landscape based on image orientation
          if (imgW > imgH && pw < ph) {
            pageW = ph;
            pageH = pw;
          } else {
            pageW = pw;
            pageH = ph;
          }
        }

        const page = pdfDoc.addPage([pageW, pageH]);

        const drawW = pageW - marginPt * 2;
        const drawH = pageH - marginPt * 2;
        const aspectRatio = imgW / imgH;

        let finalW = drawW;
        let finalH = drawW / aspectRatio;

        if (finalH > drawH) {
          finalH = drawH;
          finalW = drawH * aspectRatio;
        }

        const x = marginPt + (drawW - finalW) / 2;
        const y = marginPt + (drawH - finalH) / 2;

        page.drawImage(pdfImage, { x, y, width: finalW, height: finalH });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      setPdfBlob(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF creation failed. Please try again.');
    } finally {
      setIsConverting(false);
    }
  }, [images, options]);

  const downloadPdf = useCallback(() => {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `images-to-pdf-${Date.now()}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [pdfBlob]);

  const clearAll = useCallback(() => {
    images.forEach(e => URL.revokeObjectURL(e.previewUrl));
    setImages([]);
    setPdfBlob(null);
    setError(null);
  }, [images]);

  const totalSizeKB = images.reduce((sum, e) => sum + e.sizeBytes, 0) / 1024;

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="p-6 border-2 border-border bg-surface shadow-lg rounded-xl">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-primary mb-2">Image to PDF Converter</h2>
          <p className="text-muted-foreground">
            Combine multiple images into a single PDF document. Drag to reorder. All processing
            happens in your browser.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-4 bg-error/10 border border-error/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-error flex-shrink-0 mt-0.5" />
            <p className="text-sm text-primary">{error}</p>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedFormats.join(',')}
          multiple
          onChange={handleInputChange}
          className="hidden"
          aria-label="Upload images to convert to PDF"
        />

        {/* Upload Area */}
        {images.length === 0 && (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              'border-2 border-dashed rounded-lg p-12 text-center transition-all cursor-pointer',
              isDragging
                ? 'border-accent bg-surface-light'
                : 'border-border bg-surface hover:border-accent hover:bg-surface-light'
            )}
          >
            <FileImage
              className={cn(
                'w-12 h-12 mx-auto mb-4',
                isDragging ? 'text-accent' : 'text-muted-foreground'
              )}
            />
            <p className="text-lg font-medium text-primary mb-2">
              {isDragging ? 'Drop images here' : 'Drop images here or click to browse'}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Supports JPEG, PNG, WebP up to {MAX_FILE_MB}MB each &middot; max {MAX_IMAGES} images
            </p>
            <div className="inline-block px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-colors">
              Select Images
            </div>
          </div>
        )}

        {/* Add More */}
        {images.length > 0 && images.length < MAX_IMAGES && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full p-4 mb-6 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-accent/50 hover:text-accent transition-colors flex items-center justify-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Add More Images ({images.length}/{MAX_IMAGES})
          </button>
        )}

        {/* Options */}
        {images.length > 0 && (
          <div className="grid md:grid-cols-2 gap-6 mb-6 p-4 bg-surface-light rounded-lg border border-border">
            {/* Page Size */}
            <div>
              <label
                htmlFor="page-size"
                className="block text-sm font-medium text-muted-foreground mb-2"
              >
                Page Size
              </label>
              <select
                id="page-size"
                value={options.pageSize}
                onChange={e => {
                  setOptions(prev => ({ ...prev, pageSize: e.target.value as PageSize }));
                  setPdfBlob(null);
                }}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-primary"
              >
                {(Object.keys(PAGE_SIZE_LABELS) as PageSize[]).map(key => (
                  <option key={key} value={key}>
                    {PAGE_SIZE_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>

            {/* Margin */}
            <div>
              <label
                htmlFor="margin"
                className="block text-sm font-medium text-muted-foreground mb-2"
              >
                Page Margin
              </label>
              <select
                id="margin"
                value={options.margin}
                onChange={e => {
                  setOptions(prev => ({ ...prev, margin: e.target.value as MarginSize }));
                  setPdfBlob(null);
                }}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-primary"
              >
                <option value="none">No Margin</option>
                <option value="small">Small (7mm)</option>
                <option value="medium">Medium (14mm)</option>
                <option value="large">Large (25mm)</option>
              </select>
            </div>
          </div>
        )}

        {/* Image List */}
        {images.length > 0 && (
          <div className="space-y-2 mb-6 max-h-[480px] overflow-y-auto pr-1">
            {images.map((entry, idx) => (
              <div
                key={entry.id}
                draggable
                onDragStart={e => handleItemDragStart(e, entry.id)}
                onDragOver={e => handleItemDragOver(e, entry.id)}
                onDrop={e => handleItemDrop(e, entry.id)}
                onDragEnd={handleItemDragEnd}
                className={cn(
                  'flex items-center gap-3 p-3 bg-surface-light rounded-lg border transition-colors',
                  dragOverId === entry.id ? 'border-accent bg-accent/5' : 'border-border'
                )}
              >
                {/* Drag handle */}
                <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0 cursor-grab active:cursor-grabbing" />

                {/* Page number */}
                <span className="text-xs font-medium text-muted-foreground w-5 text-center flex-shrink-0">
                  {idx + 1}
                </span>

                {/* Thumbnail */}
                <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden border border-border">
                  <img
                    src={entry.previewUrl}
                    alt={entry.file.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary truncate">{entry.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(entry.sizeBytes / 1024).toFixed(0)}KB &middot;{' '}
                    {entry.file.type.split('/')[1].toUpperCase()}
                  </p>
                </div>

                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => moveImage(entry.id, 'up')}
                    disabled={idx === 0}
                    className="p-1 rounded text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
                    title="Move up"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => moveImage(entry.id, 'down')}
                    disabled={idx === images.length - 1}
                    className="p-1 rounded text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
                    title="Move down"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>

                {/* Remove */}
                <button
                  onClick={() => removeImage(entry.id)}
                  className="p-2 text-muted-foreground hover:text-error hover:bg-error/10 rounded-lg transition-colors flex-shrink-0"
                  title="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {images.length > 0 && (
          <div className="mb-4 text-sm text-muted-foreground flex items-center gap-4">
            <span>
              {images.length} image{images.length !== 1 ? 's' : ''}
            </span>
            <span>{totalSizeKB.toFixed(0)}KB total</span>
            {pdfBlob && (
              <span className="text-accent font-medium">
                PDF: {(pdfBlob.size / 1024).toFixed(0)}KB
              </span>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {images.length > 0 && (
          <div className="flex gap-3">
            <button
              onClick={convertToPdf}
              disabled={isConverting}
              className="flex-1 px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isConverting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Creating PDF...
                </>
              ) : (
                <>
                  <FileImage className="w-4 h-4" />
                  Create PDF
                </>
              )}
            </button>

            {pdfBlob && (
              <button
                onClick={downloadPdf}
                className="flex-1 px-6 py-3 bg-success text-white font-medium rounded-lg hover:bg-success/90 transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
            )}

            <button
              onClick={clearAll}
              className="px-6 py-3 bg-surface-light text-muted-foreground font-medium rounded-lg hover:bg-surface-light transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Clear All
            </button>
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
