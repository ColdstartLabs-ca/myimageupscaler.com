import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { buildSavedKey, presignGet, R2_PRIVATE_BUCKET } from '@server/services/r2-storage.service';
import { resolveGalleryObjectKeys } from '@server/services/gallery-expiry-read.service';
import { isUuidV4 } from '@shared/validation/uuid';

export const dynamic = 'force-dynamic';
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const LEGACY_GALLERY_BUCKET = 'saved-images';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const userId = request.headers.get('X-User-Id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: PRIVATE_HEADERS });
  const { id } = await params;
  if (!isUuidV4(id)) return NextResponse.json({ error: 'Invalid image ID' }, { status: 400, headers: PRIVATE_HEADERS });

  try {
    const { data: image, error } = await supabaseAdmin.from('saved_images')
      .select('id,user_id,storage_path,storage_backend').eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: 'Unable to load image' }, { status: 503, headers: PRIVATE_HEADERS });
    if (!image) return NextResponse.json({ error: 'Image not found' }, { status: 404, headers: PRIVATE_HEADERS });
    if (image.user_id !== userId) return NextResponse.json({ error: 'Image access denied' }, { status: 403, headers: PRIVATE_HEADERS });

    // Resolve the owned row's backend before any signing. R2 rows use the expiry
    // registry archive map; legacy Supabase rows sign their original object. An
    // absent or unknown backend fails closed.
    let url: string;
    if (image.storage_backend === 'r2') {
      const objectKeys = await resolveGalleryObjectKeys(userId, [
        { id: image.id, storage_path: image.storage_path },
      ]);
      const objectKey = objectKeys.get(image.id) ?? buildSavedKey(image.storage_path);
      url = await presignGet(R2_PRIVATE_BUCKET, objectKey, 3600);
    } else if (image.storage_backend === 'supabase') {
      const { data: signed, error: signError } = await supabaseAdmin.storage
        .from(LEGACY_GALLERY_BUCKET)
        .createSignedUrl(image.storage_path, 3600);
      if (signError || !signed?.signedUrl) {
        return NextResponse.json({ error: 'Unable to load thumbnail' }, { status: 502, headers: PRIVATE_HEADERS });
      }
      url = signed.signedUrl;
    } else {
      return NextResponse.json({ error: 'Unable to load thumbnail' }, { status: 502, headers: PRIVATE_HEADERS });
    }
    const options = {
      cache: 'no-store' as const, redirect: 'manual' as const, signal: AbortSignal.timeout(30_000),
      cf: { image: { width: 400, format: 'auto' as const } },
    };
    let upstream: Response | undefined;
    try { upstream = await fetch(url, options); } catch { /* The full image remains a safe fallback. */ }
    if (!upstream?.ok) {
      await upstream?.body?.cancel();
      upstream = await fetch(url, {
        cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(30_000),
      });
    }
    const contentType = upstream.headers.get('content-type') ?? '';
    if (!upstream.ok || !upstream.body || !/^image\/(?:png|jpeg|webp|avif|gif|heic|heif)(?:;|$)/i.test(contentType)) {
      await upstream.body?.cancel();
      return NextResponse.json({ error: 'Unable to load thumbnail' }, { status: 502, headers: PRIVATE_HEADERS });
    }
    const headers = new Headers({
      ...PRIVATE_HEADERS, 'Content-Type': contentType,
    });
    const length = upstream.headers.get('content-length');
    if (length) headers.set('Content-Length', length);
    return new Response(upstream.body, { headers });
  } catch {
    return NextResponse.json({ error: 'Unable to load thumbnail' }, { status: 502, headers: PRIVATE_HEADERS });
  }
}
