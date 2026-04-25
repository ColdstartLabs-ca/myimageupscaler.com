/**
 * Extension API Client
 * Handles API calls to the main application's /api/upscale endpoint
 */

import type { IUpscaleConfig, IUpscaleResponse } from '@shared/types/coreflow.types';

export interface IUpscaleRequest {
  imageData: string; // base64 data URL
  mimeType: string;
  config: IUpscaleConfig;
}

const API_BASE_URL = 'https://myimageupscaler.com';
const DEV_API_BASE_URL = 'http://localhost:3000';

function getApiBaseUrl(): string {
  // In extension context, check for dev mode via Vite's import.meta.env
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    return import.meta.env.DEV ? DEV_API_BASE_URL : API_BASE_URL;
  }
  return import.meta.env.DEV ? DEV_API_BASE_URL : API_BASE_URL;
}

/**
 * Upscale an image via the /api/upscale endpoint
 */
export async function upscaleImage(
  imageData: string,
  mimeType: string,
  accessToken: string,
  config?: Partial<IUpscaleConfig>
): Promise<IUpscaleResponse> {
  const apiBaseUrl = getApiBaseUrl();

  const defaultConfig: IUpscaleConfig = {
    qualityTier: 'auto',
    scale: 2,
    additionalOptions: {
      smartAnalysis: false,
      enhance: true,
      enhanceFaces: false,
      preserveText: false,
      enhancement: {
        clarity: true,
        color: true,
        lighting: false,
        denoise: true,
        artifacts: true,
        details: false,
      },
    },
  };

  const request: IUpscaleRequest = {
    imageData,
    mimeType,
    config: { ...defaultConfig, ...config },
  };

  const response = await fetch(`${apiBaseUrl}/api/upscale`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: { message: 'Unknown error' },
    }));
    throw new Error(error.error?.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get current credits balance
 */
export async function getCredits(accessToken: string): Promise<number> {
  const apiBaseUrl = getApiBaseUrl();

  const response = await fetch(`${apiBaseUrl}/api/users/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch credits');
  }

  const data = await response.json();
  return data.creditsRemaining || 0;
}
