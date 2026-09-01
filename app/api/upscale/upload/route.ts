import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import {
  BoundedJsonBodyTooLargeError,
  readBoundedJsonBody,
} from '@server/http/read-bounded-json-body';
import { serverEnv } from '@shared/config/env';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';
import { UUID_V4_PATTERN } from '@shared/validation/uuid';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const BUCKET_NAME = 'upscale-inputs';
const UPLOAD_REQUEST_MAX_BYTES = 8 * 1024;
const uploadRequestSchema = z
  .object({
    filename: z.string().trim().min(1).max(255),
    mimeType: z.enum(IMAGE_VALIDATION.ALLOWED_TYPES),
    sizeBytes: z.number().int().positive(),
    jobId: z.string().regex(UUID_V4_PATTERN, 'Job ID must be a UUIDv4'),
  })
  .strict();

const extensionByMime: Record<(typeof IMAGE_VALIDATION.ALLOWED_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

function isPaidProfile(profile: {
  subscription_status: string | null;
  subscription_tier: string | null;
  purchased_credits_balance: number | null;
}): boolean {
  return (
    profile.subscription_status === 'active' ||
    profile.subscription_status === 'trialing' ||
    (profile.purchased_credits_balance ?? 0) > 0 ||
    (profile.subscription_tier !== null && profile.subscription_tier !== 'free')
  );
}

/**
 * Test-environment mock users have no database profile. Derive their tier from
 * the token-encoded subscription the same way /api/upscale does
 * (mock_user_{uuid}_sub_{status}_{tier}), so API tests can exercise the
 * direct-upload flow.
 */
function resolveTestMockProfile(userId: string): {
  subscription_status: string | null;
  subscription_tier: string | null;
  purchased_credits_balance: number;
} {
  const subMatch = userId.match(/_sub_([^_]+)_([^_]+)$/);
  const subscriptionStatus = subMatch?.[1] ?? null;
  const subscriptionTier = subMatch?.[2] ?? null;
  const isActiveSub = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';

  return {
    subscription_status: subscriptionStatus,
    subscription_tier: subscriptionTier,
    purchased_credits_balance: isActiveSub ? 0 : 1000,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = request.headers.get('X-User-Id');
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let requestBody: unknown;
  try {
    requestBody = await readBoundedJsonBody(request, UPLOAD_REQUEST_MAX_BYTES);
  } catch (error) {
    if (error instanceof BoundedJsonBodyTooLargeError) {
      return NextResponse.json({ error: 'Upload request is too large' }, { status: 413 });
    }

    return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 });
  }

  const parsed = uploadRequestSchema.safeParse(requestBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('subscription_status, subscription_tier, purchased_credits_balance')
    .eq('id', userId)
    .single();
  const isTestMockUser = serverEnv.ENV === 'test' && userId.startsWith('mock_user_');
  if ((profileError || !profile) && !isTestMockUser) {
    return NextResponse.json({ error: 'Unable to verify account' }, { status: 503 });
  }
  const effectiveProfile = profile ?? (isTestMockUser ? resolveTestMockProfile(userId) : null);
  if (!effectiveProfile) {
    return NextResponse.json({ error: 'Unable to verify account' }, { status: 503 });
  }

  const maxBytes = isPaidProfile(effectiveProfile)
    ? IMAGE_VALIDATION.MAX_SIZE_PAID
    : IMAGE_VALIDATION.MAX_SIZE_FREE;
  if (parsed.data.sizeBytes > maxBytes) {
    return NextResponse.json(
      { error: 'Image exceeds the upload limit for this account' },
      { status: 413 }
    );
  }

  const extension = extensionByMime[parsed.data.mimeType];
  const storagePath = `${userId}/${parsed.data.jobId}.${extension}`;
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    // Keep the validated input immutable while its signed read URL is in use.
    .createSignedUploadUrl(storagePath, { upsert: false });
  if (error || !data?.token) {
    return NextResponse.json({ error: 'Unable to prepare image upload' }, { status: 503 });
  }

  return NextResponse.json({ storagePath, uploadToken: data.token });
}
