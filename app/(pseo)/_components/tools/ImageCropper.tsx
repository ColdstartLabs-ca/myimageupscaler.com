'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Sparkles, Zap } from 'lucide-react';
import Link from 'next/link';
import { InteractiveTool } from './InteractiveTool';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface IAspectRatioPreset {
  label: string;
  value: number | undefined;
}

const SOCIAL_MEDIA_PRESETS: IAspectRatioPreset[] = [
  { label: 'Free', value: undefined },
  { label: 'Instagram Post (1:1)', value: 1 },
  { label: 'Instagram Story (9:16)', value: 9 / 16 },
  { label: 'YouTube Thumbnail (16:9)', value: 16 / 9 },
  { label: 'Facebook Post (1.91:1)', value: 1.91 },
  { label: 'Twitter Post (16:9)', value: 16 / 9 },
  { label: 'LinkedIn Post (1.91:1)', value: 1.91 },
  { label: 'Pinterest Pin (2:3)', value: 2 / 3 },
];

interface IImageCropperProps {
  defaultAspectRatio?: number;
  aspectRatioPresets?: string;
  title?: string;
  description?: string;
}

function makeInitialCrop(aspect: number | undefined, width: number, height: number): Crop {
  if (aspect !== undefined) {
    return centerCrop(
      makeAspectCrop({ unit: '%', width: 80 }, aspect, width, height),
      width,
      height
    );
  }
  return { unit: '%', x: 10, y: 10, width: 80, height: 80 };
}

function getCropBlob(
  img: HTMLImageElement,
  pixelCrop: PixelCrop,
  circularCrop?: boolean
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas not supported'));
      return;
    }

    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    const w = Math.round(pixelCrop.width * scaleX);
    const h = Math.round(pixelCrop.height * scaleY);

    canvas.width = w;
    canvas.height = h;

    if (circularCrop) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, 2 * Math.PI);
      ctx.clip();
    }

    ctx.drawImage(
      img,
      pixelCrop.x * scaleX,
      pixelCrop.y * scaleY,
      pixelCrop.width * scaleX,
      pixelCrop.height * scaleY,
      0,
      0,
      w,
      h
    );

    canvas.toBlob(
      blob => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create image'));
      },
      'image/png',
      1
    );
  });
}

export function ImageCropper({
  defaultAspectRatio,
  aspectRatioPresets,
  title = 'Crop Your Image',
  description = 'Drag the handles to adjust the crop area. Switch presets to lock the aspect ratio.',
}: IImageCropperProps): React.ReactElement {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(defaultAspectRatio ?? 1);
  const [selectedPreset, setSelectedPreset] = useState<string>(
    defaultAspectRatio ? 'default' : 'Instagram Post (1:1)'
  );
  const [cropDimensions, setCropDimensions] = useState<string>('');
  const imgRef = useRef<HTMLImageElement>(null);

  const isCircular = aspectRatioPresets === 'circle';

  const filteredPresets =
    aspectRatioPresets === 'instagram'
      ? SOCIAL_MEDIA_PRESETS.filter(
          p => p.label === 'Free' || p.label.toLowerCase().includes('instagram')
        )
      : aspectRatioPresets === 'youtube'
        ? SOCIAL_MEDIA_PRESETS.filter(
            p => p.label === 'Free' || p.label.toLowerCase().includes('youtube')
          )
        : SOCIAL_MEDIA_PRESETS;

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setCrop(makeInitialCrop(aspect, naturalWidth, naturalHeight));
  }

  const handlePresetSelect = useCallback((label: string, value: number | undefined) => {
    setSelectedPreset(label);
    setAspect(value);
    if (imgRef.current) {
      const { naturalWidth, naturalHeight } = imgRef.current;
      setCrop(makeInitialCrop(value, naturalWidth, naturalHeight));
    }
  }, []);

  const handleCropComplete = useCallback((pixelCrop: PixelCrop) => {
    setCompletedCrop(pixelCrop);
    if (imgRef.current) {
      const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
      const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
      setCropDimensions(
        `${Math.round(pixelCrop.width * scaleX)} × ${Math.round(pixelCrop.height * scaleY)}`
      );
    }
  }, []);

  const handleCrop = useCallback(
    async (_file: File): Promise<Blob> => {
      if (!completedCrop || !imgRef.current) {
        throw new Error('Please adjust the crop area and try again');
      }
      return getCropBlob(imgRef.current, completedCrop, isCircular);
    },
    [completedCrop, isCircular]
  );

  return (
    <InteractiveTool title={title} description={description} onProcess={handleCrop}>
      {({ previewUrl, processedBlob, markResultStale }) => (
        <div className="space-y-4">
          {previewUrl && (
            <div className="flex justify-center bg-gray-900 rounded-lg overflow-hidden p-2">
              <ReactCrop
                crop={crop}
                onChange={c => {
                  setCrop(c);
                  markResultStale();
                }}
                onComplete={handleCropComplete}
                aspect={aspect}
                circularCrop={isCircular}
                keepSelection
              >
                <img
                  ref={imgRef}
                  src={previewUrl}
                  alt="Crop preview"
                  style={{ maxHeight: 420, display: 'block' }}
                  onLoad={onImageLoad}
                />
              </ReactCrop>
            </div>
          )}

          {cropDimensions && (
            <p className="text-center text-sm text-muted-foreground">Output: {cropDimensions} px</p>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Aspect Ratio
            </label>
            <div className="flex flex-wrap gap-2">
              {filteredPresets.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetSelect(preset.label, preset.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    selectedPreset === preset.label
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface text-text-primary border-border hover:border-accent'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {processedBlob && (
            <div className="flex items-center gap-3 p-4 bg-gradient-to-br from-accent/10 to-purple-500/10 border border-accent/20 rounded-xl">
              <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-primary">Want this image sharper?</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Upscale up to 4× with AI — perfect for print or large displays.
                </p>
              </div>
              <Link
                href="/?signup=1"
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent/90 transition-colors"
              >
                <Zap className="w-3 h-3" />
                Try Free
              </Link>
            </div>
          )}
        </div>
      )}
    </InteractiveTool>
  );
}
