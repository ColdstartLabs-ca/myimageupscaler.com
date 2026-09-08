import { test, expect } from '@playwright/test';
import { Miniflare, Response as WorkerResponse } from 'miniflare';
import { WebSocket } from 'undici';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import {
  startUpscaleTestBackend,
  type IUpscaleTestBackend,
  type IUpscaleTestUser,
} from '../helpers/upscale-test-backend';

const ORIGIN = 'https://upscale-runtime.test';
const MIB = 1024 * 1024;
const artifactDirectory = 'test-results/upscale/worker';

// Valid PNG with a legal ancillary text chunk, generated outside workerd.
function png(width: number, height: number, bytes: number): Buffer {
  const table = Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  const chunk = (kind: string, content: Buffer) => {
    const result = Buffer.alloc(content.length + 12);
    result.writeUInt32BE(content.length);
    result.write(kind, 4);
    content.copy(result, 8);
    let crc = 0xffffffff;
    for (const byte of result.subarray(4, -4)) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
    return result;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const parts = [
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc((width * 3 + 1) * height))),
    chunk('IEND', Buffer.alloc(0)),
  ];
  const padding = Buffer.alloc(bytes - parts.reduce((sum, part) => sum + part.length, 0) - 12, 65);
  padding.write('Note\0');
  parts.splice(3, 0, chunk('tEXt', padding));
  return Buffer.concat(parts);
}

interface IHeapSample {
  usedSize: number;
  totalSize: number;
  backingStorageSize?: number;
  at: number;
}

async function inspector(
  worker: Miniflare
): Promise<{ sample(): Promise<IHeapSample>; collectGarbage(): Promise<void>; close(): void }> {
  const origin = await worker.getInspectorURL();
  origin.protocol = origin.protocol === 'wss:' ? 'https:' : 'http:';
  const targets = (await (await fetch(new URL('/json', origin))).json()) as Array<{
    id: string;
    webSocketDebuggerUrl: string;
  }>;
  const target = targets.find(candidate => candidate.id === 'core:user:myimageupscaler');
  expect(target, JSON.stringify(targets)).toBeDefined();
  const socket = new WebSocket(target!.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map<
    number,
    { resolve(value: IHeapSample): void; reject(error: Error): void }
  >();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data)) as {
      id: number;
      result: IHeapSample;
      error?: { message: string };
    };
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve({ ...message.result, at: Date.now() });
  });
  const command = (method: string) =>
    new Promise<IHeapSample>((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method }));
    });
  return {
    sample: () => command('Runtime.getHeapUsage'),
    collectGarbage: async () => {
      await command('HeapProfiler.collectGarbage');
    },
    close: () => socket.close(),
  };
}

test.describe('built OpenNext workerd memory boundary', () => {
  test.describe.configure({ timeout: 240_000, mode: 'serial' });
  let backend: IUpscaleTestBackend;
  let worker: Miniflare;
  let debug: Awaited<ReturnType<typeof inspector>>;
  const outbound: Array<{ host: string; path: string; method: string }> = [];
  const heap: IHeapSample[] = [];
  const admitted: Array<{ user: IUpscaleTestUser; jobId: string }> = [];
  let heartbeat: ReturnType<typeof setInterval>;

  test.beforeAll(async () => {
    backend = await startUpscaleTestBackend();
    for (const migration of [
      '20260726132000_provider_health_circuit.sql',
      '20260805182000_provider_circuit_half_open_recovery.sql',
      '20260805210000_harden_provider_circuit_grants.sql',
    ]) {
      await backend.db.query(await readFile(`supabase/migrations/${migration}`, 'utf8'));
    }
    await backend.db.query("NOTIFY pgrst, 'reload schema'");
    const compiled = '.open-next/compiled';
    const generated = await readdir(compiled, { recursive: true });
    const entrypoint = path.join(compiled, 'worker.js');
    const modules = [
      { type: 'ESModule' as const, path: entrypoint },
      ...generated
        .filter(file => file.endsWith('.wasm'))
        .map(file => ({ type: 'CompiledWasm' as const, path: path.join(compiled, file) })),
    ];
    worker = new Miniflare({
      name: 'myimageupscaler',
      modules,
      compatibilityDate: '2024-12-30',
      compatibilityFlags: ['nodejs_compat'],
      inspectorPort: 0,
      cf: { country: 'US', colo: 'YVR' },
      r2Buckets: ['NEXT_INC_CACHE_R2_BUCKET'],
      durableObjects: { NEXT_CACHE_DO_QUEUE: { className: 'DOQueueHandler', useSQLite: true } },
      serviceBindings: {
        WORKER_SELF_REFERENCE: 'myimageupscaler',
        ASSETS: () => new WorkerResponse(null, { status: 404 }),
      },
      bindings: {
        ENV: 'production',
        NODE_ENV: 'production',
        NEXT_PUBLIC_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: backend.publicOrigin,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: backend.anonKey,
        SUPABASE_SERVICE_ROLE_KEY: backend.serviceRoleKey,
        NEXT_PUBLIC_BASE_URL: ORIGIN,
        UPSCALE_DURABLE_EXECUTION_ENABLED: 'true',
        UPSCALE_DURABLE_COHORT_PERCENT: '100',
        UPSCALE_EXECUTOR_BASE_URL: 'https://executor.upscale-fixture.invalid',
        UPSCALE_EXECUTOR_WAKE_SECRET: 'local-worker-wake-secret-32-characters',
        AMPLITUDE_API_KEY: '',
        BASELIME_API_KEY: '',
        REPLICATE_API_TOKEN: 'fixture-provider-token',
      },
      outboundService: async request => {
        const url = new URL(request.url);
        outbound.push({ host: url.host, path: url.pathname, method: request.method });
        if (url.origin === 'https://executor.upscale-fixture.invalid')
          return new WorkerResponse(null, { status: 202 });
        if (url.origin !== backend.publicOrigin)
          throw new Error(`Unexpected Worker outbound request: ${url.host}${url.pathname}`);
        const response = await fetch(backend.url + url.pathname + url.search, {
          method: request.method,
          headers: Object.fromEntries(request.headers),
          body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
        });
        return new WorkerResponse(response.body as never, {
          status: response.status,
          headers: Object.fromEntries(response.headers),
        });
      },
    });
    await worker.ready;
    debug = await inspector(worker);
    heartbeat = setInterval(
      () =>
        void backend.db.query('SELECT public.record_upscale_executor_health($1, true)', [
          `sha256:${'a'.repeat(64)}`,
        ]),
      30_000
    );
    await mkdir(artifactDirectory, { recursive: true });
  });

  test.afterAll(async () => {
    clearInterval(heartbeat);
    debug?.close();
    if (worker) await worker.dispose();
    if (backend) await backend.close();
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(
      path.join(artifactDirectory, 'observations.json'),
      JSON.stringify({ outbound, heap }, null, 2)
    );
  });

  async function request(user: IUpscaleTestUser, pathname: string, body?: unknown) {
    return worker.dispatchFetch(ORIGIN + pathname, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json',
        'X-Upscale-Protocol': '2',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function sampleHeap() {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const sample = await debug.sample();
    heap.push(sample);
    console.log('HEAP_SAMPLE', JSON.stringify(sample));
    expect(sample.usedSize).toBeGreaterThan(0);
    expect(sample.usedSize + (sample.backingStorageSize ?? 0)).toBeLessThan(512 * MIB);
  }

  test('admits the largest paid Quick fallback input without provider execution or retained image buffers', async () => {
    const source = png(2048, 2048, 25 * MIB);
    const users = await Promise.all(Array.from({ length: 25 }, () => backend.createUser(100)));
    const observations: Array<{ concurrency: number; elapsedMs: number; jobs: string[] }> = [];
    const artifact = await readFile('.open-next/compiled/worker.js');
    for (const concurrency of [1, 5, 10, 25]) {
      const startedAt = Date.now();
      const jobs = await Promise.all(
        users.slice(0, concurrency).map(async user => {
          const jobId = randomUUID();
          const storagePath = `${user.id}/${jobId}.png`;
          backend.putObject(storagePath, source, 'image/png');
          const response = await request(user, '/api/upscale', {
            jobId,
            storagePath,
            mimeType: 'image/png',
            config: { qualityTier: 'quick', scale: 2 },
          });
          const text = await response.text();
          expect(response.status, text).toBe(202);
          const body = JSON.parse(text) as { jobId: string; status: string };
          expect(body.jobId).toBe(jobId);
          admitted.push({ user, jobId });
          return jobId;
        })
      );
      observations.push({ concurrency, elapsedMs: Date.now() - startedAt, jobs });
      await sampleHeap();
      const persisted = await backend.db.query(
        'SELECT job_id, resolved_model_id, stage FROM public.upscale_executions WHERE job_id = ANY($1::uuid[])',
        [jobs]
      );
      expect(persisted.rowCount).toBe(concurrency);
      expect(
        persisted.rows.every(
          row => row.stage === 'queued' && row.resolved_model_id === 'clarity-upscaler'
        )
      ).toBe(true);
    }
    expect(
      outbound.filter(
        call =>
          !['upscale-test.supabase.co', 'executor.upscale-fixture.invalid'].includes(call.host)
      )
    ).toEqual([]);
    await writeFile(
      path.join(artifactDirectory, 'admissions.json'),
      JSON.stringify(
        {
          bundleSha256: createHash('sha256').update(artifact).digest('hex'),
          inputBytes: source.length,
          observations,
        },
        null,
        2
      )
    );
  });

  test('streams maximum outputs to 1, 5, 10 and 25 slow consumers within the Worker memory bound', async () => {
    expect(admitted.length).toBe(41);
    const jobs = admitted.slice(-25);
    const output = png(4096, 4096, 128 * MIB);
    const expectedHash = createHash('sha256').update(output).digest('hex');
    await Promise.all(
      jobs.map(({ jobId }) => backend.stageReady(jobId, output, { width: 4096, height: 4096 }))
    );
    const balances = await backend.db.query(
      'SELECT id, subscription_credits_balance FROM public.profiles ORDER BY id'
    );
    const downloads: Array<{ concurrency: number; bytes: number; outputSha256: string }> = [];
    for (const concurrency of [1, 5, 10, 25]) {
      const responses = await Promise.all(
        jobs.slice(0, concurrency).map(async ({ user, jobId }) => {
          const status = await request(user, `/api/upscale/jobs?jobId=${jobId}`);
          expect(status.status).toBe(200);
          const body = (await status.json()) as { deliveryToken: string; outputSizeBytes: number };
          expect(body.outputSizeBytes).toBe(output.length);
          const response = await request(user, '/api/upscale/output', {
            reservationJobId: jobId,
            deliveryToken: body.deliveryToken,
          });
          expect(response.status).toBe(200);
          return response;
        })
      );
      await new Promise(resolve => setTimeout(resolve, 100));
      await sampleHeap();
      const lengths = await Promise.all(
        responses.map(async response => {
          const reader = response.body!.getReader();
          const hash = createHash('sha256');
          let bytes = 0;
          let nextSample = 8 * MIB;
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            hash.update(chunk.value);
            if (bytes >= nextSample) {
              await sampleHeap();
              nextSample += 8 * MIB;
              await new Promise(resolve => setTimeout(resolve, 5));
            }
          }
          expect(bytes).toBe(output.length);
          expect(hash.digest('hex')).toBe(expectedHash);
          return bytes;
        })
      );
      downloads.push({
        concurrency,
        bytes: lengths.reduce((sum, bytes) => sum + bytes, 0),
        outputSha256: expectedHash,
      });
    }
    const settled = await backend.db.query(
      'SELECT stage FROM public.upscale_executions WHERE job_id = ANY($1::uuid[])',
      [jobs.map(job => job.jobId)]
    );
    expect(settled.rows.every(row => row.stage === 'completed')).toBe(true);
    expect(
      (
        await backend.db.query(
          'SELECT id, subscription_credits_balance FROM public.profiles ORDER BY id'
        )
      ).rows
    ).toEqual(balances.rows);
    await writeFile(
      path.join(artifactDirectory, 'downloads.json'),
      JSON.stringify(downloads, null, 2)
    );
  });
});
