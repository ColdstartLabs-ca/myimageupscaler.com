
export enum ProcessingStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export type ProcessingMode = 'upscale' | 'enhance' | 'both' | 'custom';

export interface IUpscaleConfig {
  mode: ProcessingMode;
  scale: 2 | 4;
  enhanceFace: boolean;
  preserveText: boolean;
  denoise: boolean;
  customPrompt?: string;
}

export interface IBatchItem {
  id: string;
  file: File;
  previewUrl: string;
  processedUrl: string | null;
  status: ProcessingStatus;
  progress: number;
  error?: string;
}

export interface IProcessedImage {
  originalUrl: string;
  processedUrl: string | null;
  originalSize: number; // bytes
  processedSize?: number; // bytes
  width: number;
  height: number;
  status: ProcessingStatus;
  progress: number;
  error?: string;
}

export interface IPricingTier {
  name: string;
  price: string;
  credits: number;
  features: string[];
  recommended?: boolean;
}