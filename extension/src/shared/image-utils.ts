/**
 * Image Utilities for Extension
 * Helper functions for image processing
 */

/**
 * Convert a File to base64 data URL
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}

/**
 * Fetch an image from URL and convert to base64
 * Note: This may fail due to CORS - use with caution
 */
export async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}

/**
 * Get image dimensions from a base64 string
 */
export async function getImageDimensions(base64: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      if (img.src.startsWith('blob:')) {
        URL.revokeObjectURL(img.src);
      }
    };
    img.onerror = () => resolve(null);
    img.src = base64;
  });
}

/**
 * Determine if a string is a valid data URL
 */
export function isDataUrl(str: string): boolean {
  return /^data:image\/[a-z]+;base64,/i.test(str);
}
