import { AwsV4Signer } from 'aws4fetch';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import corsPolicy from '../../../../scripts/storage/r2-cors.json';

const mocks = vi.hoisted(() => ({
  serverEnv: {
    CLOUDFLARE_ACCOUNT_ID: 'acct-123',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
  },
}));

vi.mock('@shared/config/env', () => ({ serverEnv: mocks.serverEnv }));

import {
  buildInputKey,
  deleteObject,
  get,
  head,
  objectUrl,
  presignGet,
  presignPut,
  put,
  R2_PRIVATE_BUCKET,
  R2_PUBLIC_BUCKET,
} from '@server/services/r2-storage.service';
import { presignGetUrl, presignHeadUrl, presignPutUrl } from '@server/services/r2-presign.mjs';

const ENDPOINT = 'https://acct-123.r2.cloudflarestorage.com';

/** Re-sign the URL with the given method and compare the signature. */
async function signatureFor(
  signedUrl: string,
  method: string,
  options: Record<string, unknown> = {}
) {
  const url = new URL(signedUrl);
  const datetime = url.searchParams.get('X-Amz-Date');
  const original = url.searchParams.get('X-Amz-Signature');
  url.searchParams.delete('X-Amz-Signature');

  const signer = new AwsV4Signer({
    accessKeyId: mocks.serverEnv.R2_ACCESS_KEY_ID,
    secretAccessKey: mocks.serverEnv.R2_SECRET_ACCESS_KEY,
    method,
    url: url.toString(),
    signQuery: true,
    service: 's3',
    region: 'auto',
    datetime: datetime ?? undefined,
    ...options,
  });

  const recomputed = (await signer.sign()).url.searchParams.get('X-Amz-Signature');
  return { original, recomputed };
}

describe('r2-storage.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serverEnv.CLOUDFLARE_ACCOUNT_ID = 'acct-123';
    mocks.serverEnv.R2_ACCESS_KEY_ID = 'test-access-key';
    mocks.serverEnv.R2_SECRET_ACCESS_KEY = 'test-secret-key';
  });

  it('presigns a PUT bound to the PUT method, content type, size and expiry', async () => {
    const url = await presignPut({
      bucket: R2_PRIVATE_BUCKET,
      key: buildInputKey('user-1/11111111-1111-4111-8111-111111111111.png'),
      sizeBytes: 1024,
      contentType: 'image/png',
    });

    const parsed = new URL(url);
    expect(parsed.origin).toBe(ENDPOINT);
    expect(parsed.pathname).toBe(
      '/miu-private/inputs/user-1/11111111-1111-4111-8111-111111111111.png'
    );
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-length;content-type;host;if-none-match'
    );
    expect(parsed.searchParams.get('X-Amz-Signature')).toBeTruthy();

    const { original, recomputed } = await signatureFor(url, 'PUT', {
      headers: { 'content-length': '1024', 'content-type': 'image/png', 'if-none-match': '*' },
      allHeaders: true,
    });
    expect(recomputed).toBe(original);
  });

  it('binds the immutable-write precondition so omitting or changing it breaks the signature', async () => {
    const url = await presignPut({
      bucket: R2_PRIVATE_BUCKET,
      key: buildInputKey('user-1/job.png'),
      sizeBytes: 1024,
      contentType: 'image/png',
    });

    const intact = await signatureFor(url, 'PUT', {
      headers: { 'content-length': '1024', 'content-type': 'image/png', 'if-none-match': '*' },
      allHeaders: true,
    });
    const omitted = await signatureFor(url, 'PUT', {
      headers: { 'content-length': '1024', 'content-type': 'image/png' },
      allHeaders: true,
    });
    const changed = await signatureFor(url, 'PUT', {
      headers: {
        'content-length': '1024',
        'content-type': 'image/png',
        'if-none-match': '"etag"',
      },
      allHeaders: true,
    });

    expect(intact.recomputed).toBe(intact.original);
    expect(omitted.recomputed).not.toBe(omitted.original);
    expect(changed.recomputed).not.toBe(changed.original);
  });

  it('binds the declared content-length so omitting or changing it breaks the signature', async () => {
    const url = await presignPut({
      bucket: R2_PRIVATE_BUCKET,
      key: buildInputKey('user-1/job.png'),
      sizeBytes: 1024,
      contentType: 'image/png',
    });

    const intact = await signatureFor(url, 'PUT', {
      headers: { 'content-length': '1024', 'content-type': 'image/png', 'if-none-match': '*' },
      allHeaders: true,
    });
    const omitted = await signatureFor(url, 'PUT', {
      headers: { 'content-type': 'image/png', 'if-none-match': '*' },
      allHeaders: true,
    });
    const changed = await signatureFor(url, 'PUT', {
      headers: { 'content-length': '2048', 'content-type': 'image/png', 'if-none-match': '*' },
      allHeaders: true,
    });

    expect(intact.recomputed).toBe(intact.original);
    expect(omitted.recomputed).not.toBe(omitted.original);
    expect(changed.recomputed).not.toBe(changed.original);
  });

  it('rejects a PUT without a positive integer sizeBytes', async () => {
    await expect(
      presignPut({ bucket: R2_PRIVATE_BUCKET, key: 'inputs/user-1/job.png' } as never)
    ).rejects.toThrow(/positive integer sizeBytes/);
    await expect(
      presignPut({
        bucket: R2_PRIVATE_BUCKET,
        key: 'inputs/user-1/job.png',
        sizeBytes: 0,
      })
    ).rejects.toThrow(/positive integer sizeBytes/);
    await expect(
      presignPut({
        bucket: R2_PRIVATE_BUCKET,
        key: 'inputs/user-1/job.png',
        sizeBytes: 1.5,
      })
    ).rejects.toThrow(/positive integer sizeBytes/);
  });

  it('presigns a GET with the ten minute expiry and no content type signed', async () => {
    const url = await presignGet(R2_PRIVATE_BUCKET, buildInputKey('user-1/job.png'));

    const parsed = new URL(url);
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toBe('host');

    const { original, recomputed } = await signatureFor(url, 'GET');
    expect(recomputed).toBe(original);
  });

  it('does not accept a POST signature for a presigned PUT URL', async () => {
    const url = await presignPut({
      bucket: R2_PRIVATE_BUCKET,
      key: buildInputKey('user-1/job.png'),
      sizeBytes: 1024,
      contentType: 'image/png',
    });
    const { original, recomputed } = await signatureFor(url, 'GET');
    expect(recomputed).not.toBe(original);
  });

  it('rejects unknown buckets and unsafe keys', async () => {
    expect(() => objectUrl('not-a-bucket', 'inputs/x/y.png')).toThrow(/Unknown R2 bucket/);
    expect(() => objectUrl(R2_PRIVATE_BUCKET, '/inputs/x/y.png')).toThrow(/Invalid R2 object key/);
    expect(() => objectUrl(R2_PRIVATE_BUCKET, 'inputs/../secret.png')).toThrow(
      /Invalid R2 object key/
    );
    await expect(presignGet('not-a-bucket', 'inputs/x/y.png')).rejects.toThrow(/Unknown R2 bucket/);
  });

  it('accepts both configured buckets', () => {
    expect(objectUrl(R2_PUBLIC_BUCKET, 'blog/x.png')).toBe(`${ENDPOINT}/miu-public/blog/x.png`);
  });

  it('throws a clear error when R2 credentials are missing', async () => {
    mocks.serverEnv.R2_ACCESS_KEY_ID = '';
    await expect(presignGet(R2_PRIVATE_BUCKET, 'inputs/x/y.png')).rejects.toThrow(/not configured/);
  });

  it('sends PUT, DELETE, GET and HEAD as their exact HTTP methods', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await put(R2_PRIVATE_BUCKET, 'inputs/x/y.png', 'body', 'image/png');
    await deleteObject(R2_PRIVATE_BUCKET, 'inputs/x/y.png');
    await head(R2_PRIVATE_BUCKET, 'inputs/x/y.png');
    await get(R2_PRIVATE_BUCKET, 'inputs/x/y.png');

    const methods = fetchMock.mock.calls.map(([request]) => (request as Request).method);
    expect(methods).toEqual(['PUT', 'DELETE', 'HEAD', 'GET']);
  });

  it('surfaces a non-ok PUT response as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    await expect(put(R2_PRIVATE_BUCKET, 'inputs/x/y.png', 'body')).rejects.toThrow(/PUT failed/);
  });

  it('always signs a PUT with the If-None-Match:* precondition', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await put(R2_PUBLIC_BUCKET, 'blog/a.webp', 'body', 'image/webp');
    await put(R2_PUBLIC_BUCKET, 'blog/b.webp', 'body');

    for (const [request] of fetchMock.mock.calls) {
      const headers = (request as Request).headers;
      expect(headers.get('if-none-match')).toBe('*');
    }
    expect((fetchMock.mock.calls[0][0] as Request).headers.get('content-type')).toBe('image/webp');
  });

  it('propagates a 412 collision without retrying or overwriting', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 412 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(put(R2_PUBLIC_BUCKET, 'saved/existing.png', 'body')).rejects.toThrow(/412/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats a missing object as a successful delete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(deleteObject(R2_PRIVATE_BUCKET, 'inputs/x/y.png')).resolves.toBeUndefined();
  });
});

describe('r2-presign shared helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signs a PUT with the immutable precondition and a GET without it', async () => {
    const url = `${ENDPOINT}/miu-private/inputs/user-1/job.png`;

    const put = await presignPutUrl({
      url,
      accessKeyId: mocks.serverEnv.R2_ACCESS_KEY_ID,
      secretAccessKey: mocks.serverEnv.R2_SECRET_ACCESS_KEY,
      sizeBytes: 1024,
      contentType: 'image/png',
      expiresSeconds: 900,
    });
    expect(new URL(put).searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-length;content-type;host;if-none-match'
    );
    const putSignature = await signatureFor(put, 'PUT', {
      headers: { 'content-length': '1024', 'content-type': 'image/png', 'if-none-match': '*' },
      allHeaders: true,
    });
    expect(putSignature.recomputed).toBe(putSignature.original);

    const get = await presignGetUrl({
      url,
      accessKeyId: mocks.serverEnv.R2_ACCESS_KEY_ID,
      secretAccessKey: mocks.serverEnv.R2_SECRET_ACCESS_KEY,
      expiresSeconds: 600,
    });
    expect(new URL(get).searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    const getSignature = await signatureFor(get, 'GET');
    expect(getSignature.recomputed).toBe(getSignature.original);
  });

  it('signs a HEAD with its own method so a GET signature cannot be replayed', async () => {
    const url = `${ENDPOINT}/miu-private/saved/user-1/job.png`;
    const head = await presignHeadUrl({
      url,
      accessKeyId: mocks.serverEnv.R2_ACCESS_KEY_ID,
      secretAccessKey: mocks.serverEnv.R2_SECRET_ACCESS_KEY,
      expiresSeconds: 900,
    });
    expect(new URL(head).searchParams.get('X-Amz-SignedHeaders')).toBe('host');

    const asHead = await signatureFor(head, 'HEAD');
    const asGet = await signatureFor(head, 'GET');
    expect(asHead.recomputed).toBe(asHead.original);
    expect(asGet.recomputed).not.toBe(asHead.original);
  });
});

describe('r2-cors.json policy', () => {
  it('uses the lowercase Wrangler CLI shape with the expected values', () => {
    expect(corsPolicy).not.toHaveProperty('Rules');
    const [rule] = corsPolicy.rules;
    expect(rule.allowed.origins).toEqual([
      'https://myimageupscaler.com',
      'https://www.myimageupscaler.com',
      'http://localhost:3000',
    ]);
    expect(rule.allowed.methods).toEqual(['PUT', 'GET', 'HEAD']);
    expect(rule.allowed.headers).toEqual(['content-type', 'if-none-match']);
    expect(rule.exposeHeaders).toEqual(['ETag']);
    expect(rule.maxAgeSeconds).toBe(3600);
  });
});
