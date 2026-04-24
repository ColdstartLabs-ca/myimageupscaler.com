/**
 * Extension-specific types and interfaces
 */

export interface IExtensionSession {
  userId: string | null;
  accessToken: string | null;
  creditsRemaining: number;
  expiresAt: number | null;
}

export interface IStorageState {
  session: IExtensionSession;
  settings: IExtensionSettings;
}

export interface IExtensionSettings {
  defaultScale: 2 | 4 | 8;
  defaultTier: 'auto' | 'quick' | 'face-restore' | 'hd-upscale' | 'ultra';
  showNotifications: boolean;
}

export const DEFAULT_SETTINGS: IExtensionSettings = {
  defaultScale: 2,
  defaultTier: 'auto',
  showNotifications: true,
};

export type ExtensionMessage =
  | { type: 'IMAGE_HOVERED'; imageUrl: string }
  | { type: 'GET_LAST_IMAGE' }
  | { type: 'OPEN_SIDEPANEL' }
  | { type: 'UPSCALE_IMAGE'; imageUrl: string; tabId?: number }
  | { type: 'PROCESS_UPSCALE_REQUEST'; imageUrl: string; imageElement?: string }
  | { type: 'START_UPSCALE'; imageUrl: string; originalUrl?: string }
  | { type: 'SHOW_UPSCALE_PROGRESS'; imageUrl: string }
  | { type: 'UPSCALE_COMPLETE'; result: any }
  | { type: 'UPSCALE_ERROR'; error: string }
  | { type: 'AUTH_COMPLETE'; session: IExtensionSession }
  | { type: 'GET_SESSION' }
  | { type: 'LOGOUT' }
  | { type: 'FETCH_IMAGE_FROM_PAGE'; imageUrl: string }
  | { type: 'IMAGE_FETCHER_READY' }
  | { type: 'GET_AUTH_FROM_PAGE' };

export type UpscaleProgress = {
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error' | 'signin_required';
  progress: number;
  imageUrl?: string;
  resultImageUrl?: string;
  error?: string;
  creditsUsed?: number;
  creditsRemaining?: number;
};
