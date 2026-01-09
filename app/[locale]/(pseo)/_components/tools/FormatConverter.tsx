'use client';

/**
 * Format Converter Tool
 * Client-side image format conversion using Canvas API
 * Flexible component supporting multiple conversion scenarios for pSEO
 */

import React, { useState, useCallback, useEffect } from 'react';
import { InteractiveTool } from './InteractiveTool';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

type ImageFormat = 'jpeg' | 'png' | 'webp';

interface IConvertOptions {
  targetFormat: ImageFormat;
  quality: number;
  backgroundColor: string;
}

interface IFormatConverterProps {
  /** Default target format (e.g., 'jpeg' for png-to-jpg page) */
  defaultTargetFormat?: ImageFormat;
  /** Restrict accepted input formats (e.g., ['image/png'] for png-to-jpg) */
  acceptedInputFormats?: string[];
  /** Available output formats to choose from */
  availableOutputFormats?: ImageFormat[];
  /** Page title */
  title?: string;
  /** Page description */
  description?: string;
}

const FORMAT_EMOJI: Record<ImageFormat, string> = {
  jpeg: '📸',
  png: '🖼️',
  webp: '🌐',
};

export function FormatConverter({
  defaultTargetFormat = 'jpeg',
  acceptedInputFormats = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/bmp',
    'image/gif',
    'image/svg+xml',
  ],
  availableOutputFormats = ['jpeg', 'png', 'webp'],
  title,
  description,
}: IFormatConverterProps): React.ReactElement {
  const t = useTranslations('pseo-tools.formatConverter');

  const formatInfo = (format: ImageFormat) => ({
    label: t(`formatInfo.${format}.label`),
    description: t(`formatInfo.${format}.description`),
    emoji: FORMAT_EMOJI[format],
  });
  const [options, setOptions] = useState<IConvertOptions>({
    targetFormat: defaultTargetFormat,
    quality: 90,
    backgroundColor: '#FFFFFF',
  });

  const [sourceFormat, setSourceFormat] = useState<string>('');
  const [sourceMime, setSourceMime] = useState<string>('');
  const [originalSize, setOriginalSize] = useState<number>(0);
  const [convertedSize, setConvertedSize] = useState<number>(0);

  // Auto-filter output formats to exclude source format
  const filteredOutputFormats = availableOutputFormats.filter(fmt => {
    const mimeMap: Record<string, ImageFormat | undefined> = {
      'image/jpeg': 'jpeg',
      'image/jpg': 'jpeg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/bmp': undefined, // BMP can convert to any output format
      'image/gif': undefined, // GIF can convert to any output format
      'image/svg+xml': undefined, // SVG can convert to any output format
    };
    return fmt !== mimeMap[sourceMime];
  });

  // Update target format if current selection is same as source
  useEffect(() => {
    if (sourceMime) {
      const mimeMap: Record<string, ImageFormat | undefined> = {
        'image/jpeg': 'jpeg',
        'image/jpg': 'jpeg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/bmp': undefined, // BMP is input-only, no conflict
        'image/gif': undefined, // GIF is input-only, no conflict
        'image/svg+xml': undefined, // SVG is input-only, no conflict
      };
      const sourceAsFormat = mimeMap[sourceMime];
      if (
        sourceAsFormat &&
        options.targetFormat === sourceAsFormat &&
        filteredOutputFormats.length > 0
      ) {
        setOptions(prev => ({ ...prev, targetFormat: filteredOutputFormats[0] }));
      }
    }
  }, [sourceMime, options.targetFormat, filteredOutputFormats]);

  const handleConvert = useCallback(
    async (file: File): Promise<Blob> => {
      setOriginalSize(file.size);
      setSourceMime(file.type);
      // Normalize format display name
      const formatLabels: Record<string, string> = {
        'image/jpeg': 'JPEG',
        'image/jpg': 'JPEG',
        'image/png': 'PNG',
        'image/webp': 'WebP',
        'image/bmp': 'BMP',
        'image/gif': 'GIF',
        'image/svg+xml': 'SVG',
      };
      setSourceFormat(formatLabels[file.type] || file.type.split('/')[1].toUpperCase());

      return new Promise((resolve, reject) => {
        const img = document.createElement('img');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Canvas not supported'));
          return;
        }

        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;

          // If converting to JPEG and source has transparency, fill background
          if (options.targetFormat === 'jpeg') {
            ctx.fillStyle = options.backgroundColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }

          // High-quality rendering
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0);

          canvas.toBlob(
            blob => {
              if (blob) {
                setConvertedSize(blob.size);
                resolve(blob);
              } else {
                reject(new Error('Failed to convert image'));
              }
            },
            `image/${options.targetFormat}`,
            options.quality / 100
          );
        };

        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = URL.createObjectURL(file);
      });
    },
    [options]
  );

  const sizeDifference =
    originalSize && convertedSize
      ? Math.round(((convertedSize - originalSize) / originalSize) * 100)
      : 0;

  return (
    <InteractiveTool
      title={title}
      description={description}
      onProcess={handleConvert}
      acceptedFormats={acceptedInputFormats}
    >
      {({ file, previewUrl, processedBlob }) => (
        <div className="space-y-6">
          {/* Preview */}
          {previewUrl && (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block text-muted-foreground">
                  {t('originalImageLabel')}
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
                  {sourceFormat && (
                    <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded font-mono">
                      {sourceFormat}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block text-muted-foreground">
                  {t('conversionPreviewLabel')}
                </label>
                <div className="border rounded-lg p-6 bg-surface-light flex items-center justify-center min-h-[200px]">
                  <div className="text-center">
                    <div className="text-5xl mb-3">
                      {options.targetFormat === 'jpeg' && '📸'}
                      {options.targetFormat === 'png' && '🖼️'}
                      {options.targetFormat === 'webp' && '🌐'}
                    </div>
                    <p className="text-2xl font-bold text-muted-foreground uppercase">
                      {options.targetFormat}
                    </p>
                    {processedBlob && (
                      <div className="mt-4">
                        <p className="text-sm text-muted-foreground">
                          {(convertedSize / 1024).toFixed(0)}KB
                          {sizeDifference !== 0 && (
                            <span className={sizeDifference > 0 ? 'text-warning' : 'text-success'}>
                              {' '}
                              ({sizeDifference > 0 ? '+' : ''}
                              {sizeDifference}%)
                            </span>
                          )}
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
            {/* Target Format */}
            <div>
              <label
                htmlFor="format"
                className="mb-2 block text-sm font-medium text-muted-foreground"
              >
                {t('convertToLabel')}
              </label>
              <select
                id="format"
                value={options.targetFormat}
                onChange={e =>
                  setOptions(prev => ({ ...prev, targetFormat: e.target.value as ImageFormat }))
                }
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-surface text-base text-text-primary"
              >
                {(sourceMime ? filteredOutputFormats : availableOutputFormats).map(fmt => {
                  const info = formatInfo(fmt);
                  return (
                    <option key={fmt} value={fmt}>
                      {info.emoji} {info.label} - {info.description}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Quality */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="quality" className="text-sm font-medium text-muted-foreground">
                  {t('qualityLabel')}
                </label>
                <span className="text-sm font-bold text-accent">{options.quality}%</span>
              </div>
              <input
                id="quality"
                type="range"
                min={1}
                max={100}
                value={options.quality}
                onChange={e => setOptions(prev => ({ ...prev, quality: parseInt(e.target.value) }))}
                className="w-full h-2 bg-surface-light rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* Background Color (for PNG to JPEG) */}
            {options.targetFormat === 'jpeg' && (
              <div className="md:col-span-2">
                <label
                  htmlFor="bgColor"
                  className="mb-2 block text-sm font-medium text-muted-foreground"
                >
                  {t('backgroundColorLabel')}
                </label>
                <div className="flex gap-3">
                  <input
                    id="bgColor"
                    type="color"
                    value={options.backgroundColor}
                    onChange={e =>
                      setOptions(prev => ({ ...prev, backgroundColor: e.target.value }))
                    }
                    className="h-10 w-20 border border-border rounded cursor-pointer"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setOptions(prev => ({ ...prev, backgroundColor: '#FFFFFF' }))}
                      className="px-3 py-2 bg-surface text-text-primary border border-border rounded hover:bg-surface-light text-sm"
                    >
                      {t('whiteButton')}
                    </button>
                    <button
                      onClick={() => setOptions(prev => ({ ...prev, backgroundColor: '#000000' }))}
                      className="px-3 py-2 bg-surface-light text-text-primary border border-border rounded hover:bg-surface text-sm"
                    >
                      {t('blackButton')}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('jpegTransparencyNote')}
                </p>
              </div>
            )}
          </div>

          {/* Conversion Info */}
          {file && (
            <div className="bg-surface-light rounded-lg p-4 border border-accent/30">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">{t('convertingInfo')}</span> {sourceFormat} →{' '}
                {options.targetFormat.toUpperCase()}
                {' • '}
                <span className="font-medium">{t('originalInfo')}</span> {(originalSize / 1024).toFixed(1)}KB
                {convertedSize > 0 && (
                  <>
                    {' • '}
                    <span className="font-medium">{t('resultInfo')}</span> {(convertedSize / 1024).toFixed(1)}
                    KB
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </InteractiveTool>
  );
}
