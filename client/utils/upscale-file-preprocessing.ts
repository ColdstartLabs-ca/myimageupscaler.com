import { QualityTier } from '@/shared/types/coreflow.types';
import {
  MODEL_MAX_INPUT_PIXELS,
  SCALE_PRESERVING_FALLBACK_MAX_SIDE,
} from '@shared/config/model-costs.config';
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
  qualityTier: QualityTier,
  scale = 2
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

  let resizeMaxPixels = maxPixels;
  let resizeMaxSide: number | undefined;
  let requiresResize = false;

  if (qualityTier === 'quick') {
    const realEsrganMaxPixels = MODEL_MAX_INPUT_PIXELS['real-esrgan'];
    const fitsRealEsrgan = pixels <= realEsrganMaxPixels;
    const fitsScalePreservingFallback =
      scale === 2 &&
      width <= SCALE_PRESERVING_FALLBACK_MAX_SIDE &&
      height <= SCALE_PRESERVING_FALLBACK_MAX_SIDE &&
      pixels <= MODEL_MAX_INPUT_PIXELS['clarity-upscaler'];

    if (fitsRealEsrgan || fitsScalePreservingFallback) {
      return {
        file,
        resized: false,
        maxPixels,
        dimensions,
      };
    }

    requiresResize = true;
    if (scale === 2) {
      resizeMaxPixels = MODEL_MAX_INPUT_PIXELS['clarity-upscaler'];
      resizeMaxSide = SCALE_PRESERVING_FALLBACK_MAX_SIDE;
    } else {
      resizeMaxPixels = realEsrganMaxPixels;
    }
  }

  if (
    resizeMaxPixels === null ||
    (!requiresResize && pixels <= resizeMaxPixels) ||
    !isAutoResizeEnabled()
  ) {
    return {
      file,
      resized: false,
      maxPixels,
      dimensions,
    };
  }

  const result = await compressImage(file, {
    maxPixels: resizeMaxPixels,
    ...(resizeMaxSide
      ? {
          maxWidth: resizeMaxSide,
          maxHeight: resizeMaxSide,
        }
      : {}),
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
