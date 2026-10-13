import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

import * as smokeModule from '../../../scripts/storage/r2-smoke.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRow = Record<string, any>;

const runR2Smoke = (smokeModule as any).runR2Smoke as (options: AnyRow) => Promise<AnyRow>;

const ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
const SIGNING = {
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  accessKeyId: 'test-key',
  secretAccessKey: 'test-secret',
};
const WRONG_ETAG = '"00000000000000000000000000000000"';

function sha256(value: Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeHeaders(headers: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (typeof headers.entries === 'function') {
    for (const [key, value] of headers.entries()) out[String(key).toLowerCase()] = String(value);
  } else {
    for (const [key, value] of Object.entries(headers)) out[key.toLowerCase()] = String(value);
  }
  return out;
}

type Stored = { body: Buffer; etag: string; contentType: string; createdByUrl: string };
type Recorded = {
  method: string;
  pathname: string;
  url: string;
  headers: Record<string, string>;
  status: number;
  bodySha256?: string;
};

/**
 * A tiny in-memory R2 that emulates the contracts the smoke relies on: the
 * presigned PUT binds content-type and declared length, the immutable write
 * precondition returns 412, and a CopyObject honours the source and destination
 * preconditions.
 */
class FakeR2 {
  store = new Map<string, Stored>();
  requests: Recorded[] = [];
  copyResultOverride: string | null = null;
  failNextCopyStatus: number | null = null;
  private counter = 0;

  private cors(origin?: string, status = 204): Response {
    return new Response(null, {
      status,
      headers: {
        'access-control-allow-origin': origin ?? '*',
        'access-control-allow-methods': 'GET,PUT,HEAD,OPTIONS',
        'access-control-allow-headers': 'content-type,if-none-match',
      },
    });
  }

  fetch = async (url: string, init: AnyRow = {}): Promise<Response> => {
    const method = String(init.method ?? 'GET').toUpperCase();
    const pathname = new URL(url).pathname;
    const headers = normalizeHeaders(init.headers);
    const record: Recorded = { method, pathname, url, headers, status: 0 };
    this.requests.push(record);

    if (method === 'OPTIONS') return this.cors(headers.origin);
    if (method === 'DELETE') {
      this.store.delete(pathname);
      record.status = 204;
      return new Response(null, { status: 204 });
    }
    if (method === 'HEAD') {
      const object = this.store.get(pathname);
      if (!object) {
        record.status = 404;
        return new Response(null, { status: 404 });
      }
      record.status = 200;
      return new Response(null, {
        status: 200,
        headers: { etag: object.etag, 'content-length': String(object.body.length) },
      });
    }
    if (method === 'GET') return this.get(pathname, headers, record);
    if (method === 'PUT') {
      if (headers['x-amz-copy-source']) return this.copy(pathname, url, headers, record);
      return this.put(pathname, url, headers, init.body, record);
    }
    record.status = 400;
    return new Response('bad', { status: 400 });
  };

  private async put(
    pathname: string,
    url: string,
    headers: Record<string, string>,
    body: any,
    record: Recorded
  ): Promise<Response> {
    const bytes = Buffer.from(body ?? []);
    const existing = this.store.get(pathname);
    if (existing) {
      if (headers['content-type'] !== existing.contentType) {
        record.status = 403;
        return new Response('bad content-type', { status: 403 });
      }
      if (url === existing.createdByUrl) {
        record.status = 412;
        return this.cors(headers.origin, 412);
      }
      record.status = 403;
      return new Response('bad declared length', { status: 403 });
    }
    const etag = `"etag-${++this.counter}"`;
    this.store.set(pathname, {
      body: bytes,
      etag,
      contentType: headers['content-type'] ?? 'application/octet-stream',
      createdByUrl: url,
    });
    record.status = 200;
    return new Response(null, {
      status: 200,
      headers: { etag, 'access-control-allow-origin': headers.origin ?? '*' },
    });
  }

  private copy(
    pathname: string,
    url: string,
    headers: Record<string, string>,
    record: Recorded
  ): Response {
    const sourcePath = decodeURIComponent(String(headers['x-amz-copy-source']));
    const destination = this.store.get(pathname);
    if (destination && headers['cf-copy-destination-if-none-match'] === '*') {
      record.status = 412;
      return new Response('destination exists', { status: 412 });
    }
    const source = this.store.get(sourcePath);
    if (!source) {
      record.status = 404;
      return new Response('no source', { status: 404 });
    }
    const ifMatch = headers['x-amz-copy-source-if-match'];
    if (ifMatch && ifMatch !== source.etag) {
      record.status = 412;
      return new Response('source etag mismatch', { status: 412 });
    }
    if (this.failNextCopyStatus !== null) {
      const status = this.failNextCopyStatus;
      this.failNextCopyStatus = null;
      record.status = status;
      return new Response('copy failed', { status });
    }
    const etag = `"copy-${++this.counter}"`;
    this.store.set(pathname, {
      body: Buffer.from(source.body),
      etag,
      contentType: source.contentType,
      createdByUrl: url,
    });
    record.status = 200;
    const xml =
      this.copyResultOverride ??
      `<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult><ETag>${etag}</ETag></CopyObjectResult>`;
    return new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } });
  }

  private get(pathname: string, headers: Record<string, string>, record: Recorded): Response {
    const object = this.store.get(pathname);
    if (!object) {
      record.status = 404;
      return new Response('missing', { status: 404 });
    }
    record.bodySha256 = sha256(object.body);
    if (headers.range === 'bytes=0-3') {
      record.status = 206;
      return new Response(new Uint8Array(object.body.subarray(0, 4)), {
        status: 206,
        headers: { 'content-range': `bytes 0-3/${object.body.length}` },
      });
    }
    record.status = 200;
    return new Response(new Uint8Array(object.body), {
      status: 200,
      headers: { 'content-type': object.contentType, etag: object.etag },
    });
  }
}

function deps(r2: FakeR2) {
  return { signing: SIGNING, fetchFn: r2.fetch, client: { fetch: r2.fetch } };
}

describe('r2-smoke: runR2Smoke', () => {
  it('preserves the HTTP/CORS smoke and proves destination-conditional CopyObject', async () => {
    const r2 = new FakeR2();
    const proof = await runR2Smoke(deps(r2));

    expect(proof.runPrefix).toMatch(/^dev\/smoke\/[0-9a-f-]{36}\/$/);
    expect(proof.copy.status).toBe(200);
    expect(proof.copy.sha256).toBe(proof.sourceSha256);
    expect(proof.copyOverDestination.status).toBe(412);
    expect(proof.wrongSourceEtag).toEqual({ copy: 412, head: 404 });

    // Every request this run made stayed inside its own unique prefix.
    const prefixPath = `/miu-private/${proof.runPrefix}`;
    for (const request of r2.requests) {
      expect(request.pathname.startsWith(prefixPath)).toBe(true);
      expect(request.pathname).not.toMatch(/\/(inputs|saved|archive)\//);
    }

    // Signature binding: wrong content-type and wrong declared length are 403,
    // the replayed immutable write is 412.
    const directPuts = r2.requests.filter(
      r => r.method === 'PUT' && !r.headers['x-amz-copy-source']
    );
    const rejected = directPuts.filter(r => r.status === 403);
    expect(rejected).toHaveLength(2);
    expect(rejected.some(r => r.headers['content-type'] === 'application/octet-stream')).toBe(true);
    expect(directPuts.some(r => r.status === 412)).toBe(true);

    // The successful copy carried both conditions and the exact source key.
    const copyRequests = r2.requests.filter(
      r => r.method === 'PUT' && r.headers['x-amz-copy-source']
    );
    const accepted = copyRequests.find(r => r.status === 200)!;
    expect(accepted.headers['x-amz-copy-source']).toBe(`/miu-private/${proof.keys.source}`);
    expect(accepted.headers['x-amz-copy-source-if-match']).toBe(proof.sourceEtag);
    expect(accepted.headers['cf-copy-destination-if-none-match']).toBe('*');
    const retry = copyRequests.find(
      r =>
        r.status === 412 && r.headers['x-amz-copy-source'] === `/miu-private/${proof.keys.source2}`
    )!;
    expect(retry.headers['cf-copy-destination-if-none-match']).toBe('*');
    const wrong = copyRequests.find(r => r.headers['x-amz-copy-source-if-match'] === WRONG_ETAG)!;
    expect(wrong.status).toBe(412);
    expect(wrong.pathname).toBe(`/miu-private/${proof.keys.wrong}`);

    // No original overwrite: every destination read back equals the source bytes.
    const destReads = r2.requests.filter(
      r => r.method === 'GET' && r.pathname === `/miu-private/${proof.keys.dest}`
    );
    expect(destReads).toHaveLength(2);
    expect(destReads.every(r => r.bodySha256 === proof.sourceSha256)).toBe(true);

    // Cleanup deleted only this run's unique keys and left nothing behind.
    const deletes = r2.requests.filter(r => r.method === 'DELETE');
    expect(deletes.map(r => r.pathname).sort()).toEqual(
      Object.values(proof.keys)
        .map(key => `/miu-private/${key}`)
        .sort()
    );
    expect(r2.store.size).toBe(0);
  });

  it('fails closed and still cleans up only its own keys', async () => {
    const r2 = new FakeR2();
    r2.failNextCopyStatus = 500;

    await expect(runR2Smoke(deps(r2))).rejects.toThrow(/CopyObject must return 200/);

    const deletes = r2.requests.filter(r => r.method === 'DELETE');
    expect(deletes).toHaveLength(4);
    expect(deletes.every(r => r.pathname.startsWith('/miu-private/dev/smoke/'))).toBe(true);
    expect(r2.store.size).toBe(0);
  });

  it('rejects an error, incomplete or weak CopyObject result document', async () => {
    const withResult = (xml: string) => {
      const r2 = new FakeR2();
      r2.copyResultOverride = xml;
      return runR2Smoke(deps(r2));
    };

    await expect(withResult('<Error><Code>AccessDenied</Code></Error>')).rejects.toThrow(
      /error document/
    );
    await expect(withResult('<CopyObjectResult><ETag>weak</ETag>')).rejects.toThrow(/incomplete/);
    await expect(
      withResult('<CopyObjectResult><ETag>weak</ETag></CopyObjectResult>')
    ).rejects.toThrow(/strong quoted ETag/);
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any */
