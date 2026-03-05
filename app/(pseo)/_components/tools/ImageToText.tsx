'use client';

/**
 * Image to Text (OCR) Tool
 * Client-side OCR using tesseract.js (WASM, lazy-loaded ~5MB)
 * Target keywords: image to text, extract text from image, OCR online
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Upload,
  Loader2,
  Copy,
  Download,
  RefreshCw,
  AlertCircle,
  Check,
  ArrowRight,
} from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

type OcrStatus = 'idle' | 'loading' | 'recognizing' | 'done' | 'error';

type TesseractLang = 'eng' | 'spa' | 'fra' | 'deu';

interface ITesseractLogger {
  status: string;
  progress: number;
}

interface ITesseractResult {
  data: {
    text: string;
  };
}

interface ITesseractModule {
  recognize: (
    file: File | string,
    lang: string,
    options?: { logger?: (m: ITesseractLogger) => void }
  ) => Promise<ITesseractResult>;
}

const LANGUAGE_OPTIONS: { value: TesseractLang; label: string }[] = [
  { value: 'eng', label: 'English' },
  { value: 'spa', label: 'Spanish' },
  { value: 'fra', label: 'French' },
  { value: 'deu', label: 'German' },
];

export function ImageToText(): React.ReactElement {
  const [status, setStatus] = useState<OcrStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [extractedText, setExtractedText] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<TesseractLang>('eng');
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const runOcr = useCallback(async (file: File, lang: TesseractLang) => {
    setStatus('loading');
    setProgress(0);
    setExtractedText('');
    setError(null);

    try {
      // eslint-disable-next-line no-restricted-syntax -- Dynamic import required for lazy-loading tesseract.js (~5MB WASM)
      const Tesseract = (await import('tesseract.js')) as ITesseractModule;
      setStatus('recognizing');

      const result = await Tesseract.recognize(file, lang, {
        logger: (m: ITesseractLogger) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });

      setExtractedText(result.data.text.trim());
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR failed. Please try again.');
      setStatus('error');
    }
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      const accepted = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/bmp',
        'image/tiff',
      ];
      if (!accepted.includes(file.type)) {
        setError('Invalid format. Accepted: JPEG, PNG, WebP, BMP, TIFF');
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        setError('File size must be less than 20MB');
        return;
      }

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setCurrentFile(file);
      setError(null);
      void runOcr(file, selectedLang);
    },
    [runOcr, selectedLang]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
        e.target.value = '';
      }
    },
    [handleFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleRetry = useCallback(() => {
    if (currentFile) {
      void runOcr(currentFile, selectedLang);
    }
  }, [currentFile, runOcr, selectedLang]);

  const handleReset = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setCurrentFile(null);
    setStatus('idle');
    setProgress(0);
    setExtractedText('');
    setError(null);
    setCopied(false);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!extractedText) return;
    try {
      await navigator.clipboard.writeText(extractedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers that don't support clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = extractedText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [extractedText]);

  const handleDownloadTxt = useCallback(() => {
    if (!extractedText) return;
    const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const baseName = currentFile ? currentFile.name.replace(/\.[^/.]+$/, '') : 'extracted-text';
    a.href = url;
    a.download = `${baseName}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [extractedText, currentFile]);

  const handleLangChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const lang = e.target.value as TesseractLang;
      setSelectedLang(lang);
      // If there's already a file, re-run OCR with new language
      if (currentFile && (status === 'done' || status === 'error')) {
        void runOcr(currentFile, lang);
      }
    },
    [currentFile, status, runOcr]
  );

  const isProcessing = status === 'loading' || status === 'recognizing';

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="p-6 border-2 border-border bg-surface shadow-lg rounded-xl">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-primary mb-2">Extract Text from Image (OCR)</h2>
          <p className="text-muted-foreground">
            Upload an image and extract all text from it instantly. Powered by Tesseract OCR,
            running entirely in your browser.
          </p>
        </div>

        {/* Language Selector */}
        <div className="mb-4">
          <label
            htmlFor="ocr-language"
            className="text-sm font-medium text-muted-foreground mb-2 block"
          >
            Document Language
          </label>
          <select
            id="ocr-language"
            value={selectedLang}
            onChange={handleLangChange}
            disabled={isProcessing}
            className="px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-surface text-primary disabled:opacity-50"
          >
            {LANGUAGE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Upload Area — shown when idle or error without a file */}
        {!currentFile && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff"
              onChange={handleFileInput}
              className="hidden"
              id="ocr-upload"
            />
            <label htmlFor="ocr-upload" className="sr-only">
              Upload image for OCR
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
                Supports JPEG, PNG, WebP, BMP, TIFF up to 20MB
              </p>
              <div className="inline-block px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-colors">
                Choose Image
              </div>
            </div>
          </>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-error/10 border border-error/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-error flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-primary">{error}</p>
              {status === 'error' && currentFile && (
                <button onClick={handleRetry} className="mt-2 text-sm text-accent hover:underline">
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        {/* Processing UI */}
        {currentFile && (
          <div className="space-y-6">
            {/* Status Banner */}
            {isProcessing && (
              <div className="bg-surface-light rounded-lg p-4 border border-border">
                <div className="flex items-center gap-3 mb-2">
                  <Loader2 className="w-5 h-5 animate-spin text-accent flex-shrink-0" />
                  <span className="text-sm font-medium text-primary">
                    {status === 'loading'
                      ? 'Loading OCR engine (~5MB)...'
                      : `Recognizing text... ${progress}%`}
                  </span>
                </div>
                {status === 'recognizing' && (
                  <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-accent h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(progress, 3)}%` }}
                    />
                  </div>
                )}
                {status === 'loading' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Tesseract WASM is downloading. This only happens once and is cached.
                  </p>
                )}
              </div>
            )}

            {/* Image Preview + Text Side by Side */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Image Preview */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-muted-foreground">Image</label>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-accent hover:underline"
                  >
                    Change image
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </div>
                <div className="relative min-h-[200px] max-h-[400px] border rounded-lg overflow-hidden bg-surface-light flex items-center justify-center">
                  {previewUrl && (
                    <Image
                      src={previewUrl}
                      alt="Image for OCR"
                      width={400}
                      height={400}
                      className="w-full h-auto max-h-[400px] object-contain"
                      unoptimized
                    />
                  )}
                </div>
              </div>

              {/* Extracted Text */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Extracted Text
                  </label>
                  {status === 'done' && extractedText && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3 h-3" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
                <div className="relative min-h-[200px] max-h-[400px] border rounded-lg overflow-hidden bg-surface-light">
                  {status === 'done' && (
                    <textarea
                      value={extractedText}
                      onChange={e => setExtractedText(e.target.value)}
                      className="w-full h-full min-h-[200px] p-3 bg-surface-light text-primary text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-accent rounded-lg"
                      placeholder="No text detected in this image."
                      aria-label="Extracted text — editable"
                    />
                  )}
                  {isProcessing && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="w-6 h-6 animate-spin text-accent mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Analyzing...</p>
                      </div>
                    </div>
                  )}
                  {(status === 'idle' || status === 'error') && !isProcessing && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-sm text-muted-foreground text-center px-4">
                        Text will appear here after processing
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            {status === 'done' && (
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-colors"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy to Clipboard'}
                </button>
                <button
                  onClick={handleDownloadTxt}
                  disabled={!extractedText}
                  className="flex items-center gap-2 px-5 py-2.5 bg-surface-light text-primary font-medium rounded-lg border border-border hover:border-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  Download as .txt
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-5 py-2.5 bg-surface-light text-muted-foreground font-medium rounded-lg border border-border hover:border-accent transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  New Image
                </button>
              </div>
            )}

            {/* Cross-sell */}
            <div className="bg-surface-light rounded-lg p-4 border border-border">
              <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-1">
                <span className="font-medium text-primary">Poor OCR results?</span>
                Low-resolution or blurry images reduce accuracy. Try our AI upscaler first for
                better text recognition results.
                <a
                  href="/"
                  className="text-accent hover:underline font-medium inline-flex items-center gap-1"
                >
                  AI Image Upscaler
                  <ArrowRight className="w-3 h-3" />
                </a>
              </p>
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
