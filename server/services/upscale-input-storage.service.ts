import { Buffer } from 'node:buffer';

import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';
import { isUuidV4 } from '@shared/validation/uuid';

const BUCKET_NAME = 'upscale-inputs';
const VALIDATION_PREFIX_LAST_BYTE = 64 * 1024 - 1;
const VALIDATION_PREFIX_MAX_BYTES = VALIDATION_PREFIX_LAST_BYTE + 1;
const SIGNED_READ_SECONDS = 10 * 60;
const GEMINI_OUTPUT_SIGNED_READ_SECONDS = 10 * 60;
const MAX_GEMINI_OUTPUT_BYTES = IMAGE_VALIDATION.MAX_SIZE_PAID;
const objectExtensionPattern = /\.(?:jpg|png|webp|heic)$/i;
const outputMimeToExtension = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
} as const;

async function readBoundedValidationPrefix(
  response: Response,
  maxBytes: number
): Promise<Uint8Array> {
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0 || contentLength > maxBytes) {
      throw new Error('Temporary image validation prefix is too large');
    }
  }

  if (!response.body) {
    const prefix = new Uint8Array(await response.arrayBuffer());
    if (prefix.byteLength === 0 || prefix.byteLength > maxBytes) {
      throw new Error('Temporary image validation prefix is invalid');
    }
    return prefix;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        throw new Error('Temporary image validation prefix is too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    throw new Error('Temporary image validation prefix is invalid');
  }

  const prefix = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    prefix.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return prefix;
}

interface IResolveUpscaleInputParams {
  userId: string;
  storagePath: string;
  claimedMimeType: string;
  isPaidUser: boolean;
}

function isCurrentInputObjectName(objectName: string): boolean {
  const extension = objectExtensionPattern.exec(objectName)?.[0];
  return extension !== undefined && isUuidV4(objectName.slice(0, -extension.length));
}

export interface IResolvedUpscaleInput {
  imageReference: string;
  validationImageData: string;
  sizeBytes: number;
  mimeType: (typeof IMAGE_VALIDATION.ALLOWED_TYPES)[number];
}

export async function resolveUpscaleInput({
  userId,
  storagePath,
  claimedMimeType,
  isPaidUser,
}: IResolveUpscaleInputParams): Promise<IResolvedUpscaleInput> {
  const segments = storagePath.split('/');
  if (segments.length !== 2 || segments[0] !== userId || !isCurrentInputObjectName(segments[1])) {
    throw new Error('Temporary image must be owned by the authenticated user');
  }

  const objectName = segments[1];
  const bucket = supabaseAdmin.storage.from(BUCKET_NAME);
  const { data: objects, error: listError } = await bucket.list(userId, {
    limit: 10,
    search: objectName,
  });
  if (listError) throw new Error(`Unable to inspect temporary image: ${listError.message}`);

  const object = objects?.find(candidate => candidate.name === objectName);
  const sizeBytes = Number(object?.metadata?.size);
  const storedMimeType = String(object?.metadata?.mimetype ?? '').toLowerCase();
  if (!object || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error('Temporary image was not found or has invalid metadata');
  }

  const maxBytes = isPaidUser ? IMAGE_VALIDATION.MAX_SIZE_PAID : IMAGE_VALIDATION.MAX_SIZE_FREE;
  if (sizeBytes > maxBytes) {
    throw new Error('Temporary image exceeds the upload limit for this account');
  }
  if (
    !(IMAGE_VALIDATION.ALLOWED_TYPES as readonly string[]).includes(storedMimeType) ||
    storedMimeType !== claimedMimeType.toLowerCase()
  ) {
    throw new Error('Temporary image MIME type does not match the upload request');
  }

  const { data: signed, error: signedError } = await bucket.createSignedUrl(
    storagePath,
    SIGNED_READ_SECONDS
  );
  if (signedError || !signed?.signedUrl) {
    throw new Error('Unable to create temporary image read URL');
  }

  const prefixResponse = await fetch(signed.signedUrl, {
    headers: { Range: `bytes=0-${VALIDATION_PREFIX_LAST_BYTE}` },
  });
  if (prefixResponse.status !== 206) {
    throw new Error('Temporary image storage did not honor the bounded validation request');
  }
  const prefix = await readBoundedValidationPrefix(prefixResponse, VALIDATION_PREFIX_MAX_BYTES);

  return {
    imageReference: signed.signedUrl,
    validationImageData: Buffer.from(prefix).toString('base64'),
    sizeBytes,
    mimeType: storedMimeType as IResolvedUpscaleInput['mimeType'],
  };
}

export async function removeUpscaleInput(storagePath: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(BUCKET_NAME).remove([storagePath]);
  if (error) throw new Error(`Unable to remove temporary image: ${error.message}`);
}

interface IStageGeminiOutputParams {
  userId: string;
  jobId: string;
  imageData: string;
}

export interface IStagedGeminiOutput {
  imageUrl: string;
  mimeType: keyof typeof outputMimeToExtension;
  expiresAt: number;
  storagePath: string;
}

function decodeStrictBase64(payload: string): Buffer {
  if (!payload) throw new Error('Gemini output image data is empty');
  if (payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) {
    throw new Error('Gemini output image data is not valid base64');
  }
  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length === 0) throw new Error('Gemini output image data is empty');
  if (buffer.toString('base64') !== payload) {
    throw new Error('Gemini output image data is not valid base64');
  }
  return buffer;
}

export async function stageGeminiOutput({
  userId,
  jobId,
  imageData,
}: IStageGeminiOutputParams): Promise<IStagedGeminiOutput> {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp|heic));base64,([A-Za-z0-9+/=]*)$/i.exec(
    imageData
  );
  if (!match) {
    throw new Error('Unsupported Gemini output image data URL');
  }

  const mimeType = match[1].toLowerCase() as keyof typeof outputMimeToExtension;
  const extension = outputMimeToExtension[mimeType];
  if (!extension) throw new Error('Unsupported Gemini output MIME type');

  const buffer = decodeStrictBase64(match[2]);
  if (buffer.length > MAX_GEMINI_OUTPUT_BYTES) {
    throw new Error('Gemini output image data is too large');
  }

  const storagePath = `${userId}/outputs/${jobId}.${extension}`;
  const bucket = supabaseAdmin.storage.from(BUCKET_NAME);
  const { error: uploadError } = await bucket.upload(storagePath, buffer, {
    contentType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
    upsert: true,
  });
  if (uploadError) throw new Error(`Unable to stage Gemini output: ${uploadError.message}`);

  const { data: signed, error: signedError } = await bucket.createSignedUrl(
    storagePath,
    GEMINI_OUTPUT_SIGNED_READ_SECONDS
  );
  if (signedError || !signed?.signedUrl) {
    throw new Error('Unable to create staged Gemini output read URL');
  }

  return {
    imageUrl: signed.signedUrl,
    mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
    expiresAt: Date.now() + GEMINI_OUTPUT_SIGNED_READ_SECONDS * 1000,
    storagePath,
  };
}
