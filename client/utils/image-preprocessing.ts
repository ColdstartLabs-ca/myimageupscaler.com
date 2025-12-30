interface IPreprocessedImage {
  /** Base64 image data (resized for analysis) */
  imageData: string;
  /** MIME type (always image/jpeg after preprocessing) */
  mimeType: 'image/jpeg';
  /** Original image metadata */
  original: {
    width: number;
    height: number;
    fileSize: number;
    mimeType: string;
  };
}

const MAX_ANALYSIS_DIMENSION = 1024;
const ANALYSIS_QUALITY = 0.8;

/**
 * Preprocesses an image for LLM analysis by resizing and compressing it.
 * This reduces bandwidth and processing time while maintaining quality for analysis.
 *
 * @param file - The original image file
 * @returns Preprocessed image with base64 data and metadata
 */
export async function preprocessForAnalysis(file: File): Promise<IPreprocessedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const objectUrl = URL.createObjectURL(file);

    if (!ctx) {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Canvas not supported'));
      return;
    }

    img.onload = () => {
      // Calculate resize dimensions (max 1024px on longest edge)
      let { width, height } = img;
      if (width > MAX_ANALYSIS_DIMENSION || height > MAX_ANALYSIS_DIMENSION) {
        const scale = MAX_ANALYSIS_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to JPEG for smaller size
      const imageData = canvas.toDataURL('image/jpeg', ANALYSIS_QUALITY);

      URL.revokeObjectURL(objectUrl);

      resolve({
        imageData,
        mimeType: 'image/jpeg',
        original: {
          width: img.width,
          height: img.height,
          fileSize: file.size,
          mimeType: file.type,
        },
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };

    img.src = objectUrl;
  });
}

/**
 * Checks if an image needs preprocessing for analysis
 *
 * @param file - The image file to check
 * @returns true if the image should be preprocessed
 */
export function needsPreprocessing(file: File): boolean {
  // Check file size - if over 1MB, definitely needs resizing
  if (file.size > 1024 * 1024) {
    return true;
  }

  // For images under 1MB, we'll still need to check dimensions
  // This function is a quick check, actual dimension check happens in preprocessForAnalysis
  return true;
}
