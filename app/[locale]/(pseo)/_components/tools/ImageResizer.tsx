'use client';

/**
 * Image Resizer Tool
 * Client-side image resizing using Canvas API
 * Flexible component supporting multiple resize scenarios for pSEO
 */

import React, { useState, useCallback, useEffect } from 'react';
import { InteractiveTool } from './InteractiveTool';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

interface IResizeOptions {
  width: number;
  height: number;
  maintainAspectRatio: boolean;
  format: 'jpeg' | 'png' | 'webp';
  quality: number;
}

interface IPresetSize {
  label: string;
  width: number;
  height: number;
}

const ALL_PRESET_SIZES_CONFIG = [
  { key: 'instagramPost', width: 1080, height: 1080 },
  { key: 'instagramStory', width: 1080, height: 1920 },
  { key: 'facebookPost', width: 1200, height: 630 },
  { key: 'facebookCover', width: 820, height: 312 },
  { key: 'twitterPost', width: 1200, height: 675 },
  { key: 'twitterHeader', width: 1500, height: 500 },
  { key: 'youtubeThumbnail', width: 1280, height: 720 },
  { key: 'linkedinPost', width: 1200, height: 627 },
  { key: 'linkedinBanner', width: 1584, height: 396 },
  { key: 'pinterestPin', width: 1000, height: 1500 },
  { key: '4k', width: 3840, height: 2160 },
  { key: 'fullHd', width: 1920, height: 1080 },
  { key: 'hd', width: 1280, height: 720 },
];

interface IImageResizerProps {
  /** Default width */
  defaultWidth?: number;
  /** Default height */
  defaultHeight?: number;
  /** Filter presets to show (by label substring match) */
  presetFilter?: string;
  /** Custom title */
  title?: string;
  /** Custom description */
  description?: string;
}

export function ImageResizer({
  defaultWidth = 1080,
  defaultHeight = 1080,
  presetFilter,
  title,
  description,
}: IImageResizerProps): React.ReactElement {
  const t = useTranslations('pseo-tools.imageResizer');
  const tPresets = useTranslations('pseo-tools.presetSizes');

  // Use provided title/description or fall back to translations
  const displayTitle = title || t('defaultTitle');
  const displayDescription = description || t('defaultDescription');

  // Build presets with translated labels
  const allPresets: IPresetSize[] = ALL_PRESET_SIZES_CONFIG.map(config => ({
    label: tPresets(config.key),
    width: config.width,
    height: config.height,
  }));

  // Filter presets based on presetFilter prop
  const presets = presetFilter
    ? allPresets.filter(p => p.label.toLowerCase().includes(presetFilter.toLowerCase()))
    : allPresets;

  const [options, setOptions] = useState<IResizeOptions>({
    width: defaultWidth,
    height: defaultHeight,
    maintainAspectRatio: true,
    format: 'jpeg',
    quality: 90,
  });

  // Update dimensions when props change
  useEffect(() => {
    setOptions(prev => ({
      ...prev,
      width: defaultWidth,
      height: defaultHeight,
    }));
  }, [defaultWidth, defaultHeight]);

  const [originalDimensions, setOriginalDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const handleResize = useCallback(
    async (file: File): Promise<Blob> => {
      return new Promise((resolve, reject) => {
        const img = document.createElement('img');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Canvas not supported'));
          return;
        }

        img.onload = () => {
          // Store original dimensions on first load
          if (!originalDimensions) {
            setOriginalDimensions({ width: img.width, height: img.height });
          }

          let targetWidth = options.width;
          let targetHeight = options.height;

          if (options.maintainAspectRatio) {
            const aspectRatio = img.width / img.height;
            if (targetWidth / targetHeight > aspectRatio) {
              targetWidth = Math.round(targetHeight * aspectRatio);
            } else {
              targetHeight = Math.round(targetWidth / aspectRatio);
            }
          }

          canvas.width = targetWidth;
          canvas.height = targetHeight;

          // Use high-quality image smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          canvas.toBlob(
            blob => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to create image'));
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

  const handlePresetSelect = useCallback(
    (presetLabel: string) => {
      const preset = presets.find(p => p.label === presetLabel);
      if (preset) {
        setOptions(prev => ({
          ...prev,
          width: preset.width,
          height: preset.height,
        }));
      }
    },
    [presets]
  );

  const handleWidthChange = useCallback(
    (value: number) => {
      setOptions(prev => {
        if (prev.maintainAspectRatio && originalDimensions) {
          const aspectRatio = originalDimensions.width / originalDimensions.height;
          return {
            ...prev,
            width: value,
            height: Math.round(value / aspectRatio),
          };
        }
        return { ...prev, width: value };
      });
    },
    [originalDimensions]
  );

  const handleHeightChange = useCallback(
    (value: number) => {
      setOptions(prev => {
        if (prev.maintainAspectRatio && originalDimensions) {
          const aspectRatio = originalDimensions.width / originalDimensions.height;
          return {
            ...prev,
            height: value,
            width: Math.round(value * aspectRatio),
          };
        }
        return { ...prev, height: value };
      });
    },
    [originalDimensions]
  );

  return (
    <InteractiveTool title={displayTitle} description={displayDescription} onProcess={handleResize}>
      {({ file, previewUrl }) => (
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
                  {originalDimensions && (
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      {originalDimensions.width} × {originalDimensions.height}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block text-muted-foreground">
                  {t('previewNewSizeLabel')}
                </label>
                <div className="border rounded-lg p-4 bg-surface-light flex items-center justify-center min-h-[200px]">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-muted-foreground">
                      {options.width} × {options.height}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">{t('newDimensions')}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Preset Sizes */}
            <div>
              <label
                htmlFor="preset"
                className="mb-2 block text-sm font-medium text-muted-foreground"
              >
                {t('presetSizesLabel')}
              </label>
              <select
                id="preset"
                onChange={e => handlePresetSelect(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-surface text-text-primary"
              >
                <option value="">{t('choosePreset')}</option>
                {presets.map(preset => (
                  <option key={preset.label} value={preset.label}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Format */}
            <div>
              <label
                htmlFor="format"
                className="mb-2 block text-sm font-medium text-muted-foreground"
              >
                {t('outputFormatLabel')}
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

            {/* Width */}
            <div>
              <label
                htmlFor="width"
                className="mb-2 block text-sm font-medium text-muted-foreground"
              >
                {t('widthLabel')}
              </label>
              <input
                id="width"
                type="number"
                min={1}
                max={10000}
                value={options.width}
                onChange={e => handleWidthChange(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            {/* Height */}
            <div>
              <label
                htmlFor="height"
                className="mb-2 block text-sm font-medium text-muted-foreground"
              >
                {t('heightLabel')}
                {options.maintainAspectRatio && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    {t('autoCalculated')}
                  </span>
                )}
              </label>
              <input
                id="height"
                type="number"
                min={1}
                max={10000}
                value={options.height}
                onChange={e => handleHeightChange(parseInt(e.target.value) || 1)}
                disabled={options.maintainAspectRatio}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent disabled:bg-surface disabled:text-text-muted disabled:cursor-not-allowed"
              />
            </div>

            {/* Quality */}
            <div>
              <label
                htmlFor="quality"
                className="mb-2 block text-sm font-medium text-muted-foreground"
              >
                {t('qualityLabel')} {options.quality}%
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
                className="text-sm font-medium text-muted-foreground cursor-pointer"
              >
                {t('maintainAspectRatio')}
              </label>
            </div>
          </div>

          {/* File Info */}
          {file && (
            <div className="bg-surface rounded-lg p-4 text-sm">
              <p className="text-text-secondary">
                <span className="font-medium">{t('originalLabel')}</span> {file.name} (
                {(file.size / 1024 / 1024).toFixed(2)}MB)
              </p>
            </div>
          )}
        </div>
      )}
    </InteractiveTool>
  );
}
