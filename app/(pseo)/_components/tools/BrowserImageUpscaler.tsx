'use client';

/* eslint-disable i18next/no-literal-string */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  AlertCircle,
  Cpu,
  Download,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Sparkles,
  Upload,
} from 'lucide-react';
import { FileUpload } from '@/app/(pseo)/_components/ui/FileUpload';
import { clientEnv } from '@shared/config/env';

type IStatus = 'idle' | 'ready' | 'processing' | 'done' | 'error';
type IProcessingEngine = 'upscalerjs' | 'canvas';

interface IImageDimensions {
  width: number;
  height: number;
}

interface IProcessedImage {
  url: string;
  blob: Blob;
  dimensions: IImageDimensions;
  engine: IProcessingEngine;
}

const ACCEPTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_MB = 10;
const MAX_INPUT_PIXELS = 4_000_000;
const SCALE_FACTOR = 2;

function revokeUrl(url: string | null): void {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

async function getImageDimensions(src: string): Promise<IImageDimensions> {
  const image = document.createElement('img');
  image.decoding = 'async';

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not read the selected image.'));
    image.src = src;
  });

  return { width: image.naturalWidth, height: image.naturalHeight };
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  const image = document.createElement('img');
  image.decoding = 'async';

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not load the selected image.'));
    image.src = src;
  });

  return image;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

function sharpenCanvas(canvas: HTMLCanvasElement, amount = 0.2): void {
  const context = canvas.getContext('2d');
  if (!context) return;

  const { width, height } = canvas;
  const source = context.getImageData(0, 0, width, height);
  const output = context.createImageData(width, height);
  const src = source.data;
  const dst = output.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;

      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        dst[idx] = src[idx];
        dst[idx + 1] = src[idx + 1];
        dst[idx + 2] = src[idx + 2];
        dst[idx + 3] = src[idx + 3];
        continue;
      }

      const left = idx - 4;
      const right = idx + 4;
      const top = idx - width * 4;
      const bottom = idx + width * 4;

      for (let channel = 0; channel < 3; channel += 1) {
        const blurred =
          (src[left + channel] +
            src[right + channel] +
            src[top + channel] +
            src[bottom + channel]) /
          4;
        const value = src[idx + channel] + (src[idx + channel] - blurred) * amount;
        dst[idx + channel] = Math.max(0, Math.min(255, value));
      }

      dst[idx + 3] = src[idx + 3];
    }
  }

  context.putImageData(output, 0, 0);
}

async function upscaleWithCanvas(image: HTMLImageElement): Promise<IProcessedImage> {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Your browser does not support image canvas processing.');
  }

  const width = image.naturalWidth * SCALE_FACTOR;
  const height = image.naturalHeight * SCALE_FACTOR;
  canvas.width = width;
  canvas.height = height;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  sharpenCanvas(canvas);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => {
      if (result) {
        resolve(result);
      } else {
        reject(new Error('Could not create the upscaled image.'));
      }
    }, 'image/png');
  });

  return {
    url: URL.createObjectURL(blob),
    blob,
    dimensions: { width, height },
    engine: 'canvas',
  };
}

async function upscaleWithUpscalerJs(image: HTMLImageElement): Promise<IProcessedImage> {
  const [tf, upscalerModule, modelModule] = await Promise.all([
    // eslint-disable-next-line no-restricted-syntax
    import('@tensorflow/tfjs'),
    // eslint-disable-next-line no-restricted-syntax
    import('upscaler'),
    // eslint-disable-next-line no-restricted-syntax
    import('@upscalerjs/default-model'),
  ]);

  try {
    await tf.setBackend('webgl');
  } catch {
    // TensorFlow.js will keep its available default backend.
  }

  await tf.ready();

  const Upscaler = upscalerModule.default;
  const upscaler = new Upscaler({ model: modelModule.default });
  const dataUrl = await upscaler.upscale(image, {
    output: 'base64',
    patchSize: 64,
    padding: 4,
  });
  const blob = await dataUrlToBlob(dataUrl);

  return {
    url: URL.createObjectURL(blob),
    blob,
    dimensions: {
      width: image.naturalWidth * SCALE_FACTOR,
      height: image.naturalHeight * SCALE_FACTOR,
    },
    engine: 'upscalerjs',
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BrowserImageUpscaler(): React.ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [originalDimensions, setOriginalDimensions] = useState<IImageDimensions | null>(null);
  const [processedImage, setProcessedImage] = useState<IProcessedImage | null>(null);
  const [status, setStatus] = useState<IStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const latestProcessedUrl = useRef<string | null>(null);

  useEffect(() => {
    latestProcessedUrl.current = processedImage?.url ?? null;
  }, [processedImage]);

  useEffect(() => {
    return () => {
      revokeUrl(originalUrl);
      revokeUrl(latestProcessedUrl.current);
    };
  }, [originalUrl]);

  const outputName = useMemo(() => {
    if (!file) return `${clientEnv.DOWNLOAD_PREFIX}-free-upscaled.png`;
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    return `${clientEnv.DOWNLOAD_PREFIX}-${baseName}-2x.png`;
  }, [file]);

  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      setError(null);
      setNotice(null);
      setStatus('idle');
      setFile(null);
      setOriginalDimensions(null);
      revokeUrl(originalUrl);
      revokeUrl(latestProcessedUrl.current);
      setProcessedImage(null);

      if (!ACCEPTED_FORMATS.includes(selectedFile.type)) {
        setError('Upload a JPEG, PNG, or WebP image.');
        setStatus('error');
        return;
      }

      if (selectedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setError(`Choose an image under ${MAX_FILE_SIZE_MB} MB.`);
        setStatus('error');
        return;
      }

      const url = URL.createObjectURL(selectedFile);

      try {
        const dimensions = await getImageDimensions(url);
        if (dimensions.width * dimensions.height > MAX_INPUT_PIXELS) {
          revokeUrl(url);
          setError('Choose an image below 4 megapixels for browser-side upscaling.');
          setStatus('error');
          return;
        }

        setFile(selectedFile);
        setOriginalUrl(url);
        setOriginalDimensions(dimensions);
        setStatus('ready');
      } catch (err) {
        revokeUrl(url);
        setError(err instanceof Error ? err.message : 'Could not open the selected image.');
        setStatus('error');
      }
    },
    [originalUrl]
  );

  const handleUpscale = useCallback(async () => {
    if (!originalUrl) return;

    setError(null);
    setNotice(null);
    setStatus('processing');
    revokeUrl(latestProcessedUrl.current);
    setProcessedImage(null);

    try {
      const image = await loadImageElement(originalUrl);

      try {
        const result = await upscaleWithUpscalerJs(image);
        setProcessedImage(result);
      } catch {
        const result = await upscaleWithCanvas(image);
        setProcessedImage(result);
        setNotice('AI model unavailable locally; used the browser canvas fallback.');
      }

      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upscaling failed. Try a smaller image.');
      setStatus('error');
    }
  }, [originalUrl]);

  const handleDownload = useCallback(() => {
    if (!processedImage) return;

    const anchor = document.createElement('a');
    anchor.href = processedImage.url;
    anchor.download = outputName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }, [outputName, processedImage]);

  const handleReset = useCallback(() => {
    revokeUrl(originalUrl);
    revokeUrl(latestProcessedUrl.current);
    setFile(null);
    setOriginalUrl(null);
    setOriginalDimensions(null);
    setProcessedImage(null);
    setError(null);
    setNotice(null);
    setStatus('idle');
  }, [originalUrl]);

  return (
    <section className="w-full max-w-5xl mx-auto rounded-xl border border-border bg-surface p-5 shadow-lg sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-primary">Free Browser Image Upscaler</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload an image, upscale it locally, then download the 2x result.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-light px-3 py-2 text-xs font-medium text-text-secondary">
          <Cpu className="h-4 w-4 text-accent" />
          Browser-only
        </div>
      </div>

      {!file && (
        <FileUpload
          onFileSelect={handleFileSelect}
          acceptedFormats={ACCEPTED_FORMATS}
          maxFileSizeMB={MAX_FILE_SIZE_MB}
        />
      )}

      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-error/20 bg-error/10 p-4 text-sm text-text-primary">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-error" />
          <p>{error}</p>
        </div>
      )}

      {notice && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-text-primary">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <p>{notice}</p>
        </div>
      )}

      {file && originalUrl && (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <figure className="overflow-hidden rounded-lg border border-border bg-surface-light">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <figcaption className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <ImageIcon className="h-4 w-4 text-accent" />
                  Original
                </figcaption>
                {originalDimensions && (
                  <span className="text-xs text-muted-foreground">
                    {originalDimensions.width} x {originalDimensions.height}
                  </span>
                )}
              </div>
              <div className="relative flex aspect-video items-center justify-center p-3">
                <Image
                  src={originalUrl}
                  alt="Original selected image"
                  width={640}
                  height={360}
                  className="max-h-full w-auto max-w-full rounded object-contain"
                  unoptimized
                />
              </div>
            </figure>

            <figure className="overflow-hidden rounded-lg border border-border bg-surface-light">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <figcaption className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Sparkles className="h-4 w-4 text-accent" />
                  Upscaled
                </figcaption>
                {processedImage ? (
                  <span className="text-xs text-muted-foreground">
                    {processedImage.dimensions.width} x {processedImage.dimensions.height}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">2x output</span>
                )}
              </div>
              <div className="relative flex aspect-video items-center justify-center p-3">
                {status === 'processing' && (
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin text-accent" />
                    <span className="text-sm">Upscaling in your browser...</span>
                  </div>
                )}
                {status !== 'processing' && processedImage && (
                  <Image
                    src={processedImage.url}
                    alt="Browser-upscaled result"
                    width={640}
                    height={360}
                    className="max-h-full w-auto max-w-full rounded object-contain"
                    unoptimized
                  />
                )}
                {status !== 'processing' && !processedImage && (
                  <div className="text-center text-sm text-muted-foreground">
                    Result appears here after upscaling.
                  </div>
                )}
              </div>
            </figure>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-main/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-text-secondary">
              <span className="font-medium text-text-primary">{file.name}</span>
              <span className="mx-2 text-muted-foreground">/</span>
              <span>{formatFileSize(file.size)}</span>
              {processedImage && (
                <>
                  <span className="mx-2 text-muted-foreground">/</span>
                  <span>
                    {processedImage.engine === 'upscalerjs' ? 'UpscalerJS' : 'Canvas'} result
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleUpscale}
                disabled={status === 'processing'}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === 'processing' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {processedImage ? 'Upscale Again' : 'Upscale 2x'}
              </button>

              <button
                type="button"
                onClick={handleDownload}
                disabled={!processedImage || status === 'processing'}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-success px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                Download
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-light px-5 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
