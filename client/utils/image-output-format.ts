export type TCanvasImageFormat = 'jpeg' | 'png' | 'webp';

export function replaceFileExtension(fileName: string, extension: string): string {
  return /\.[^/.]+$/.test(fileName)
    ? fileName.replace(/\.[^/.]+$/, `.${extension}`)
    : `${fileName}.${extension}`;
}

export function getPreferredCanvasFormatForFile(file: File): {
  format: TCanvasImageFormat;
  mimeType: string;
  extension: string;
} {
  if (file.type === 'image/png') {
    return { format: 'png', mimeType: 'image/png', extension: 'png' };
  }

  if (file.type === 'image/webp') {
    return { format: 'webp', mimeType: 'image/webp', extension: 'webp' };
  }

  return { format: 'jpeg', mimeType: 'image/jpeg', extension: 'jpg' };
}

export function getFileMetadataFromBlobType(
  blobType: string,
  originalFile: File
): { mimeType: string; extension: string } {
  const fallback = getPreferredCanvasFormatForFile(originalFile);

  if (blobType === 'image/png') {
    return {
      mimeType: 'image/png',
      extension: 'png',
    };
  }

  if (blobType === 'image/webp') {
    return {
      mimeType: 'image/webp',
      extension: 'webp',
    };
  }

  if (blobType === 'image/jpeg') {
    return {
      mimeType: 'image/jpeg',
      extension: 'jpg',
    };
  }

  return {
    mimeType: fallback.mimeType,
    extension: fallback.extension,
  };
}
