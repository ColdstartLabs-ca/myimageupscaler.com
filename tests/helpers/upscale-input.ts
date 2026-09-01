import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { serverEnv } from '@shared/config/env';

import { AuthenticatedApiClient, ApiResponse } from './api-client';

const UPSCALE_INPUT_BUCKET = 'upscale-inputs';

const extensionByMime: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

export interface IUpscaleInputUpload {
  storagePath: string;
  jobId: string;
  mimeType: string;
}

/**
 * Upload image bytes through the production direct-upload flow.
 *
 * `/api/upscale` accepts metadata only: bytes go to private storage first.
 * This helper performs the same two steps as client/utils/api-client.ts:
 *   1. POST /api/upscale/upload for a signed grant (auth + tier size limits)
 *   2. Upload the bytes to the signed upload URL
 */
export async function uploadUpscaleInput(
  api: AuthenticatedApiClient,
  image: { dataUrl: string; mimeType: string }
): Promise<IUpscaleInputUpload> {
  const extension = extensionByMime[image.mimeType];
  if (!extension) {
    throw new Error(`Unsupported upscale test image type: ${image.mimeType}`);
  }

  const base64Payload = image.dataUrl.slice(image.dataUrl.indexOf(',') + 1);
  const bytes = Buffer.from(base64Payload, 'base64');
  const jobId = randomUUID();

  const grant = await api.post<{
    storagePath: string;
    uploadToken: string;
  }>('/api/upscale/upload', {
    filename: `test-image.${extension}`,
    mimeType: image.mimeType,
    sizeBytes: bytes.byteLength,
    jobId,
  });

  if (grant.status !== 200 || !grant.raw.ok()) {
    throw new Error(`Upload grant failed (${grant.status}): ${JSON.stringify(await grant.json())}`);
  }

  const grantBody = await grant.json();

  const supabaseUrl = serverEnv.NEXT_PUBLIC_SUPABASE_URL ?? serverEnv.SUPABASE_URL;
  const supabaseKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY || serverEnv.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials are required to upload test upscale inputs');
  }

  const { error } = await createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })
    .storage.from(UPSCALE_INPUT_BUCKET)
    .uploadToSignedUrl(
      grantBody.storagePath,
      grantBody.uploadToken,
      new Blob([bytes], { type: image.mimeType }),
      {
        contentType: image.mimeType,
        upsert: false,
      }
    );
  if (error) {
    throw new Error(`Signed upload failed: ${error.message}`);
  }

  return { storagePath: grantBody.storagePath, jobId, mimeType: image.mimeType };
}

/**
 * Store a test image and POST the storage-metadata request to /api/upscale.
 * Replaces the legacy inline `imageData` request shape.
 */
export async function postUpscaleWithStoredImage(
  api: AuthenticatedApiClient,
  image: { dataUrl: string; mimeType: string },
  config: Record<string, unknown>
): Promise<ApiResponse<unknown>> {
  const upload = await uploadUpscaleInput(api, image);

  return api.post('/api/upscale', {
    storagePath: upload.storagePath,
    jobId: upload.jobId,
    mimeType: upload.mimeType,
    config,
  });
}
