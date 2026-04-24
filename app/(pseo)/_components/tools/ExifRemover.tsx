'use client';

import React, { useState, useEffect, useCallback } from 'react';
import exifr from 'exifr';
import { InteractiveTool } from './InteractiveTool';

interface IMetadataField {
  label: string;
  value: string;
  sensitive: boolean;
}

function parseMetadataFields(raw: Record<string, unknown>): IMetadataField[] {
  const fields: IMetadataField[] = [];

  const gps = raw.gps as Record<string, unknown> | undefined;
  if (gps?.latitude != null && gps?.longitude != null) {
    fields.push({
      label: 'GPS Location',
      value: `${Number(gps.latitude).toFixed(5)}, ${Number(gps.longitude).toFixed(5)}`,
      sensitive: true,
    });
  }

  const exif = raw.exif as Record<string, unknown> | undefined;
  if (exif?.DateTimeOriginal) {
    fields.push({ label: 'Date Taken', value: String(exif.DateTimeOriginal), sensitive: false });
  }
  if (exif?.Make || exif?.Model) {
    fields.push({
      label: 'Camera',
      value: [exif.Make, exif.Model].filter(Boolean).join(' '),
      sensitive: false,
    });
  }
  if (exif?.Software) {
    fields.push({ label: 'Software', value: String(exif.Software), sensitive: false });
  }

  return fields;
}

async function stripExif(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
        'image/jpeg',
        0.95
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

function MetadataDisplay({ file }: { file: File | null }) {
  const [metadata, setMetadata] = useState<IMetadataField[] | null>(null);

  useEffect(() => {
    if (!file) {
      setMetadata(null);
      return;
    }
    let cancelled = false;
    exifr
      .parse(file, { gps: true, exif: true, iptc: true, xmp: true })
      .then(raw => {
        if (!cancelled) setMetadata(raw ? parseMetadataFields(raw as Record<string, unknown>) : []);
      })
      .catch(() => {
        if (!cancelled) setMetadata([]);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  if (!file || metadata === null) return null;

  return (
    <div className="mt-4 rounded-lg border border-border p-4 bg-surface">
      {metadata.length === 0 ? (
        <p className="text-sm text-muted-foreground">No metadata found in this image.</p>
      ) : (
        <>
          <p className="mb-2 text-sm font-medium text-text-primary">
            Found {metadata.length} metadata field{metadata.length !== 1 ? 's' : ''}:
          </p>
          <ul className="space-y-1">
            {metadata.map(f => (
              <li key={f.label} className="flex justify-between text-sm">
                <span className={f.sensitive ? 'font-medium text-error' : 'text-muted-foreground'}>
                  {f.label}
                </span>
                <span className="ml-4 truncate text-right text-muted-foreground max-w-[60%]">
                  {f.value}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function ExifRemover(): React.ReactElement {
  const handleProcess = useCallback(async (file: File): Promise<Blob> => {
    return stripExif(file);
  }, []);

  return (
    <InteractiveTool
      title="Remove Metadata From Photo"
      description="Strips GPS location, camera info, and all hidden EXIF data from your image. Processed locally — your photo never leaves your device."
      acceptedFormats={['image/jpeg', 'image/png', 'image/webp', 'image/tiff']}
      maxFileSizeMB={25}
      onProcess={handleProcess}
    >
      {({ file }) => <MetadataDisplay file={file} />}
    </InteractiveTool>
  );
}
