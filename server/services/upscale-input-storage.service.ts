import { Buffer } from 'node:buffer';

import {
  buildInputKey,
  deleteObject,
  head,
  presignGet,
  R2_PRIVATE_BUCKET,
} from '@server/services/r2-storage.service';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';
import { isUuidV4 } from '@shared/validation/uuid';

const VALIDATION_PREFIX_LAST_BYTE = 64 * 1024 - 1;
const VALIDATION_PREFIX_MAX_BYTES = VALIDATION_PREFIX_LAST_BYTE + 1;
const SIGNED_READ_SECONDS = 10 * 60;
const objectExtensionPattern = /\.(?:jpg|png|webp|heic)$/i;

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

/**
 * Validate that a relative input path is `<userId>/<uuidv4>.<ext>` and, when a
 * userId is given, that the path belongs to that user.
 */
function parseInputStoragePath(storagePath: string, userId?: string): void {
  const segments = storagePath.split('/');
  if (segments.length !== 2 || !isCurrentInputObjectName(segments[1])) {
    throw new Error('Temporary image must be owned by the authenticated user');
  }
  if (userId !== undefined && segments[0] !== userId) {
    throw new Error('Temporary image must be owned by the authenticated user');
  }
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
  parseInputStoragePath(storagePath, userId);

  const r2Key = buildInputKey(storagePath);
  const metadata = await head(R2_PRIVATE_BUCKET, r2Key);
  if (metadata.status === 404) {
    throw new Error('Temporary image was not found or has invalid metadata');
  }
  if (!metadata.ok) {
    throw new Error('Unable to inspect temporary image');
  }

  // A stored `gzip` lets the provider decode more bytes than the HEAD size check
  // measured, so reject any content encoding other than none/identity before the
  // size and MIME checks and before the provider can read the object.
  const contentEncoding = String(metadata.headers.get('content-encoding') ?? '')
    .trim()
    .toLowerCase();
  if (contentEncoding !== '' && contentEncoding !== 'identity') {
    throw new Error('Temporary image must not be content-encoded');
  }

  const sizeBytes = Number(metadata.headers.get('content-length'));
  const storedMimeType = String(metadata.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
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

  const signedUrl = await presignGet(R2_PRIVATE_BUCKET, r2Key, SIGNED_READ_SECONDS);

  const prefixResponse = await fetch(signedUrl, {
    headers: { Range: `bytes=0-${VALIDATION_PREFIX_LAST_BYTE}` },
  });
  if (prefixResponse.status !== 206) {
    throw new Error('Temporary image storage did not honor the bounded validation request');
  }
  const prefix = await readBoundedValidationPrefix(prefixResponse, VALIDATION_PREFIX_MAX_BYTES);

  return {
    imageReference: signedUrl,
    validationImageData: Buffer.from(prefix).toString('base64'),
    sizeBytes,
    mimeType: storedMimeType as IResolvedUpscaleInput['mimeType'],
  };
}

export async function removeUpscaleInput(storagePath: string): Promise<void> {
  parseInputStoragePath(storagePath);
  await deleteObject(R2_PRIVATE_BUCKET, buildInputKey(storagePath));
}
