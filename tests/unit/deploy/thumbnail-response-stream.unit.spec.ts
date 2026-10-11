import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, test } from 'vitest';

const thumbnail = '/api/gallery/thumb/11111111-1111-4111-8111-111111111111';
const cases = [
  [thumbnail, '3', 200],
  ['/api/gallery', '3', 200],
  [thumbnail, '', 200],
  [thumbnail, '3', 403],
  [thumbnail, '0', 200],
  [thumbnail, '9007199254740992', 200],
] as const;
const fixtureHandler = `
  export class DOQueueHandler {}
  export class DOShardedTagCache {}
  export class BucketCachePurge {}
  export default { async fetch(request) {
    const headers = new Headers({
      'content-type': 'image/webp', 'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    });
    const length = request.headers.get('x-fixture-length');
    if (length) headers.set('content-length', length);
    const body = new ReadableStream({ start(c) {
      c.enqueue(new Uint8Array([1, 2, 3])); c.close();
    }});
    return new Response(body, {
      status: Number(request.headers.get('x-fixture-status') || 200), headers,
    });
  }};
`;
let responses: Array<{ status: number; headers: Record<string, string>; bytes: number[] }>;

beforeAll(() => {
  // Workerd/esbuild need native Node globals; the shared unit setup replaces them with browser mocks.
  const output = execFileSync(
    'node',
    [
      '--input-type=module',
      '-e',
      `
    import { build } from 'esbuild';
    import { Miniflare } from 'miniflare';
    const bundle = await build({
      entryPoints: ['worker.mjs'], bundle: true, format: 'esm', write: false,
      plugins: [{name: 'synthetic-next-handler', setup(builder) {
        builder.onResolve({filter: /\\.open-next\\/worker\\.js$/}, () => ({path: 'next-handler', namespace: 'fixture'}));
        builder.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({contents: ${JSON.stringify(fixtureHandler)}}));
      }}],
    });
    const runtime = new Miniflare({modules: true, compatibilityDate: '2024-12-30', script: bundle.outputFiles[0].text});
    try {
      const origin = await runtime.ready;
      const responses = [];
      for (const [path, length, status] of ${JSON.stringify(cases)}) {
        const response = await fetch(new URL(path, origin), {
          headers: {'x-fixture-length': length, 'x-fixture-status': String(status)},
          signal: AbortSignal.timeout(5000),
        });
        responses.push({status: response.status, headers: Object.fromEntries(response.headers), bytes: [...new Uint8Array(await response.arrayBuffer())]});
      }
      console.log(JSON.stringify(responses));
    } finally { await runtime.dispose(); }
  `,
    ],
    { encoding: 'utf8', timeout: 30_000 }
  );
  responses = JSON.parse(output.trim());
}, 35_000);

describe('thumbnail response through the real Worker HTTP transport', () => {
  test('preserves known length, exact bytes and private response headers', () => {
    const response = responses[0];
    expect(response.headers['content-length']).toBe('3');
    expect(response.headers['transfer-encoding']).toBeUndefined();
    expect(response.bytes).toEqual([1, 2, 3]);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  test.each(cases.slice(1).map((value, i) => [...value, i + 1] as const))(
    'leaves unrelated, unknown/invalid-length and error responses streaming (%s, %s, %s)',
    (_path, _length, status, index) => {
      const response = responses[index];
      expect(response.status).toBe(status);
      expect(response.headers['content-length']).toBeUndefined();
      expect(response.bytes).toEqual([1, 2, 3]);
    }
  );
});
