/**
 * ZIP file download utilities
 * Provides functionality to create and download ZIP archives from multiple files
 */

import JSZip from 'jszip';
import { clientEnv } from '@shared/config/env';

export interface IZipFileItem {
  blob: Blob;
  filename: string;
  path?: string; // Optional subdirectory path within the ZIP
}

export interface IZipDownloadOptions {
  zipFilename?: string; // Custom filename for the ZIP (default: auto-generated)
  folderName?: string; // Folder name inside ZIP (default: from env)
  onProgress?: (progress: number) => void; // Progress callback (0-100)
  compressionLevel?: number; // 0-9 (default: 6)
}

/**
 * Generate a timestamped ZIP filename
 *
 * @param prefix - Filename prefix (default: from clientEnv)
 * @param suffix - Optional suffix to add before timestamp
 * @returns Generated filename in format: {prefix}_{suffix}_{timestamp}.zip
 *
 * @example
 * ```typescript
 * const filename = generateZipFilename(); // "saas-boilerplate_batch_1704067200000.zip"
 * const customFilename = generateZipFilename('export', 'batch'); // "saas-boilerplate_export_batch_1704067200000.zip"
 * ```
 */
export function generateZipFilename(prefix?: string, suffix?: string): string {
  const actualPrefix = prefix || clientEnv.DOWNLOAD_PREFIX;
  const timestamp = Date.now();
  const parts = [actualPrefix, suffix, timestamp].filter(Boolean);
  return `${parts.join('_')}.zip`;
}

/**
 * Download multiple files as a ZIP archive
 *
 * @param files - Array of files to include in the ZIP
 * @param options - Download options
 * @returns Promise that resolves when download is complete
 *
 * @example
 * ```typescript
 * await downloadAsZip([
 *   { blob: imageBlob1, filename: 'image1.png' },
 *   { blob: imageBlob2, filename: 'image2.png' },
 * ], {
 *   folderName: 'upscaled_images',
 *   onProgress: (percent) => console.log(`Zipping: ${percent}%`)
 * });
 * ```
 */
export async function downloadAsZip(
  files: IZipFileItem[],
  options: IZipDownloadOptions = {}
): Promise<void> {
  const {
    zipFilename,
    folderName = clientEnv.BATCH_FOLDER_NAME,
    onProgress,
    compressionLevel = 6,
  } = options;

  if (!files.length) {
    throw new Error('No files provided for ZIP download');
  }

  const filename = zipFilename || generateZipFilename();

  try {
    // Create new ZIP instance
    const zip = new JSZip();

    // Create folder in ZIP
    const folder = zip.folder(folderName);
    if (!folder) {
      throw new Error('Failed to create folder in ZIP archive');
    }

    // Add files to ZIP
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = file.path ? `${file.path}/${file.filename}` : file.filename;
      folder.file(filePath, file.blob);

      // Update progress (0-50% for file addition)
      if (onProgress) {
        const progress = Math.round(((i + 1) / files.length) * 50);
        onProgress(progress);
      }
    }

    // Generate ZIP blob
    const content = await zip.generateAsync(
      {
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: compressionLevel },
      },
      (metadata: { percent: number }) => {
        // Update progress during ZIP generation (50-100%)
        if (onProgress) {
          const progress = Math.round(50 + metadata.percent * 0.5);
          onProgress(progress);
        }
      }
    );

    // Trigger download
    triggerDownload(content, filename);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to create ZIP file: ${errorMessage}`);
  }
}

/**
 * Create a ZIP blob without triggering download
 * Useful for pre-generating ZIPs or custom download handling
 *
 * @param files - Array of files to include in the ZIP
 * @param options - ZIP generation options
 * @returns Promise resolving to ZIP blob
 *
 * @example
 * ```typescript
 * const zipBlob = await createZipBlob([
 *   { blob: imageBlob, filename: 'image.png' }
 * ]);
 * // Upload to server, store for later, etc.
 * ```
 */
export async function createZipBlob(
  files: IZipFileItem[],
  options: Omit<IZipDownloadOptions, 'zipFilename' | 'onProgress'> = {}
): Promise<Blob> {
  const { folderName = clientEnv.BATCH_FOLDER_NAME, compressionLevel = 6 } = options;

  if (!files.length) {
    throw new Error('No files provided for ZIP creation');
  }

  try {
    const zip = new JSZip();
    const folder = zip.folder(folderName);

    if (!folder) {
      throw new Error('Failed to create folder in ZIP archive');
    }

    // Add files to ZIP
    for (const file of files) {
      const filePath = file.path ? `${file.path}/${file.filename}` : file.filename;
      folder.file(filePath, file.blob);
    }

    // Generate ZIP blob
    const content = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    });

    return content;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to create ZIP blob: ${errorMessage}`);
  }
}

/**
 * Trigger browser download for a blob
 *
 * @param blob - Blob to download
 * @param filename - Filename for downloaded file
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up object URL after a short delay
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Estimate ZIP file size before generation
 * Useful for showing size estimates to users
 *
 * @param files - Array of files to be zipped
 * @param compressionLevel - Compression level (0-9)
 * @returns Estimated size in bytes
 *
 * @example
 * ```typescript
 * const estimatedSize = estimateZipSize(files);
 * const sizeMB = (estimatedSize / 1024 / 1024).toFixed(2);
 * console.log(`Estimated ZIP size: ${sizeMB} MB`);
 * ```
 */
export function estimateZipSize(files: IZipFileItem[], compressionLevel: number = 6): number {
  const totalSize = files.reduce((sum, file) => sum + file.blob.size, 0);

  // Compression ratios are approximate:
  // - Level 0 (store): 100% (no compression)
  // - Level 6 (default): ~60-70% of original
  // - Level 9 (maximum): ~50-60% of original
  const compressionRatio = 1 - (compressionLevel / 10) * 0.5;

  return Math.round(totalSize * compressionRatio);
}

/**
 * Format file size for display
 *
 * @param bytes - Size in bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted size string (e.g., "1.5 MB")
 */
export function formatSize(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Validate files before creating ZIP
 * Checks for duplicate filenames, invalid characters, etc.
 *
 * @param files - Array of files to validate
 * @returns Validation result with any issues found
 *
 * @example
 * ```typescript
 * const validation = validateZipFiles(files);
 * if (!validation.valid) {
 *   console.error('Issues:', validation.issues);
 * }
 * ```
 */
export interface IZipFileValidation {
  valid: boolean;
  issues: string[];
  duplicates: Array<{ original: string; duplicates: string[] }>;
}

export function validateZipFiles(files: IZipFileItem[]): IZipFileValidation {
  const issues: string[] = [];
  const duplicates: Array<{ original: string; duplicates: string[] }> = [];

  // Check for empty array
  if (!files.length) {
    return {
      valid: false,
      issues: ['No files provided'],
      duplicates: [],
    };
  }

  // Check for duplicate filenames
  const filenameMap = new Map<string, string[]>();
  for (const file of files) {
    const key = file.path ? `${file.path}/${file.filename}` : file.filename;
    if (!filenameMap.has(key)) {
      filenameMap.set(key, []);
    }
    filenameMap.get(key)!.push(key);
  }

  for (const [filename, occurrences] of filenameMap) {
    if (occurrences.length > 1) {
      duplicates.push({ original: filename, duplicates: occurrences.slice(1) });
      issues.push(`Duplicate filename: ${filename}`);
    }
  }

  // Check for invalid characters in filenames
  const invalidChars = /[<>:"/\\|?*]/;
  for (const file of files) {
    if (invalidChars.test(file.filename)) {
      issues.push(`Invalid characters in filename: ${file.filename}`);
    }
  }

  // Check for empty filenames
  for (const file of files) {
    if (!file.filename.trim()) {
      issues.push('Empty filename detected');
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    duplicates,
  };
}

/**
 * Create a ZIP file from URLs (fetches blobs first)
 * Useful when you have image URLs instead of blobs
 *
 * @param urlsWithFilenames - Array of URL and filename pairs
 * @param options - ZIP download options
 * @returns Promise that resolves when download is complete
 *
 * @example
 * ```typescript
 * await downloadUrlsAsZip([
 *   { url: 'https://example.com/image1.png', filename: 'image1.png' },
 *   { url: 'https://example.com/image2.png', filename: 'image2.png' },
 * ]);
 * ```
 */
export async function downloadUrlsAsZip(
  urlsWithFilenames: Array<{ url: string; filename: string }>,
  options: IZipDownloadOptions = {}
): Promise<void> {
  // Fetch all URLs as blobs
  const files: IZipFileItem[] = await Promise.all(
    urlsWithFilenames.map(async ({ url, filename }) => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
        }
        const blob = await response.blob();
        return { blob, filename };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to fetch ${filename}: ${errorMessage}`);
      }
    })
  );

  // Download as ZIP
  await downloadAsZip(files, options);
}
