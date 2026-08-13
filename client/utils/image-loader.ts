/* eslint-disable import/no-default-export -- Next.js custom image loaders require a default export. */
import type { ImageLoaderProps } from 'next/image';

const SITE_ORIGIN = 'https://myimageupscaler.com';
const SITE_HOSTNAMES = new Set(['myimageupscaler.com', 'www.myimageupscaler.com']);
const SUPABASE_PUBLIC_OBJECT_PREFIX = '/storage/v1/object/public/';

function isUnsplashHost(hostname: string): boolean {
  return hostname === 'images.unsplash.com' || hostname.endsWith('.unsplash.com');
}

function isSupabasePublicObject(url: URL): boolean {
  return (
    url.hostname.endsWith('.supabase.co') && url.pathname.startsWith(SUPABASE_PUBLIC_OBJECT_PREFIX)
  );
}

/**
 * Keep image transformation at the CDN edge instead of spending Cloudflare Worker CPU.
 * Unsplash owns its own resizing API; same-origin assets use Cloudflare Image Resizing.
 */
export default function imageLoader({ src, width, quality }: ImageLoaderProps): string {
  let url: URL;
  try {
    url = new URL(src, SITE_ORIGIN);
  } catch {
    return src;
  }

  const requestedQuality = quality ?? 75;

  if (isUnsplashHost(url.hostname)) {
    url.searchParams.delete('w');
    url.searchParams.delete('h');
    url.searchParams.set('w', String(width));
    url.searchParams.set('q', String(requestedQuality));
    url.searchParams.set('fm', 'avif');
    return url.toString();
  }

  if (isSupabasePublicObject(url)) {
    url.pathname = url.pathname.replace(
      SUPABASE_PUBLIC_OBJECT_PREFIX,
      '/storage/v1/render/image/public/'
    );
    url.searchParams.delete('width');
    url.searchParams.delete('quality');
    url.searchParams.delete('format');
    url.searchParams.set('width', String(width));
    url.searchParams.set('quality', String(requestedQuality));
    url.searchParams.set('format', 'avif');
    return url.toString();
  }

  if (src.startsWith('/') || SITE_HOSTNAMES.has(url.hostname)) {
    return `/cdn-cgi/image/width=${width},quality=${requestedQuality},format=auto${url.pathname}${url.search}`;
  }

  return src;
}
