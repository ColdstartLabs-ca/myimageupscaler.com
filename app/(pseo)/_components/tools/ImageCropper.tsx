'use client';

import React, { useState, useCallback, useRef } from 'react';
import { InteractiveTool } from './InteractiveTool';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';

interface IAspectRatioPreset {
  label: string;
  value: number | undefined; // undefined = free form
}

const _STANDARD_PRESETS: IAspectRatioPreset[] = [
  { label: 'Free', value: undefined },
  { label: '1:1 (Square)', value: 1 },
  { label: '16:9 (Landscape)', value: 16 / 9 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '9:16 (Portrait)', value: 9 / 16 },
];

const SOCIAL_MEDIA_PRESETS: IAspectRatioPreset[] = [
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

function getCropBlob(imageSrc: string, pixelCrop: Area, circularCrop?: boolean): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }

      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;

      if (circularCrop) {
        ctx.beginPath();
        ctx.arc(
          pixelCrop.width / 2,
          pixelCrop.height / 2,
          Math.min(pixelCrop.width, pixelCrop.height) / 2,
          0,
          2 * Math.PI
        );
        ctx.clip();
      }

      ctx.drawImage(
        img,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
      );

      canvas.toBlob(
        blob => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create image'));
        },
        'image/png',
        1
      );
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageSrc;
  });
}

export function ImageCropper({
  defaultAspectRatio,
  aspectRatioPresets,
  title = 'Crop Your Image',
  description = 'Free online image cropper - crop images to any dimension or aspect ratio instantly',
}: IImageCropperProps): React.ReactElement {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | undefined>(defaultAspectRatio ?? undefined);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>(
    defaultAspectRatio ? 'default' : 'Free'
  );
  const previewUrlRef = useRef<string | null>(null);
  const [cropDimensions, setCropDimensions] = useState<string>('');

  const isCircular = aspectRatioPresets === 'circle';

  const socialPresets =
    aspectRatioPresets === 'instagram'
      ? SOCIAL_MEDIA_PRESETS.filter(p => p.label.toLowerCase().includes('instagram'))
      : aspectRatioPresets === 'youtube'
        ? SOCIAL_MEDIA_PRESETS.filter(p => p.label.toLowerCase().includes('youtube'))
        : null;

  const presets = socialPresets ?? SOCIAL_MEDIA_PRESETS;

  const handleCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
    setCropDimensions(`${Math.round(croppedPixels.width)} × ${Math.round(croppedPixels.height)}`);
  }, []);

  const handlePresetSelect = useCallback((label: string, value: number | undefined) => {
    setSelectedPreset(label);
    setAspect(value);
  }, []);

  const handleCrop = useCallback(
    async (_file: File): Promise<Blob> => {
      if (!croppedAreaPixels || !previewUrlRef.current) {
        throw new Error('Please select a crop area first');
      }
      return getCropBlob(previewUrlRef.current, croppedAreaPixels, isCircular);
    },
    [croppedAreaPixels, isCircular]
  );

  return (
    <InteractiveTool title={title} description={description} onProcess={handleCrop}>
      {({ file, previewUrl }) => {
        if (previewUrl) {
          previewUrlRef.current = previewUrl;
        }

        return (
          <div className="space-y-6">
            {previewUrl && (
              <div className="relative bg-black rounded-lg overflow-hidden" style={{ height: 400 }}>
                <Cropper
                  image={previewUrl}
                  crop={crop}
                  zoom={zoom}
                  aspect={aspect ?? 1}
                  cropShape={isCircular ? 'round' : 'rect'}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={handleCropComplete}
                  showGrid={true}
                  style={{
                    containerStyle: { borderRadius: '0.5rem' },
                  }}
                />
              </div>
            )}

            {cropDimensions && (
              <div className="text-center text-sm text-muted-foreground">
                Crop area: {cropDimensions} px
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">
                  Aspect Ratio
                </label>
                <div className="flex flex-wrap gap-2">
                  {presets.map(preset => (
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

              <div>
                <label
                  htmlFor="zoom"
                  className="mb-2 block text-sm font-medium text-muted-foreground"
                >
                  Zoom: {zoom.toFixed(1)}x
                </label>
                <input
                  id="zoom"
                  type="range"
                  min={1}
                  max={5}
                  step={0.1}
                  value={zoom}
                  onChange={e => setZoom(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            {file && (
              <div className="bg-surface rounded-lg p-4 text-sm">
                <p className="text-text-secondary">
                  <span className="font-medium">Original:</span> {file.name} (
                  {(file.size / 1024 / 1024).toFixed(2)}MB)
                </p>
              </div>
            )}
          </div>
        );
      }}
    </InteractiveTool>
  );
}
