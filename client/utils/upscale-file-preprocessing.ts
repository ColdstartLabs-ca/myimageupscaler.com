import { QualityTier } from '@/shared/types/coreflow.types';
import { getMaxPixelsForQualityTier } from '@shared/validation/upscale.schema';
import { loadImageDimensions } from './file-validation';
import { compressImage } from './image-compression';
import { isAutoResizeEnabled } from './auto-resize-preference';

export interface IPreparedFileForProcessing {
  file: File;
  resized: boolean;
  maxPixels: number | null;
  dimensions?: {
    width: number;
    height: number;
    pixels: number;
  };
}

function replaceExtension(fileName: string, extension: string): string {
  return /\.[^/.]+$/.test(fileName)
    ? fileName.replace(/\.[^/.]+$/, `.${extension}`)
    : `${fileName}.${extension}`;
}

/**
 * Ensure a queued file still fits the currently selected processing mode.
 * This closes the gap where a file was uploaded under one tier but processed under
 * a stricter tier later.
 */
export async function prepareFileForProcessing(
  file: File,
  qualityTier: QualityTier
): Promise<IPreparedFileForProcessing> {
  const maxPixels = getMaxPixelsForQualityTier(qualityTier);

  let width: number;
  let height: number;

  try {
    const dimensions = await loadImageDimensions(file);
    width = dimensions.width;
    height = dimensions.height;
  } catch {
    return {
      file,
      resized: false,
      maxPixels,
    };
  }

  const pixels = width * height;
  const dimensions = { width, height, pixels };

  if (maxPixels === null || pixels <= maxPixels || !isAutoResizeEnabled()) {
    return {
      file,
      resized: false,
      maxPixels,
      dimensions,
    };
  }

  const result = await compressImage(file, {
    maxPixels,
    format: 'jpeg',
    maintainAspectRatio: true,
  });

  const resizedFile = new File([result.blob], replaceExtension(file.name, 'jpg'), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });

  return {
    file: resizedFile,
    resized: true,
    maxPixels,
    dimensions: {
      width: result.dimensions.width,
      height: result.dimensions.height,
      pixels: result.dimensions.width * result.dimensions.height,
    },
  };
}
