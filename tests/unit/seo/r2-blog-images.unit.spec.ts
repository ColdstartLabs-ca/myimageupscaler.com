import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

import imageLoader from '@client/utils/image-loader';

const ROOT = resolve(process.cwd());

// =============================================================================
// Transport mocks (hoisted before the service import). Only the R2 transport
// boundary and the global fetch are replaced; the service itself is real.
// =============================================================================

const r2 = vi.hoisted(() => ({
  put: vi.fn(),
  deleteObject: vi.fn(),
  presignGet: vi.fn(),
}));

vi.mock('@server/services/r2-storage.service', () => ({
  put: r2.put,
  deleteObject: r2.deleteObject,
  presignGet: r2.presignGet,
  buildDevKey: (...segments: string[]) => `dev/${segments.join('/')}`,
  R2_PRIVATE_BUCKET: 'miu-private',
  R2_PUBLIC_BUCKET: 'miu-public',
  R2_PUBLIC_BASE_URL: 'https://assets.myimageupscaler.com',
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import {
  deleteBlogImage,
  getImageDimensions,
  uploadBlogImage,
} from '@server/services/blogImageStorage.service';
import { decodeImageDimensions } from '@shared/validation/upscale.schema';

const R2_PRIVATE_BUCKET = 'miu-private';
const R2_PUBLIC_BUCKET = 'miu-public';
const R2_PUBLIC_BASE_URL = 'https://assets.myimageupscaler.com';
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024;

const fetchMock = vi.fn();

// =============================================================================
// Real byte fixtures. Sharp (test-only) generates genuinely valid encoded
// images, so a success test cannot pass with a made-up header that the strict
// WebP framing check should reject. The application service never imports it.
// =============================================================================

const f: Record<string, Buffer> = {
  vp8_1024x768: Buffer.alloc(0),
  vp8_100x50: Buffer.alloc(0),
  vp8_10x10: Buffer.alloc(0),
  vp8l_96x48: Buffer.alloc(0),
  vp8x_800x600: Buffer.alloc(0),
  vp8x_1921x1080: Buffer.alloc(0),
  vp8x_1920x1081: Buffer.alloc(0),
  gif_320x240: Buffer.alloc(0),
  gif_64x64: Buffer.alloc(0),
  jpeg_640x480: Buffer.alloc(0),
  png_64x64: Buffer.alloc(0),
};

beforeAll(async () => {
  const create = (width: number, height: number, channels: 3 | 4) =>
    sharp({
      create: {
        width,
        height,
        channels,
        background: { r: 20, g: 40, b: 60, alpha: channels === 4 ? 0.5 : 1 },
      },
    });
  const opaque = (width: number, height: number) =>
    create(width, height, 3).webp({ quality: 80 }).toBuffer();
  const alpha = (width: number, height: number) =>
    create(width, height, 4).webp({ quality: 80 }).toBuffer();

  f.vp8_1024x768 = await opaque(1024, 768);
  f.vp8_100x50 = await opaque(100, 50);
  f.vp8_10x10 = await opaque(10, 10);
  f.vp8l_96x48 = await create(96, 48, 3).webp({ lossless: true }).toBuffer();
  f.vp8x_800x600 = await alpha(800, 600);
  f.vp8x_1921x1080 = await alpha(1921, 1080);
  f.vp8x_1920x1081 = await alpha(1920, 1081);
  expect(f.vp8x_800x600.toString('ascii', 12, 16)).toBe('VP8X');
  f.gif_320x240 = await create(320, 240, 3).gif().toBuffer();
  f.gif_64x64 = await create(64, 64, 3).gif().toBuffer();
  f.jpeg_640x480 = await create(640, 480, 3).jpeg().toBuffer();
  f.png_64x64 = await create(64, 64, 3).png().toBuffer();
});

/** Copy a real buffer into an ArrayBuffer-backed Uint8Array for Response. */
function bytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(buffer);
}

/** Copy a real WebP fixture and corrupt selected bytes. */
function corrupted(source: Buffer, mutate: (b: Uint8Array) => void): Uint8Array<ArrayBuffer> {
  const copy = bytes(source);
  mutate(copy);
  return copy;
}

function webpResponse(
  body: Uint8Array<ArrayBuffer> | string,
  contentType = 'image/webp'
): Response {
  return new Response(body, { status: 200, headers: { 'content-type': contentType } });
}

it('rejects truncated VP8X headers in the shared dimension reader', () => {
  expect(decodeImageDimensions(f.vp8x_800x600.subarray(0, 24).toString('base64'))).toBeNull();
});

describe('blog images upload to R2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    r2.put.mockResolvedValue(undefined);
    r2.deleteObject.mockResolvedValue(undefined);
    r2.presignGet.mockResolvedValue('https://signed.example/staged');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stages the original, transforms it, and writes the public image', async () => {
    const output = bytes(f.vp8_1024x768);
    fetchMock.mockResolvedValue(webpResponse(output));

    const result = await uploadBlogImage(Buffer.from('original'), 'My Photo.PNG', 'image/png');

    // 1. Immutable staging of the original under a unique private dev key.
    expect(r2.put).toHaveBeenCalledTimes(2);
    const [stageBucket, stageKey, stageBody, stageType] = r2.put.mock.calls[0];
    expect(stageBucket).toBe(R2_PRIVATE_BUCKET);
    expect(stageKey).toMatch(
      /^dev\/blog-transform\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(Buffer.from(stageBody as Uint8Array).toString()).toBe('original');
    expect(stageType).toBe('image/png');

    // 2. Presigned GET drives the edge transform with the exact options.
    expect(r2.presignGet).toHaveBeenCalledWith(R2_PRIVATE_BUCKET, stageKey);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [fetchUrl, fetchOptions] = fetchMock.mock.calls[0];
    expect(fetchUrl).toBe('https://signed.example/staged');
    expect(fetchOptions.redirect).toBe('manual');
    expect(fetchOptions.cf.image).toEqual({
      width: 1920,
      height: 1080,
      fit: 'scale-down',
      format: 'webp',
      quality: 80,
      metadata: 'none',
      anim: false,
    });
    // No API/auth headers are forwarded to the transform fetch.
    expect(fetchOptions.headers).toBeUndefined();

    // 3. The staged copy is deleted before the public write.
    expect(r2.deleteObject).toHaveBeenCalledWith(R2_PRIVATE_BUCKET, stageKey);
    expect(r2.deleteObject.mock.invocationCallOrder[0]).toBeLessThan(
      r2.put.mock.invocationCallOrder[1]
    );

    // 4. The transformed bytes go to the immutable public key.
    const [publicBucket, publicKey, publicBody, publicType] = r2.put.mock.calls[1];
    expect(publicBucket).toBe(R2_PUBLIC_BUCKET);
    expect(publicKey).toMatch(/^\d{4}\/\d{2}\/\d+-my-photo\.webp$/);
    expect(publicType).toBe('image/webp');
    expect(Buffer.from(publicBody as Uint8Array)).toEqual(Buffer.from(output));

    // 5. The returned dimensions are the actual transformed output dimensions.
    expect(result.width).toBe(1024);
    expect(result.height).toBe(768);
    expect(result.id).toBe(publicKey);
    expect(result.url).toBe(`${R2_PUBLIC_BASE_URL}/${publicKey}`);
  });

  it('returns the public custom-domain URL with encoded path segments', async () => {
    fetchMock.mockResolvedValue(webpResponse(bytes(f.vp8_100x50)));

    const result = await uploadBlogImage(Buffer.from('original'), 'My Photo.PNG', 'image/png');

    expect(result.url).toBe(`${R2_PUBLIC_BASE_URL}/${result.id}`);
    expect(result.url.endsWith('-my-photo.webp')).toBe(true);
  });

  it('accepts JPEG and GIF originals', async () => {
    fetchMock.mockImplementation(async () => webpResponse(bytes(f.vp8_10x10)));
    await expect(
      uploadBlogImage(Buffer.from('jpeg'), 'a.jpg', 'image/jpeg')
    ).resolves.toMatchObject({ width: 10, height: 10 });
    await expect(uploadBlogImage(Buffer.from('gif'), 'a.gif', 'image/gif')).resolves.toMatchObject({
      width: 10,
      height: 10,
    });
  });

  it('rejects oversized input before touching R2', async () => {
    const tooBig = Buffer.alloc(MAX_OUTPUT_SIZE + 1);
    await expect(uploadBlogImage(tooBig, 'big.png', 'image/png')).rejects.toThrow(/exceeds/);
    expect(r2.put).not.toHaveBeenCalled();
  });

  it('still rejects unsupported MIME types before touching R2', async () => {
    await expect(uploadBlogImage(Buffer.from('x'), 'x.svg', 'image/svg+xml')).rejects.toThrow(
      /Unsupported MIME type/
    );
    expect(r2.put).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never deletes the staged key on an ambiguous or colliding PUT failure', async () => {
    r2.put.mockRejectedValueOnce(new Error('R2 PUT failed for dev/x: 412'));

    await expect(uploadBlogImage(Buffer.from('x'), 'a.png', 'image/png')).rejects.toThrow(/412/);

    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(r2.deleteObject).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('blog image transform failure handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    r2.put.mockResolvedValue(undefined);
    r2.deleteObject.mockResolvedValue(undefined);
    r2.presignGet.mockResolvedValue('https://signed.example/staged');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [
      'non-2xx status',
      new Response('nope', { status: 500, headers: { 'content-type': 'text/plain' } }),
    ],
    [
      'redirect',
      new Response(null, { status: 302, headers: { location: 'https://evil.example' } }),
    ],
    ['wrong content type', webpResponse('bytes', 'image/png')],
    ['malformed output', webpResponse('not-an-image')],
    ['empty output', webpResponse(new Uint8Array(0))],
  ])(
    'rejects %s, cleans up the staged copy, and never writes the public object',
    async (_label, response) => {
      fetchMock.mockResolvedValue(response);

      await expect(
        uploadBlogImage(Buffer.from('original'), 'a.png', 'image/png')
      ).rejects.toThrow();

      expect(r2.put).toHaveBeenCalledTimes(1);
      expect(r2.put.mock.calls[0][0]).toBe(R2_PRIVATE_BUCKET);
      expect(r2.deleteObject).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['incorrect RIFF length', 'VP8X header without image data'])(
    'rejects %s before the public write',
    async kind => {
      const output = kind === 'incorrect RIFF length' ? bytes(f.vp8_10x10) : new Uint8Array(30);
      const view = new DataView(output.buffer);
      if (kind === 'incorrect RIFF length') {
        view.setUint32(4, output.length, true);
      } else {
        output.set(Buffer.from('RIFF'), 0);
        view.setUint32(4, output.length - 8, true);
        output.set(Buffer.from('WEBPVP8X'), 8);
        view.setUint32(16, 10, true);
      }
      fetchMock.mockResolvedValue(webpResponse(output));

      await expect(
        uploadBlogImage(Buffer.from('original'), 'a.png', 'image/png')
      ).rejects.toThrow();
      expect(r2.put).toHaveBeenCalledTimes(1);
      expect(r2.deleteObject).toHaveBeenCalledTimes(1);
    }
  );

  it('stops reading and rejects output over the size limit without a public write', async () => {
    const oversize = new Uint8Array(MAX_OUTPUT_SIZE + 1);
    fetchMock.mockResolvedValue(webpResponse(oversize));

    await expect(uploadBlogImage(Buffer.from('original'), 'a.png', 'image/png')).rejects.toThrow(
      /size limit/
    );

    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(r2.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('does not write the public object when staged cleanup fails', async () => {
    fetchMock.mockResolvedValue(webpResponse(bytes(f.vp8_10x10)));
    r2.deleteObject.mockRejectedValue(new Error('R2 DELETE failed for dev/x: 500'));

    await expect(uploadBlogImage(Buffer.from('original'), 'a.png', 'image/png')).rejects.toThrow(
      /DELETE failed/
    );

    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(r2.put.mock.calls[0][0]).toBe(R2_PRIVATE_BUCKET);
  });

  it('reports a final public PUT failure after the staged copy is removed', async () => {
    fetchMock.mockResolvedValue(webpResponse(bytes(f.vp8_10x10)));
    r2.put.mockResolvedValueOnce(undefined);
    r2.put.mockRejectedValueOnce(new Error('R2 PUT failed for 2026/01/x.webp: 412'));

    await expect(uploadBlogImage(Buffer.from('original'), 'a.png', 'image/png')).rejects.toThrow(
      /412/
    );

    expect(r2.deleteObject).toHaveBeenCalledTimes(1);
    expect(r2.deleteObject.mock.invocationCallOrder[0]).toBeLessThan(
      r2.put.mock.invocationCallOrder[1]
    );
  });

  it('cleans up the staged copy when the presigned URL cannot be created', async () => {
    r2.presignGet.mockRejectedValue(new Error('presign failed'));

    await expect(uploadBlogImage(Buffer.from('original'), 'a.png', 'image/png')).rejects.toThrow(
      /presign failed/
    );

    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(r2.deleteObject).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a network failure', new Error('network down')],
    ['a timeout', new DOMException('transform timed out', 'TimeoutError')],
  ])('cleans up the staged copy when the transform fetch fails with %s', async (_label, error) => {
    fetchMock.mockRejectedValue(error);

    await expect(uploadBlogImage(Buffer.from('original'), 'a.png', 'image/png')).rejects.toThrow();

    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(r2.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('cleans up the staged copy when the output stream errors mid-read', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.error(new Error('stream broke'));
      },
    });
    fetchMock.mockResolvedValue(
      new Response(body, { status: 200, headers: { 'content-type': 'image/webp' } })
    );

    await expect(uploadBlogImage(Buffer.from('original'), 'a.png', 'image/png')).rejects.toThrow(
      /stream broke/
    );

    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(r2.deleteObject).toHaveBeenCalledTimes(1);
  });
});

describe('blog image output dimension validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    r2.put.mockResolvedValue(undefined);
    r2.deleteObject.mockResolvedValue(undefined);
    r2.presignGet.mockResolvedValue('https://signed.example/staged');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads dimensions from a transparent (VP8X) WebP output', async () => {
    fetchMock.mockResolvedValue(webpResponse(bytes(f.vp8x_800x600)));

    const result = await uploadBlogImage(Buffer.from('original'), 'a.png', 'image/png');

    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it('rejects output over the width cap and cleans up', async () => {
    fetchMock.mockResolvedValue(webpResponse(bytes(f.vp8x_1921x1080)));

    await expect(uploadBlogImage(Buffer.from('original'), 'a.png', 'image/png')).rejects.toThrow(
      /exceeds maximum dimensions/
    );
    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(r2.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('rejects output over the height cap and cleans up', async () => {
    fetchMock.mockResolvedValue(webpResponse(bytes(f.vp8x_1920x1081)));

    await expect(uploadBlogImage(Buffer.from('original'), 'a.png', 'image/png')).rejects.toThrow(
      /exceeds maximum dimensions/
    );
    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(r2.deleteObject).toHaveBeenCalledTimes(1);
  });
});

describe('blog image output must be a real, well-framed WebP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    r2.put.mockResolvedValue(undefined);
    r2.deleteObject.mockResolvedValue(undefined);
    r2.presignGet.mockResolvedValue('https://signed.example/staged');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each<[string, () => Uint8Array<ArrayBuffer>]>([
    ['a JPEG body', () => bytes(f.jpeg_640x480)],
    ['a PNG body', () => bytes(f.png_64x64)],
    ['a GIF body', () => bytes(f.gif_64x64)],
  ])('rejects %s labelled image/webp and never writes the public object', async (_label, make) => {
    fetchMock.mockResolvedValue(webpResponse(make()));

    await expect(uploadBlogImage(Buffer.from('original'), 'a.png', 'image/png')).rejects.toThrow(
      /Unable to decode transformed image dimensions/
    );

    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(r2.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('rejects bytes with the wrong RIFF magic and cleans up', async () => {
    const body = corrupted(f.vp8x_800x600, b => {
      b[0] = 0;
      b[1] = 0;
      b[2] = 0;
      b[3] = 0;
    });
    fetchMock.mockResolvedValue(webpResponse(body));

    await expect(uploadBlogImage(Buffer.from('original'), 'a.png', 'image/png')).rejects.toThrow(
      /Unable to decode transformed image dimensions/
    );
    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(r2.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('rejects a RIFF container without the WEBP magic and cleans up', async () => {
    const body = corrupted(f.vp8x_800x600, b => {
      b[8] = 0;
      b[9] = 0;
      b[10] = 0;
      b[11] = 0;
    });
    fetchMock.mockResolvedValue(webpResponse(body));

    await expect(uploadBlogImage(Buffer.from('original'), 'a.png', 'image/png')).rejects.toThrow(
      /Unable to decode transformed image dimensions/
    );
    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(r2.deleteObject).toHaveBeenCalledTimes(1);
  });

  it.each<[string, () => Uint8Array<ArrayBuffer>]>([
    ['a truncated VP8X chunk', () => bytes(f.vp8x_800x600).slice(0, 24)],
    ['a WebP shorter than the container header', () => bytes(f.vp8x_800x600).slice(0, 12)],
  ])('rejects %s and cleans up', async (_label, make) => {
    fetchMock.mockResolvedValue(webpResponse(make()));

    await expect(uploadBlogImage(Buffer.from('original'), 'a.png', 'image/png')).rejects.toThrow(
      /Unable to decode transformed image dimensions/
    );
    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(r2.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('rejects an incomplete chunk whose declared size exceeds the bytes received', async () => {
    const body = corrupted(f.vp8x_800x600, b => {
      b[16] = 0xff;
      b[17] = 0xff;
      b[18] = 0xff;
      b[19] = 0x7f;
    });
    fetchMock.mockResolvedValue(webpResponse(body));

    await expect(uploadBlogImage(Buffer.from('original'), 'a.png', 'image/png')).rejects.toThrow(
      /Unable to decode transformed image dimensions/
    );
    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(r2.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('rejects a well-framed WebP whose canvas is zero and cleans up', async () => {
    const body = corrupted(f.vp8_10x10, b => {
      b[26] = 0;
      b[27] = 0;
      b[28] = 0;
      b[29] = 0;
    });
    fetchMock.mockResolvedValue(webpResponse(body));

    await expect(uploadBlogImage(Buffer.from('original'), 'a.png', 'image/png')).rejects.toThrow(
      /Unable to decode transformed image dimensions/
    );
    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(r2.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('accepts a real lossless (VP8L) WebP output', async () => {
    fetchMock.mockResolvedValue(webpResponse(bytes(f.vp8l_96x48)));

    const result = await uploadBlogImage(Buffer.from('original'), 'a.png', 'image/png');

    expect(result.width).toBe(96);
    expect(result.height).toBe(48);
  });
});

describe('getImageDimensions uses the bounded decoder', () => {
  it('reads GIF, JPEG and WebP headers without a native image library', async () => {
    await expect(getImageDimensions(f.gif_320x240)).resolves.toEqual({ width: 320, height: 240 });
    await expect(getImageDimensions(f.jpeg_640x480)).resolves.toEqual({ width: 640, height: 480 });
    await expect(getImageDimensions(f.vp8x_800x600)).resolves.toEqual({ width: 800, height: 600 });
  });

  it('throws for undecodable data', async () => {
    await expect(getImageDimensions(Buffer.from('not-an-image'))).rejects.toThrow(
      /Unable to extract image dimensions/
    );
  });

  it('keeps GIF out of the shared upscale decoder boundary', () => {
    expect(decodeImageDimensions(f.gif_64x64.toString('base64'))).toBeNull();
  });
});

describe('blog image storage no longer uses native Sharp or Supabase Storage', () => {
  it('imports no native Sharp module', () => {
    const source = readFileSync(
      resolve(ROOT, 'server/services/blogImageStorage.service.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/from ['"]sharp['"]/);
    expect(source).not.toMatch(/require\(['"]sharp['"]\)/);
  });

  it('does not reference storage.from or the Supabase storage client', () => {
    const source = readFileSync(
      resolve(ROOT, 'server/services/blogImageStorage.service.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/storage\.from\(/);
    expect(source).not.toMatch(/supabaseAdmin\.storage/);
  });

  it('imports the shared R2 module', () => {
    const source = readFileSync(
      resolve(ROOT, 'server/services/blogImageStorage.service.ts'),
      'utf8'
    );
    expect(source).toContain('@server/services/r2-storage.service');
    expect(source).toContain('R2_PUBLIC_BUCKET');
    expect(source).toContain('R2_PUBLIC_BASE_URL');
  });

  it('deletes the same key it wrote', async () => {
    await deleteBlogImage('2026/01/1769000000000-example-inline.webp');

    expect(r2.deleteObject).toHaveBeenCalledWith(
      R2_PUBLIC_BUCKET,
      '2026/01/1769000000000-example-inline.webp'
    );
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
