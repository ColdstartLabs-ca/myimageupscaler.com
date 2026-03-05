'use client';

/**
 * PDF to Image Converter Tool
 * Client-side PDF page rendering using pdfjs-dist (lazy-loaded)
 * Target keywords: pdf to image converter, convert pdf to jpg, pdf to png online
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  RefreshCw,
  AlertCircle,
  FileText,
  Package,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type OutputFormat = 'jpeg' | 'png';
type DpiOption = 72 | 150 | 300;

interface IConvertedPage {
  pageNumber: number;
  blob: Blob;
  previewUrl: string;
}

const DPI_LABELS: Record<DpiOption, string> = {
  72: '72 DPI (Screen)',
  150: '150 DPI (Standard)',
  300: '300 DPI (Print)',
};

interface IPdfToImageConverterProps {
  defaultOutputFormat?: OutputFormat;
  defaultDpi?: DpiOption;
}

export function PdfToImageConverter({
  defaultOutputFormat = 'jpeg',
  defaultDpi = 150,
}: IPdfToImageConverterProps): React.ReactElement {
  const initialOutputFormat: OutputFormat = defaultOutputFormat === 'png' ? 'png' : 'jpeg';
  const initialDpi: DpiOption = defaultDpi === 72 || defaultDpi === 300 ? defaultDpi : 150;

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [pageFrom, setPageFrom] = useState<number>(1);
  const [pageTo, setPageTo] = useState<number>(1);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>(initialOutputFormat);
  const [dpi, setDpi] = useState<DpiOption>(initialDpi);
  const [isLoading, setIsLoading] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [convertedPages, setConvertedPages] = useState<IConvertedPage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewPage, setPreviewPage] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const convertedPagesRef = useRef<IConvertedPage[]>([]);

  const revokePreviewUrls = useCallback((pages: IConvertedPage[]) => {
    pages.forEach(page => URL.revokeObjectURL(page.previewUrl));
  }, []);

  useEffect(() => {
    convertedPagesRef.current = convertedPages;
  }, [convertedPages]);

  useEffect(() => {
    return () => {
      revokePreviewUrls(convertedPagesRef.current);
    };
  }, [revokePreviewUrls]);

  const loadPdf = useCallback(
    async (file: File) => {
      setError(null);
      setIsLoading(true);
      // Revoke existing preview URLs before clearing to prevent memory leaks
      setConvertedPages(prev => {
        revokePreviewUrls(prev);
        return [];
      });
      setConvertProgress(null);

      try {
        const arrayBuffer = await file.arrayBuffer();
        // eslint-disable-next-line no-restricted-syntax -- Dynamic import required for lazy-loading pdfjs-dist (~400KB)
        const pdfjsLib = await import('pdfjs-dist');
        // Use webpack-bundled worker (served from same origin) to satisfy CSP worker-src 'self' blob:
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const count = pdf.numPages;

        setPageCount(count);
        setPageFrom(1);
        setPageTo(count);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load PDF. Please try another file.'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [revokePreviewUrls]
  );

  const handleFileSelect = useCallback(
    (file: File) => {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setError('Please select a valid PDF file.');
        return;
      }

      if (file.size > 50 * 1024 * 1024) {
        setError('File size must be less than 50MB.');
        return;
      }

      setPdfFile(file);
      loadPdf(file);
    },
    [loadPdf]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
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
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
      e.target.value = '';
    },
    [handleFileSelect]
  );

  const convertPages = useCallback(async () => {
    if (!pdfFile || !pageCount) return;

    setError(null);
    setIsConverting(true);
    // Revoke existing preview URLs before clearing to prevent memory leaks
    setConvertedPages(prev => {
      revokePreviewUrls(prev);
      return [];
    });
    setPreviewPage(0);

    const from = Math.max(1, Math.min(pageFrom, pageCount));
    const to = Math.max(from, Math.min(pageTo, pageCount));
    const total = to - from + 1;
    setConvertProgress({ current: 0, total });

    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      // eslint-disable-next-line no-restricted-syntax -- Dynamic import required for lazy-loading pdfjs-dist (~400KB)
      const pdfjsLib = await import('pdfjs-dist');
      // Use webpack-bundled worker (served from same origin) to satisfy CSP worker-src 'self' blob:
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const results: IConvertedPage[] = [];

      for (let pageNum = from; pageNum <= to; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const scale = dpi / 72;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');

        if (!context) {
          throw new Error('Canvas 2D context not available.');
        }

        await page.render({ canvasContext: context, canvas, viewport }).promise;

        const mimeType = outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
        const quality = outputFormat === 'jpeg' ? 0.92 : undefined;

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            b => {
              if (b) resolve(b);
              else reject(new Error(`Failed to convert page ${pageNum}`));
            },
            mimeType,
            quality
          );
        });

        const previewUrl = URL.createObjectURL(blob);
        results.push({ pageNumber: pageNum, blob, previewUrl });

        setConvertProgress({ current: pageNum - from + 1, total });
      }

      setConvertedPages(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed. Please try again.');
    } finally {
      setIsConverting(false);
      setConvertProgress(null);
    }
  }, [pdfFile, pageCount, pageFrom, pageTo, dpi, outputFormat, revokePreviewUrls]);

  const downloadSingle = useCallback(
    (page: IConvertedPage) => {
      const ext = outputFormat === 'jpeg' ? 'jpg' : 'png';
      const baseName = pdfFile?.name.replace(/\.pdf$/i, '') ?? 'document';
      const url = URL.createObjectURL(page.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}-page-${page.pageNumber}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [outputFormat, pdfFile]
  );

  const downloadAllAsZip = useCallback(async () => {
    if (convertedPages.length === 0) return;

    if (convertedPages.length === 1) {
      downloadSingle(convertedPages[0]);
      return;
    }

    // eslint-disable-next-line no-restricted-syntax -- Dynamic import required for lazy-loading jszip
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const ext = outputFormat === 'jpeg' ? 'jpg' : 'png';
    const baseName = pdfFile?.name.replace(/\.pdf$/i, '') ?? 'document';

    for (const page of convertedPages) {
      zip.file(`${baseName}-page-${page.pageNumber}.${ext}`, page.blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}-images.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [convertedPages, downloadSingle, outputFormat, pdfFile]);

  const handleReset = useCallback(() => {
    revokePreviewUrls(convertedPages);
    setPdfFile(null);
    setPageCount(0);
    setPageFrom(1);
    setPageTo(1);
    setConvertedPages([]);
    setError(null);
    setConvertProgress(null);
    setPreviewPage(0);
  }, [convertedPages, revokePreviewUrls]);

  const clampPageFrom = useCallback(
    (val: number) => {
      const clamped = Math.max(1, Math.min(val, pageCount));
      setPageFrom(clamped);
      if (clamped > pageTo) setPageTo(clamped);
    },
    [pageCount, pageTo]
  );

  const clampPageTo = useCallback(
    (val: number) => {
      const clamped = Math.max(pageFrom, Math.min(val, pageCount));
      setPageTo(clamped);
    },
    [pageFrom, pageCount]
  );

  const currentPreview = convertedPages[previewPage] ?? null;

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="p-6 border-2 border-border bg-surface shadow-lg rounded-xl">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-primary mb-2">PDF to Image Converter</h2>
          <p className="text-muted-foreground">
            Convert PDF pages to high-quality JPEG or PNG images. All processing happens in your
            browser.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-4 bg-error/10 border border-error/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-error flex-shrink-0 mt-0.5" />
            <p className="text-sm text-primary">{error}</p>
          </div>
        )}

        {/* Upload Area */}
        {!pdfFile && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleInputChange}
              className="hidden"
              aria-label="Upload PDF file"
            />
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
              <FileText
                className={cn(
                  'w-12 h-12 mx-auto mb-4',
                  isDragging ? 'text-accent' : 'text-muted-foreground'
                )}
              />
              <p className="text-lg font-medium text-primary mb-2">
                {isDragging ? 'Drop your PDF here' : 'Drop your PDF here or click to browse'}
              </p>
              <p className="text-sm text-muted-foreground mb-4">Supports PDF files up to 50MB</p>
              <div className="inline-block px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-colors">
                Choose PDF File
              </div>
            </div>
          </>
        )}

        {/* Loading PDF */}
        {isLoading && (
          <div className="py-8 text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-accent" />
            <p className="text-muted-foreground">Loading PDF...</p>
          </div>
        )}

        {/* PDF Loaded - Settings */}
        {pdfFile && pageCount > 0 && !isLoading && (
          <div className="space-y-6">
            {/* PDF Info */}
            <div className="flex items-center gap-3 p-4 bg-surface-light rounded-lg border border-border">
              <FileText className="w-6 h-6 text-accent flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-primary truncate">{pdfFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {pageCount} page{pageCount !== 1 ? 's' : ''} &middot;{' '}
                  {(pdfFile.size / 1024 / 1024).toFixed(2)}MB
                </p>
              </div>
              <button
                onClick={handleReset}
                className="p-2 text-muted-foreground hover:text-error hover:bg-error/10 rounded-lg transition-colors flex-shrink-0"
                title="Remove PDF"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Options Grid */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Page Range */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-3">
                  Page Range
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label htmlFor="page-from" className="block text-xs text-muted-foreground mb-1">
                      From
                    </label>
                    <input
                      id="page-from"
                      type="number"
                      min={1}
                      max={pageCount}
                      value={pageFrom}
                      onChange={e => clampPageFrom(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-primary"
                    />
                  </div>
                  <span className="text-muted-foreground mt-5">to</span>
                  <div className="flex-1">
                    <label htmlFor="page-to" className="block text-xs text-muted-foreground mb-1">
                      To
                    </label>
                    <input
                      id="page-to"
                      type="number"
                      min={pageFrom}
                      max={pageCount}
                      value={pageTo}
                      onChange={e => clampPageTo(parseInt(e.target.value) || pageFrom)}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-primary"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {pageTo - pageFrom + 1} page{pageTo - pageFrom + 1 !== 1 ? 's' : ''} selected of{' '}
                  {pageCount}
                </p>
              </div>

              {/* Output Format */}
              <div>
                <label
                  htmlFor="output-format"
                  className="block text-sm font-medium text-muted-foreground mb-3"
                >
                  Output Format
                </label>
                <select
                  id="output-format"
                  value={outputFormat}
                  onChange={e => setOutputFormat(e.target.value as OutputFormat)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-primary"
                >
                  <option value="jpeg">JPEG (smaller files, best for photos)</option>
                  <option value="png">PNG (lossless, best for graphics)</option>
                </select>
              </div>

              {/* DPI */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-muted-foreground mb-3">
                  Resolution (DPI)
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {([72, 150, 300] as DpiOption[]).map(d => (
                    <button
                      key={d}
                      onClick={() => setDpi(d)}
                      className={cn(
                        'px-4 py-3 rounded-lg border text-sm font-medium transition-colors text-center',
                        dpi === d
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border bg-surface text-muted-foreground hover:border-accent/50'
                      )}
                    >
                      {DPI_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Convert Button */}
            <div className="flex gap-3">
              <button
                onClick={convertPages}
                disabled={isConverting}
                className="flex-1 px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isConverting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    {convertProgress
                      ? `Converting page ${convertProgress.current} of ${convertProgress.total}...`
                      : 'Converting...'}
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Convert{pageTo - pageFrom + 1 > 1 ? ` ${pageTo - pageFrom + 1} Pages` : ' Page'}
                  </>
                )}
              </button>

              {convertedPages.length > 0 && (
                <button
                  onClick={downloadAllAsZip}
                  className="flex-1 px-6 py-3 bg-success text-white font-medium rounded-lg hover:bg-success/90 transition-colors flex items-center justify-center gap-2"
                >
                  {convertedPages.length > 1 ? (
                    <>
                      <Package className="w-4 h-4" />
                      Download ZIP ({convertedPages.length} images)
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Download Image
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Preview of converted pages */}
            {convertedPages.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-primary">
                    Converted Pages ({convertedPages.length})
                  </h3>
                  {convertedPages.length > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPreviewPage(p => Math.max(0, p - 1))}
                        disabled={previewPage === 0}
                        className="p-1 rounded text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <span className="text-sm text-muted-foreground">
                        {previewPage + 1} / {convertedPages.length}
                      </span>
                      <button
                        onClick={() =>
                          setPreviewPage(p => Math.min(convertedPages.length - 1, p + 1))
                        }
                        disabled={previewPage === convertedPages.length - 1}
                        className="p-1 rounded text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>

                {currentPreview && (
                  <div className="border border-border rounded-lg overflow-hidden bg-surface-light">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                      <span className="text-sm font-medium text-muted-foreground">
                        Page {currentPreview.pageNumber}
                      </span>
                      <button
                        onClick={() => downloadSingle(currentPreview)}
                        className="flex items-center gap-1 text-sm text-accent hover:text-accent/80 transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </button>
                    </div>
                    <div className="p-4 flex justify-center">
                      <img
                        src={currentPreview.previewUrl}
                        alt={`Page ${currentPreview.pageNumber}`}
                        className="max-w-full max-h-96 object-contain rounded shadow-sm"
                      />
                    </div>
                    <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
                      {(currentPreview.blob.size / 1024).toFixed(0)}KB &middot;{' '}
                      {outputFormat.toUpperCase()} &middot; {dpi} DPI
                    </div>
                  </div>
                )}

                {/* Thumbnail strip for multiple pages */}
                {convertedPages.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {convertedPages.map((page, idx) => (
                      <button
                        key={page.pageNumber}
                        onClick={() => setPreviewPage(idx)}
                        className={cn(
                          'flex-shrink-0 w-16 h-20 rounded border-2 overflow-hidden transition-colors',
                          previewPage === idx
                            ? 'border-accent'
                            : 'border-border hover:border-accent/50'
                        )}
                      >
                        <img
                          src={page.previewUrl}
                          alt={`Page ${page.pageNumber}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info Footer */}
      <div className="mt-4 text-center text-sm text-muted-foreground">
        <p>All processing happens in your browser. Your PDF is never uploaded to our servers.</p>
      </div>
    </div>
  );
}
