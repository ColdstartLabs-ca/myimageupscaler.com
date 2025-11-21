import { IUpscaleConfig } from '@/types/pixelperfect';

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};

export const processImage = async (
  file: File,
  config: IUpscaleConfig,
  onProgress: (progress: number) => void
): Promise<string> => {
  try {
    onProgress(10);
    const base64Data = await fileToBase64(file);
    onProgress(30);

    onProgress(50);

    const response = await fetch('/api/upscale', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageData: base64Data,
        mimeType: file.type || 'image/jpeg',
        config,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to process image');
    }

    const data = await response.json();
    onProgress(100);

    return data.imageData;
  } catch (error) {
    console.error('AI Processing Error:', error);
    throw error;
  }
};

export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};
