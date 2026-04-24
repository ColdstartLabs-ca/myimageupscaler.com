'use client';

/**
 * HEIC Converter Tool
 * Client-side HEIC/HEIF to JPEG/PNG conversion using heic2any (dynamically imported)
 * Target keywords: heic to jpg converter, heic to png, convert heic online
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { InteractiveTool } from './InteractiveTool';
import Image from 'next/image';

type OutputFormat = 'jpeg' | 'png' | 'webp';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

interface IHeicConverterProps {
  defaultOutputFormat?: OutputFormat;
}

export function HeicConverter({
  defaultOutputFormat = 'jpeg',
}: IHeicConverterProps): React.ReactElement {
  const [outputFormat, setOutputFormat] = useState<OutputFormat>(
    defaultOutputFormat === 'png' ? 'png' : defaultOutputFormat === 'webp' ? 'webp' : 'jpeg'
  );
  const [quality, setQuality] = useState<number>(90);
  const [originalSize, setOriginalSize] = useState<number>(0);
  const [convertedSize, setConvertedSize] = useState<number>(0);
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [convertedPreviewUrl, setConvertedPreviewUrl] = useState<string | null>(null);
  const convertedPreviewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (convertedPreviewUrlRef.current) {
        URL.revokeObjectURL(convertedPreviewUrlRef.current);
      }
    };
  }, []);

  const handleConvert = useCallback(
    async (file: File): Promise<Blob> => {
      setOriginalSize(file.size);
      setIsConverting(true);

      try {
        // eslint-disable-next-line no-restricted-syntax -- Dynamic import required for lazy-loading heic2any WASM
        const heic2anyModule = await import('heic2any');
        const heic2any = heic2anyModule.default;

        const result = await heic2any({
          blob: file,
          toType: `image/${outputFormat}`,
          quality: quality / 100,
        });

        const blob = Array.isArray(result) ? result[0] : result;
        setConvertedSize(blob.size);

        // Revoke previous preview URL and create a new one
        if (convertedPreviewUrlRef.current) {
          URL.revokeObjectURL(convertedPreviewUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        convertedPreviewUrlRef.current = url;
        setConvertedPreviewUrl(url);

        return blob;
      } finally {
        setIsConverting(false);
      }
    },
    [outputFormat, quality]
  );

  const sizeDifference =
    originalSize && convertedSize
      ? Math.round(((convertedSize - originalSize) / originalSize) * 100)
      : 0;

  return (
    <InteractiveTool
      title="Convert HEIC to JPEG or PNG"
      description="Free online HEIC converter - convert iPhone HEIC photos to JPEG or PNG instantly"
      acceptedFormats={['image/heic', 'image/heif']}
      onProcess={handleConvert}
    >
      {({ file, processedBlob }) => (
        <div className="space-y-6">
          {/* Preview panels */}
          {file && (
            <div className="grid md:grid-cols-2 gap-4">
              {/* Original HEIC panel - can't preview in browser */}
              <div>
                <label className="text-sm font-medium mb-2 block text-muted-foreground">
                  Original HEIC File
                </label>
                <div className="border rounded-lg bg-surface-light min-h-[200px] flex items-center justify-center p-6">
                  <div className="text-center space-y-3">
                    <div className="w-16 h-16 mx-auto bg-surface border-2 border-border rounded-xl flex items-center justify-center">
                      <span className="text-lg font-bold text-muted-foreground">HEIC</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-primary truncate max-w-[180px] mx-auto">
                        {file.name}
                      </p>
                      {originalSize > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatFileSize(originalSize)}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      HEIC preview not supported in browsers
                    </p>
                  </div>
                </div>
              </div>

              {/* Converted image panel */}
              <div>
                <label className="text-sm font-medium mb-2 block text-muted-foreground">
                  Converted {outputFormat.toUpperCase()}
                </label>
                <div className="relative border rounded-lg overflow-hidden bg-surface-light min-h-[200px]">
                  {isConverting ? (
                    <div className="flex items-center justify-center min-h-[200px]">
                      <div className="text-center space-y-3">
                        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-sm text-muted-foreground">Converting HEIC file...</p>
                      </div>
                    </div>
                  ) : convertedPreviewUrl ? (
                    <>
                      <Image
                        src={convertedPreviewUrl}
                        alt="Converted image"
                        width={400}
                        height={300}
                        className="w-full h-auto"
                        unoptimized
                      />
                      {/* Format badge */}
                      <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded font-mono">
                        {outputFormat.toUpperCase()}
                      </div>
                      {/* Size badges */}
                      {convertedSize > 0 && (
                        <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded font-mono">
                          {formatFileSize(convertedSize)}
                        </div>
                      )}
                      {sizeDifference !== 0 && (
                        <div
                          className={`absolute bottom-2 right-2 text-white text-xs px-2 py-1 rounded font-medium ${
                            sizeDifference > 0 ? 'bg-warning/90' : 'bg-success/90'
                          }`}
                        >
                          {sizeDifference > 0 ? '+' : ''}
                          {sizeDifference}%
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-center min-h-[200px]">
                      <p className="text-sm text-muted-foreground">
                        Click &ldquo;Process Image&rdquo; to convert
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Output Format */}
            <div>
              <label
                htmlFor="output-format"
                className="mb-2 block text-sm font-medium text-muted-foreground"
              >
                Output Format
              </label>
              <select
                id="output-format"
                value={outputFormat}
                onChange={e => setOutputFormat(e.target.value as OutputFormat)}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-surface text-text-primary"
              >
                <option value="jpeg">JPEG - Best for photos, smaller files</option>
                <option value="png">PNG - Lossless, supports transparency</option>
                <option value="webp">WebP - Modern format, excellent compression</option>
              </select>
            </div>

            {/* Quality */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="heic-quality" className="text-sm font-medium text-muted-foreground">
                  Quality
                </label>
                <span className="text-sm font-bold text-accent">{quality}%</span>
              </div>
              <input
                id="heic-quality"
                type="range"
                min={70}
                max={100}
                value={quality}
                onChange={e => setQuality(parseInt(e.target.value))}
                className="w-full h-2 bg-surface-light rounded-lg appearance-none cursor-pointer accent-accent"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Smaller file</span>
                <span>Higher quality</span>
              </div>
            </div>
          </div>

          {/* Conversion Stats */}
          {file && processedBlob && (
            <div className="bg-surface-light rounded-lg p-4 border border-border">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-primary">{formatFileSize(originalSize)}</p>
                  <p className="text-xs text-muted-foreground">Original (HEIC)</p>
                </div>
                <div>
                  <p
                    className={`text-2xl font-bold ${sizeDifference > 0 ? 'text-warning' : 'text-success'}`}
                  >
                    {sizeDifference > 0 ? '+' : ''}
                    {sizeDifference}%
                  </p>
                  <p className="text-xs text-muted-foreground">Size Change</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-accent">{formatFileSize(convertedSize)}</p>
                  <p className="text-xs text-muted-foreground">
                    Converted ({outputFormat.toUpperCase()})
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Info box */}
          <div className="bg-surface rounded-lg p-4 text-sm text-muted-foreground">
            <p className="font-medium mb-2">About HEIC conversion:</p>
            <ul className="space-y-1 ml-4 list-disc">
              <li>HEIC is Apple&apos;s default photo format on iPhone and iPad</li>
              <li>JPEG is universally compatible and best for sharing</li>
              <li>PNG is ideal when you need lossless quality or transparency</li>
              <li>WebP offers excellent compression for modern browsers and web use</li>
              <li>All conversion happens in your browser — no upload required</li>
            </ul>
          </div>
        </div>
      )}
    </InteractiveTool>
  );
}
