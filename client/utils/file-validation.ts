import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';

export interface IDimensionInfo {
  width: number;
  height: number;
  pixels: number;
}

export interface IFileValidationResult {
  valid: boolean;
  reason?: 'type' | 'size' | 'dimensions';
  dimensions?: IDimensionInfo;
  errorMessage?: string;
  detectedMimeType?: string;
}

export interface IProcessFilesResult {
  validFiles: File[];
  oversizedFiles: File[];
  oversizedDimensionFiles: Array<{ file: File; dimensions: IDimensionInfo }>;
  invalidTypeFiles: File[];
  errorMessage: string | null;
}

const MAGIC_BYTE_SIGNATURES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
};

/** Brands that identify an ISO base-media file as HEIC/HEIF rather than video. */
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'];

function normalizeMimeType(mimeType: string): string {
  return mimeType.toLowerCase() === 'image/jpg' ? 'image/jpeg' : mimeType.toLowerCase();
}

function isAllowedType(mimeType: string): boolean {
  return (IMAGE_VALIDATION.ALLOWED_TYPES as readonly string[]).includes(
    normalizeMimeType(mimeType)
  );
}

async function detectFileMimeType(file: File): Promise<string | null> {
  const headerBlob = file.slice(0, 12);
  const headerBuffer =
    typeof headerBlob.arrayBuffer === 'function'
      ? await headerBlob.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(new Error(`Failed to read image header: ${file.name}`));
          reader.readAsArrayBuffer(headerBlob);
        });
  const header = new Uint8Array(headerBuffer);

  for (const [mimeType, signature] of Object.entries(MAGIC_BYTE_SIGNATURES)) {
    if (signature.every((byte, index) => header[index] === byte)) {
      if (mimeType === 'image/webp') {
        const webpSignature = [0x57, 0x45, 0x42, 0x50]; // WEBP
        if (!webpSignature.every((byte, index) => header[index + 8] === byte)) {
          continue;
        }
      }
      return mimeType;
    }
  }

  // ISO base-media container ('ftyp'). Only report HEIC when the brand at bytes
  // 8-11 is an actual HEIF brand — otherwise this matches MP4/MOV/M4A too.
  if (header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70) {
    const brand = String.fromCharCode(header[8], header[9], header[10], header[11]).toLowerCase();
    return HEIF_BRANDS.includes(brand) ? 'image/heic' : null;
  }

  return null;
}

/**
 * Load image dimensions using the browser's Image API
 * Returns width and height of the image
 */
export async function loadImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl); // Clean up to prevent memory leaks
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to load image: ${file.name}`));
    };

    img.src = objectUrl;
  });
}

/**
 * Check if image dimensions exceed the maximum pixel limit
 */
export function exceedsMaxPixels(
  width: number,
  height: number,
  maxPixels?: number | null
): boolean {
  if (maxPixels === null) {
    return false;
  }

  const limit = maxPixels ?? IMAGE_VALIDATION.MAX_PIXELS;
  return width * height > limit;
}

/**
 * Validate an image file for type, size, and optionally dimensions
 * Note: Dimension validation requires async loading, use validateImageFileWithDimensions for full validation
 */
export function validateImageFile(file: File, isPaidUser: boolean): IFileValidationResult {
  // Check file type. An absent `file.type` is missing information, not evidence of a
  // bad file (common on mobile and some drag-and-drop paths), so it is allowed through
  // here and resolved by magic-byte sniffing in validateImageFileWithDimensions.
  if (file.type !== '' && !isAllowedType(file.type)) {
    return { valid: false, reason: 'type' };
  }

  // Check file size
  const maxSize = isPaidUser ? IMAGE_VALIDATION.MAX_SIZE_PAID : IMAGE_VALIDATION.MAX_SIZE_FREE;
  if (file.size > maxSize) {
    return { valid: false, reason: 'size' };
  }

  return { valid: true };
}

/**
 * Validate an image file including dimension check
 * This is async because it needs to load the image to get dimensions
 */
export async function validateImageFileWithDimensions(
  file: File,
  isPaidUser: boolean,
  maxPixels?: number | null
): Promise<IFileValidationResult> {
  // First do synchronous validation (type and size)
  const basicResult = validateImageFile(file, isPaidUser);
  if (!basicResult.valid) {
    return basicResult;
  }

  // The detected content type is authoritative; `file.type` is only a hint. A file
  // whose content is a supported image is accepted even when the browser labelled it
  // as a different supported format (a real PNG named .jpg is a normal user file, not
  // an attack). The security property is unchanged: content must still sniff to a
  // supported image format, and an attacker controls the claimed label anyway — so
  // requiring the two to agree only ever rejected honest uploads.
  const detectedMimeType = await detectFileMimeType(file);
  if (!detectedMimeType) {
    return {
      valid: false,
      reason: 'type',
      errorMessage: 'Unrecognized image format',
    };
  }

  if (!isAllowedType(detectedMimeType)) {
    return {
      valid: false,
      reason: 'type',
      detectedMimeType,
      errorMessage: `Unsupported image format: ${detectedMimeType}`,
    };
  }

  // Then check dimensions
  try {
    const { width, height } = await loadImageDimensions(file);
    const pixels = width * height;
    if (maxPixels === null) {
      return { valid: true };
    }

    const limit = maxPixels ?? IMAGE_VALIDATION.MAX_PIXELS;

    if (pixels > limit) {
      return {
        valid: false,
        reason: 'dimensions',
        dimensions: { width, height, pixels },
      };
    }

    return { valid: true };
  } catch {
    // If we can't load the image, let it through
    // The server will reject it if it's actually invalid
    return { valid: true };
  }
}

/**
 * Process files synchronously (type and size validation only)
 * Use processFilesAsync for full validation including dimensions
 */
export function processFiles(files: File[], isPaidUser: boolean): IProcessFilesResult {
  const results = files.map(f => ({ file: f, result: validateImageFile(f, isPaidUser) }));
  const validFiles = results.filter(r => r.result.valid).map(r => r.file);
  const oversizedFiles = results
    .filter(r => !r.result.valid && r.result.reason === 'size')
    .map(r => r.file);
  const invalidTypeFiles = results
    .filter(r => !r.result.valid && r.result.reason === 'type')
    .map(r => r.file);

  let errorMessage: string | null = null;
  if (validFiles.length !== files.length) {
    const maxMB = isPaidUser ? 25 : 5;
    errorMessage = `Some files were rejected. Only JPG, PNG, WEBP under ${maxMB}MB are allowed.`;
  }

  return {
    validFiles,
    oversizedFiles,
    oversizedDimensionFiles: [],
    invalidTypeFiles,
    errorMessage,
  };
}

/**
 * Process files asynchronously with full validation including dimension checks
 * This is the recommended function for client-side validation before upload
 */
export async function processFilesAsync(
  files: File[],
  isPaidUser: boolean,
  maxPixels?: number | null
): Promise<IProcessFilesResult> {
  const results = await Promise.all(
    files.map(async f => ({
      file: f,
      result: await validateImageFileWithDimensions(f, isPaidUser, maxPixels),
    }))
  );

  const validFiles = results.filter(r => r.result.valid).map(r => r.file);
  const oversizedFiles = results
    .filter(r => !r.result.valid && r.result.reason === 'size')
    .map(r => r.file);
  const oversizedDimensionFiles = results
    .filter(r => !r.result.valid && r.result.reason === 'dimensions')
    .map(r => ({ file: r.file, dimensions: r.result.dimensions! }));
  const invalidTypeFiles = results
    .filter(r => !r.result.valid && r.result.reason === 'type')
    .map(r => r.file);

  let errorMessage: string | null = null;
  const rejectedCount = files.length - validFiles.length;

  if (rejectedCount > 0) {
    const maxMB = isPaidUser ? 25 : 5;
    const maxPixelsDisplay =
      maxPixels === null
        ? null
        : (() => {
            const maxPixelsRaw = (maxPixels ?? IMAGE_VALIDATION.MAX_PIXELS) / 1_000_000;
            return Number.isInteger(maxPixelsRaw)
              ? maxPixelsRaw.toFixed(0)
              : maxPixelsRaw.toFixed(1);
          })();

    // Build specific error message based on what was rejected
    const hasSizeIssues = oversizedFiles.length > 0;
    const hasDimensionIssues = oversizedDimensionFiles.length > 0;
    const hasTypeIssues = invalidTypeFiles.length > 0;

    if (hasDimensionIssues && !hasSizeIssues && !hasTypeIssues) {
      errorMessage =
        maxPixelsDisplay == null
          ? 'Some images need to be resized before processing.'
          : `Some images exceed the ${maxPixelsDisplay}MP pixel limit and need to be resized.`;
    } else if (hasSizeIssues && !hasDimensionIssues && !hasTypeIssues) {
      errorMessage = `Some files exceed the ${maxMB}MB size limit.`;
    } else if (hasTypeIssues && !hasSizeIssues && !hasDimensionIssues) {
      errorMessage = 'Some files are not valid image formats. Only JPG, PNG, WEBP are allowed.';
    } else {
      // Multiple issues
      errorMessage =
        maxPixelsDisplay == null
          ? `Some files were rejected. Max ${maxMB}MB. JPG, PNG, WEBP only.`
          : `Some files were rejected. Max ${maxMB}MB, ${maxPixelsDisplay}MP pixels. JPG, PNG, WEBP only.`;
    }
  }

  return {
    validFiles,
    oversizedFiles,
    oversizedDimensionFiles,
    invalidTypeFiles,
    errorMessage,
  };
}
