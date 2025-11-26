import JSZip from 'jszip';
import { IBatchItem } from '@shared/types/pixelperfect';

export const downloadSingle = (url: string | null, filename: string, mode: string): void => {
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  link.download = `pixelperfect_${mode}_${filename.split('.')[0]}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const downloadBatch = async (queue: IBatchItem[], mode: string): Promise<void> => {
  const completedItems = queue.filter(item => item.status === 'COMPLETED' && item.processedUrl);

  if (completedItems.length === 0) return;

  // If only one item, just download it normally
  if (completedItems.length === 1) {
    const item = completedItems[0];
    downloadSingle(item.processedUrl, item.file.name, mode);
    return;
  }

  const zip = new JSZip();
  const folder = zip.folder('pixelperfect_batch');

  // Add files to zip
  const promises = completedItems.map(async item => {
    if (item.processedUrl && folder) {
      // Fetch the data URL to get a blob
      const response = await fetch(item.processedUrl);
      const blob = await response.blob();
      const filename = `pixelperfect_${mode}_${item.file.name.split('.')[0]}.png`;
      folder.file(filename, blob);
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
