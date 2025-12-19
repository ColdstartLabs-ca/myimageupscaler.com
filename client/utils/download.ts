import { IBatchItem } from '@/shared/types/coreflow.types';
import JSZip from 'jszip';

/**
 * Check if URL is external (Replicate, etc.) or internal (data URL)
 */
const isExternalUrl = (url: string): boolean => {
  return url.startsWith('http://') || url.startsWith('https://');
};

/**
 * Convert image URL to blob using canvas (works even with CORS-restricted URLs if already loaded)
 */
const urlToBlobViaCanvas = async (url: string): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0);

        canvas.toBlob(
          blob => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to convert canvas to blob'));
            }
          },
          'image/png',
          1.0
        );
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for canvas conversion'));
    };

    img.src = url;
  });
};

/**
 * Fetch image blob, trying multiple methods
 */
const fetchImageBlob = async (url: string): Promise<Blob> => {
  // For data URLs, fetch directly
  if (!isExternalUrl(url)) {
    const response = await fetch(url);
    return response.blob();
  }

  // For external URLs, try canvas method first (works if image is already cached)
  try {
    return await urlToBlobViaCanvas(url);
  } catch (canvasError) {
    console.log('Canvas method failed, trying direct fetch:', canvasError);
  }

  // Try direct fetch (might work with CORS)
  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
    });
    if (response.ok) {
      return response.blob();
    }
  } catch (directError) {
    console.log('Direct fetch failed, trying proxy:', directError);
  }

  // Last resort: use proxy
  const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}`;
  const response = await fetch(proxyUrl);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to fetch image: ${response.status}`);
  }
  return response.blob();
};

export const downloadSingle = async (
  url: string | null,
  filename: string,
  mode: string
): Promise<void> => {
  if (!url) {
    throw new Error('No URL provided for download');
  }

  const downloadFilename = `pixelperfect_${mode}_${filename.split('.')[0]}.png`;

  try {
    const blob = await fetchImageBlob(url);
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = downloadFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('Download failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to download image';
    throw new Error(`Download failed: ${errorMessage}`);
  }
};

export const downloadBatch = async (queue: IBatchItem[], mode: string): Promise<void> => {
  const completedItems = queue.filter(item => item.status === 'COMPLETED' && item.processedUrl);

  if (completedItems.length === 0) return;

  // If only one item, just download it normally
  if (completedItems.length === 1) {
    const item = completedItems[0];
    await downloadSingle(item.processedUrl, item.file.name, mode);
    return;
  }

  const zip = new JSZip();
  const folder = zip.folder('pixelperfect_batch');

  // Add files to zip
  const promises = completedItems.map(async item => {
    if (item.processedUrl && folder) {
      try {
        const blob = await fetchImageBlob(item.processedUrl);
        const filename = `pixelperfect_${mode}_${item.file.name.split('.')[0]}.png`;
        folder.file(filename, blob);
      } catch (error) {
        console.error(`Failed to add ${item.file.name} to zip:`, error);
      }
    }
  });

  await Promise.all(promises);

  // Generate and download zip
  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);

  const link = document.createElement('a');
  link.href = url;
  link.download = `pixelperfect_batch_${new Date().getTime()}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
