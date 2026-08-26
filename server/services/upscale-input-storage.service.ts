import { Buffer } from 'node:buffer';

import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';

const BUCKET_NAME = 'upscale-input';
const VALIDATION_PREFIX_LAST_BYTE = 65_535;
const SIGNED_READ_SECONDS = 10 * 60;
const objectNamePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp|heic)$/i;

interface IResolveUpscaleInputParams {
  userId: string;
  storagePath: string;
  claimedMimeType: string;
  isPaidUser: boolean;
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
  if (segments.length !== 2 || segments[0] !== userId || !objectNamePattern.test(segments[1])) {
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
  const prefix = new Uint8Array(await prefixResponse.arrayBuffer());
  if (prefix.byteLength === 0 || prefix.byteLength > VALIDATION_PREFIX_LAST_BYTE + 1) {
    throw new Error('Temporary image validation prefix is invalid');
  }

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
