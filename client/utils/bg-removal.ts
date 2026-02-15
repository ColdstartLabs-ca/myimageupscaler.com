import { ProcessingStage } from '@/shared/types/coreflow.types';

type ProgressCallback = (progress: number, stage?: ProcessingStage) => void;

// Cache the imported function to avoid re-loading the library
let removeBackgroundFn: typeof import('@imgly/background-removal').removeBackground | null = null;

export interface IBackgroundRemovalResult {
  imageUrl: string;
  creditsUsed: number;
}

/**
 * Processes an image to remove its background using client-side ML.
 * Uses @imgly/background-removal library which runs entirely in the browser.
 *
 * @param file - The image file to process
 * @param onProgress - Callback for progress updates
 * @returns The blob URL of the processed image and credits used (always 0 for client-side)
 */
export async function processBackgroundRemoval(
  file: File,
  onProgress: ProgressCallback
): Promise<IBackgroundRemovalResult> {
  // Stage 1: Loading model (lazy load, cached after first use)
  onProgress(10, ProcessingStage.PREPARING);

  if (!removeBackgroundFn) {
    const { removeBackground } = await import('@imgly/background-removal');
    removeBackgroundFn = removeBackground;
  }

  onProgress(30, ProcessingStage.ENHANCING);

  // Stage 2: Process the image
  const result = await removeBackgroundFn(file, {
    progress: (_key: string, current: number, total: number) => {
      // Scale progress from 30% to 95% during processing
      const pct = 30 + Math.round((current / total) * 65);
      onProgress(pct, ProcessingStage.ENHANCING);
    },
    output: { format: 'image/png', quality: 1 },
  });

  // Stage 3: Create blob URL for the result
  onProgress(95, ProcessingStage.FINALIZING);
  const url = URL.createObjectURL(result);
  onProgress(100, ProcessingStage.FINALIZING);

  return { imageUrl: url, creditsUsed: 1 };
}
