import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import imageLoader from '@client/utils/image-loader';

const ROOT = resolve(process.cwd());

// =============================================================================
// R2 blog storage mocks (must be hoisted before the service import)
// =============================================================================

const r2 = vi.hoisted(() => ({
  put: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock('@server/services/r2-storage.service', () => ({
  put: r2.put,
  deleteObject: r2.deleteObject,
  R2_PUBLIC_BUCKET: 'miu-public',
  R2_PUBLIC_BASE_URL: 'https://assets.myimageupscaler.com',
}));

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    metadata: vi.fn().mockResolvedValue({ width: 1024, height: 768 }),
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('compressed-image-data')),
  })),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import {
  deleteBlogImage,
  uploadBlogImage,
} from '@server/services/blogImageStorage.service';

const R2_PUBLIC_BUCKET = 'miu-public';
const R2_PUBLIC_BASE_URL = 'https://assets.myimageupscaler.com';

describe('blog images upload to R2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    r2.put.mockResolvedValue(undefined);
    r2.deleteObject.mockResolvedValue(undefined);
  });

  it('puts the compressed image in the public bucket under the relative storage path', async () => {
    const result = await uploadBlogImage(Buffer.from('original'), 'My Photo.PNG', 'image/png');

    expect(r2.put).toHaveBeenCalledTimes(1);
    const [bucket, key, body, contentType] = r2.put.mock.calls[0];
    expect(bucket).toBe(R2_PUBLIC_BUCKET);
    // The public bucket holds blog images only, so the key equals storage_path.
    expect(key).toBe(result.id);
    expect(body).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(body as Uint8Array).toString()).toBe('compressed-image-data');
    expect(contentType).toBe('image/webp');

    // The stored path stays relative so the phase-3 DB rewrite can be rolled back.
    expect(result.id).toMatch(/^\d{4}\/\d{2}\/\d+-my-photo\.webp$/);
    expect(result.width).toBe(1024);
    expect(result.height).toBe(768);
  });

  it('returns the public custom-domain URL with encoded path segments', async () => {
    const result = await uploadBlogImage(Buffer.from('original'), 'My Photo.PNG', 'image/png');

    expect(result.url).toBe(`${R2_PUBLIC_BASE_URL}/${result.id}`);
    expect(result.url.startsWith(`${R2_PUBLIC_BASE_URL}/`)).toBe(true);
    expect(result.url.endsWith('-my-photo.webp')).toBe(true);
  });

  it('deletes the same key it wrote', async () => {
    await deleteBlogImage('2026/01/1769000000000-example-inline.webp');

    expect(r2.deleteObject).toHaveBeenCalledWith(
      R2_PUBLIC_BUCKET,
      '2026/01/1769000000000-example-inline.webp'
    );
  });

  it('still rejects unsupported MIME types before touching R2', async () => {
    await expect(uploadBlogImage(Buffer.from('x'), 'x.svg', 'image/svg+xml')).rejects.toThrow(
      /Unsupported MIME type/
    );
    expect(r2.put).not.toHaveBeenCalled();
  });
});

describe('blog image storage no longer uses Supabase Storage', () => {
  it('does not reference storage.from or the Supabase storage client', () => {
    const source = readFileSync(resolve(ROOT, 'server/services/blogImageStorage.service.ts'), 'utf8');
    expect(source).not.toMatch(/storage\.from\(/);
    expect(source).not.toMatch(/supabaseAdmin\.storage/);
  });

  it('imports the shared R2 module', () => {
    const source = readFileSync(resolve(ROOT, 'server/services/blogImageStorage.service.ts'), 'utf8');
    expect(source).toContain('@server/services/r2-storage.service');
    expect(source).toContain('R2_PUBLIC_BUCKET');
    expect(source).toContain('R2_PUBLIC_BASE_URL');
  });
});

describe('image loader keeps the R2 public blog domain and legacy Supabase URLs working', () => {
  it('routes the R2 public custom domain through edge image transforms', () => {
    const result = imageLoader({
      src: 'https://assets.myimageupscaler.com/2026/01/1769000000000-example-inline.webp',
      width: 390,
      quality: 75,
    });

    expect(result).toBe(
      '/cdn-cgi/image/width=390,quality=75,format=auto/https://assets.myimageupscaler.com/2026/01/1769000000000-example-inline.webp'
    );
  });

  it('still rewrites legacy Supabase blog URLs through the Supabase render endpoint', () => {
    const result = imageLoader({
      src: 'https://xqysaylskffsfwunczbd.supabase.co/storage/v1/object/public/blog-images/2026/02/1770945723634-blog-inline-before-after.webp',
      width: 390,
    });
    const url = new URL(result);

    expect(url.hostname).toBe('xqysaylskffsfwunczbd.supabase.co');
    expect(url.pathname).toBe(
      '/storage/v1/render/image/public/blog-images/2026/02/1770945723634-blog-inline-before-after.webp'
    );
  });

  it('passes signed private R2 URLs through unchanged so the signature survives', () => {
    const signed =
      'https://c5dbf25d94692c78b79a8403959f8e54.r2.cloudflarestorage.com/miu-private/inputs/user-1/job-1.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef';

    const result = imageLoader({ src: signed, width: 390 });

    expect(result).toBe(signed);
    expect(result).not.toContain('assets.myimageupscaler.com');
  });

  it('does not leak private R2 URLs into the public assets domain', () => {
    const privateUrl =
      'https://c5dbf25d94692c78b79a8403959f8e54.r2.cloudflarestorage.com/miu-private/saved/user-1/image.webp';

    const result = imageLoader({ src: privateUrl, width: 390 });

    expect(result).not.toContain('assets.myimageupscaler.com');
    expect(result).toContain('miu-private');
  });
});

describe('R2 blog domain is wired into next/image and the layout', () => {
  it('allows the R2 public custom domain in next.config.js remotePatterns', () => {
    const config = readFileSync(resolve(ROOT, 'next.config.js'), 'utf8');
    expect(config).toContain("hostname: 'assets.myimageupscaler.com'");
    // Legacy Supabase host stays allow-listed until the phase-3 DB rewrite.
    expect(config).toContain("hostname: '*.supabase.co'");
  });

  it('preconnects to the R2 public domain while keeping the legacy Supabase preconnect', () => {
    const layout = readFileSync(resolve(ROOT, 'app/[locale]/layout.tsx'), 'utf8');
    expect(layout).toContain('<link rel="preconnect" href="https://assets.myimageupscaler.com"');
    expect(layout).toContain(
      '<link rel="preconnect" href="https://xqysaylskffsfwunczbd.supabase.co"'
    );
  });
});
