import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const BUCKET_NAME = 'upscale-input';
const uploadRequestSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.enum(IMAGE_VALIDATION.ALLOWED_TYPES),
  sizeBytes: z.number().int().positive(),
  jobId: z.string().uuid(),
});

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = request.headers.get('X-User-Id');
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const parsed = uploadRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('subscription_status, subscription_tier, purchased_credits_balance')
    .eq('id', userId)
    .single();
  if (profileError || !profile) {
    return NextResponse.json({ error: 'Unable to verify account' }, { status: 503 });
  }

  const maxBytes = isPaidProfile(profile)
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
    .createSignedUploadUrl(storagePath, { upsert: false });
  if (error || !data?.token) {
    return NextResponse.json({ error: 'Unable to prepare image upload' }, { status: 503 });
  }

  return NextResponse.json({ storagePath, uploadToken: data.token });
}
