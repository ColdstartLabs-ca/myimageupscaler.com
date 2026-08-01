import { QualityTier } from '@/shared/types/coreflow.types';
import {
  MODEL_MAX_INPUT_PIXELS,
  SCALE_PRESERVING_FALLBACK_MAX_SIDE,
} from '@shared/config/model-costs.config';
import { IMAGE_VALIDATION, getMaxPixelsForQualityTier } from '@shared/validation/upscale.schema';
import { loadImageDimensions } from './file-validation';
import { compressImageWithinByteLimit } from './image-compression';
import {
  getFileMetadataFromBlobType,
  getPreferredCanvasFormatForFile,
  replaceFileExtension,
} from './image-output-format';
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

/**
 * Ensure a queued file still fits the currently selected processing mode.
 * This closes the gap where a file was uploaded under one tier but processed under
 * a stricter tier later.
 */
export async function prepareFileForProcessing(
  file: File,
  qualityTier: QualityTier,
  scale = 2,
  maxBytes: number = IMAGE_VALIDATION.MAX_SIZE_FREE
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

  const output = getPreferredCanvasFormatForFile(file);
  const result = await compressImageWithinByteLimit(
    file,
    {
      maxPixels: resizeMaxPixels,
      ...(resizeMaxSide
        ? {
            maxWidth: resizeMaxSide,
            maxHeight: resizeMaxSide,
          }
        : {}),
      format: output.format,
      quality: 95,
      maintainAspectRatio: true,
    },
    maxBytes
  );

  const emitted = getFileMetadataFromBlobType(result.blob.type, file);

  const resizedFile = new File([result.blob], replaceFileExtension(file.name, emitted.extension), {
    type: emitted.mimeType,
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
