import { defineConfig } from '@playwright/test';
import { Miniflare, Response as WorkerResponse } from 'miniflare';
import { WebSocket } from 'undici';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { constants, createWriteStream, existsSync } from 'node:fs';
import { copyFile, cp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { argv, env as hostEnvironment, execPath } from 'node:process';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { startAsyncUpscaleDatabase, type IAsyncUpscaleDatabase } from './async-upscale-database';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRATCH = path.join(ROOT, '.tmp/async-upscale/runtime');
const require = createRequire(import.meta.url);
const pinnedWorkerdPath =
  hostEnvironment.MINIFLARE_WORKERD_PATH ?? (require('workerd') as { default?: unknown }).default;
if (typeof pinnedWorkerdPath !== 'string' || !existsSync(pinnedWorkerdPath))
  throw new Error(`Pinned workerd binary is missing: ${String(pinnedWorkerdPath)}`);
// Miniflare reads this variable when it spawns each runtime. Set it before any
// candidate/control pair starts so concurrent startup cannot restore the old copy.
hostEnvironment.MINIFLARE_WORKERD_PATH = pinnedWorkerdPath;
const ORIGIN = 'https://upscale-runtime.test';
const SUPABASE_ORIGIN = 'https://upscale-test.supabase.co';
const PROVIDER_ORIGIN = 'https://api.replicate.com';
const DELIVERY_ORIGIN = 'https://replicate.delivery';
export const ASYNC_RUNTIME_ARTIFACTS = path.join(ROOT, 'test-results/async-upscale-runtime');

// This configuration deliberately has no test-mode dev server or remote-user teardown.
export default defineConfig({
  testDir: '../workers',
  projects: [{ name: 'workers-preview', testMatch: /async-upscale\.preview\.spec\.ts$/ }],
  workers: 1,
  retries: 0,
  timeout: 600_000,
  reporter: [['list']],
  outputDir: path.join(ASYNC_RUNTIME_ARTIFACTS, 'playwright'),
});

interface IUser {
  id: string;
  accessToken: string;
}
interface IArtifact {
  subject: string;
  sourceRevision: string;
  sourceSha256: string;
  bundleSha256: string;
}
interface IHeapSample {
  usedSize: number;
  totalSize: number;
  backingStorageSize?: number;
  at: number;
}
interface ICall {
  host: string;
  path: string;
  method: string;
  at: number;
  predictionId?: string;
  status?: number;
  metadataBytes?: number;
  model?: string;
}
interface IRuntimeOptions {
  subject: 'candidate' | 'synchronous-control';
  providerDelayMs: number;
  metadataBytes?: number;
  outputBytes?: number;
  premiumModels?: boolean;
}
interface IPrediction {
  id: string;
  startedAt: number;
  delayMs: number;
  input: Record<string, unknown>;
  model: string;
  output: Buffer;
  canceled: boolean;
  error: string | null;
}

export interface IAsyncUpscaleRuntime {
  browserOrigin: string;
  externalRequest(url: string, init?: RequestInit): Promise<Response>;
  database: IAsyncUpscaleDatabase;
  artifact: IArtifact;
  createUser: IAsyncUpscaleDatabase['createUser'];
  setProviderDelayMs(milliseconds: number): void;
  losePredictionIdentityOnce(): void;
  rejectNextCreateOnce(status: number): void;
  failNextPredictionOnce(message: string): void;
  putInput(options: {
    userId: string;
    jobId: string;
    width: number;
    height: number;
    bytes: number;
  }): string;
  request(
    user: Pick<IUser, 'accessToken'> | null,
    pathname: string,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<Response>;
  requestHttp(
    user: Pick<IUser, 'accessToken'> | null,
    pathname: string,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<Response>;
  cron(secret?: string): Promise<Response>;
  calls: ICall[];
  invocations: Array<{
    path: string;
    method: string;
    startedAt: number;
    headersMs: number;
    status: number;
  }>;
  inspector: {
    collectGarbage(): Promise<void>;
    sample(): Promise<IHeapSample>;
    startProfiles(): Promise<void>;
    stopProfiles(label: string): Promise<void>;
    snapshot(label: string): Promise<void>;
  };
  close(): Promise<void>;
}

// Valid PNG, generated in the Node fixture; the Worker receives only the real storage range.
export function png(width: number, height: number, targetBytes: number): Buffer {
  const table = Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  const chunk = (type: string, bytes: Buffer) => {
    const result = Buffer.alloc(bytes.length + 12);
    result.writeUInt32BE(bytes.length);
    result.write(type, 4);
    bytes.copy(result, 8);
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
  const paddingBytes = targetBytes - parts.reduce((sum, part) => sum + part.length, 0) - 12;
  if (paddingBytes >= 5) {
    const padding = Buffer.alloc(paddingBytes, 65);
    padding.write('Note\0');
    parts.splice(3, 0, chunk('tEXt', padding));
  }
  return Buffer.concat(parts);
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 2 * 1024 * 1024) throw new Error('Unexpected oversized fixture request');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function forward(response: Response, target: ServerResponse): Promise<void> {
  target.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) {
    target.end();
    return;
  }
  const stream = Readable.fromWeb(response.body as never);
  target.on('close', () => stream.destroy());
  stream.on('error', () => target.destroy());
  stream.pipe(target);
}

function imageStream(bytes: Buffer, slow = false): Response {
  let offset = 0;
  let canceled = false;
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (slow) await delay(2);
        if (canceled) return;
        if (offset === bytes.length) return controller.close();
        const next = bytes.subarray(offset, offset + 64 * 1024);
        offset += next.length;
        controller.enqueue(next);
      },
      cancel() {
        canceled = true;
      },
    }),
    { headers: { 'Content-Type': 'image/png', 'Content-Length': String(bytes.length) } }
  );
}

async function connectInspector(worker: Miniflare, subject: string) {
  const origin = await worker.getInspectorURL();
  origin.protocol = origin.protocol === 'wss:' ? 'https:' : 'http:';
  const targets = (await (await fetch(new URL('/json', origin))).json()) as Array<{
    id: string;
    webSocketDebuggerUrl: string;
  }>;
  const target = targets.find(entry => entry.id === 'core:user:myimageupscaler');
  if (!target) throw new Error('The built application Worker inspector target was not found');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  let snapshotChunks: string[] | undefined;
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      result?: unknown;
      error?: { message: string };
      method?: string;
      params?: { chunk: string };
    };
    if (message.method === 'HeapProfiler.addHeapSnapshotChunk') {
      snapshotChunks?.push(message.params!.chunk);
      return;
    }
    const request = message.id === undefined ? undefined : pending.get(message.id);
    if (!request) return;
    pending.delete(message.id!);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const command = (method: string, params?: Record<string, unknown>) =>
    new Promise<unknown>((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Inspector command timed out: ${method}`));
      }, 30_000);
      pending.set(id, {
        resolve(value) {
          clearTimeout(timeout);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timeout);
          reject(error);
        },
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const writeProfile = async (label: string, extension: string, data: unknown) => {
    await mkdir(ASYNC_RUNTIME_ARTIFACTS, { recursive: true });
    await writeFile(
      path.join(ASYNC_RUNTIME_ARTIFACTS, `${subject}-${label}.${extension}`),
      JSON.stringify(data)
    );
  };
  return {
    collectGarbage: async () => {
      await command('HeapProfiler.collectGarbage');
    },
    sample: async () => ({
      ...((await command('Runtime.getHeapUsage')) as Omit<IHeapSample, 'at'>),
      at: Date.now(),
    }),
    startProfiles: async () => {
      await command('Profiler.enable');
      await command('Profiler.start');
      await command('HeapProfiler.startSampling', { samplingInterval: 16384 });
    },
    stopProfiles: async (label: string) => {
      const cpu = (await command('Profiler.stop')) as { profile: unknown };
      const heap = (await command('HeapProfiler.stopSampling')) as { profile: unknown };
      await writeProfile(label, 'cpuprofile', cpu.profile);
      await writeProfile(label, 'heapprofile', heap.profile);
    },
    snapshot: async (label: string) => {
      snapshotChunks = [];
      try {
        await command('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
        await mkdir(ASYNC_RUNTIME_ARTIFACTS, { recursive: true });
        await writeFile(
          path.join(ASYNC_RUNTIME_ARTIFACTS, `${subject}-${label}.heapsnapshot`),
          snapshotChunks.join('')
        );
      } finally {
        snapshotChunks = undefined;
      }
    },
    close: () => socket.close(),
  };
}

export async function startAsyncUpscaleRuntime(
  options: IRuntimeOptions
): Promise<IAsyncUpscaleRuntime> {
  const buildRoot = path.join(SCRATCH, options.subject);
  const artifact = JSON.parse(
    await readFile(path.join(buildRoot, 'identity.json'), 'utf8')
  ) as IArtifact;
  const compiled = path.join(buildRoot, 'source/.open-next/compiled');
  const entrypoint = path.join(compiled, 'worker.js');
  const actualHash = createHash('sha256')
    .update(await readFile(entrypoint))
    .digest('hex');
  if (actualHash !== artifact.bundleSha256)
    throw new Error('Built Worker hash does not match its recorded identity');
  const database = await startAsyncUpscaleDatabase();
  const calls: ICall[] = [];
  const invocations: IAsyncUpscaleRuntime['invocations'] = [];
  const users = new Map<string, IUser>();
  const objects = new Map<string, { bytes: Buffer; width: number; height: number }>();
  const capabilities = new Map<string, string>();
  const predictions = new Map<string, IPrediction>();
  let providerDelayMs = options.providerDelayMs;
  let losePredictionIdentity = false;
  let nextCreateStatus: number | null = null;
  let nextPredictionError: string | null = null;
  const images = new Map<string, Buffer>();
  const getImage = (width: number, height: number, bytes: number) => {
    const key = `${width}/${height}/${bytes}`;
    if (!images.has(key)) images.set(key, png(width, height, bytes));
    return images.get(key)!;
  };
  const predictionResponse = (prediction: IPrediction) => {
    const completed = Date.now() >= prediction.startedAt + prediction.delayMs;
    const body = {
      id: prediction.id,
      model: prediction.model,
      version: prediction.model,
      input: prediction.input,
      status: prediction.canceled
        ? 'canceled'
        : completed
          ? prediction.error
            ? 'failed'
            : 'succeeded'
          : 'starting',
      created_at: new Date(prediction.startedAt).toISOString(),
      started_at: new Date(prediction.startedAt).toISOString(),
      completed_at: completed
        ? new Date(prediction.startedAt + prediction.delayMs).toISOString()
        : null,
      output:
        completed && !prediction.error ? [`${DELIVERY_ORIGIN}/${prediction.id}/output.png`] : null,
      error: completed ? prediction.error : null,
      logs: '',
      urls: {
        get: `${PROVIDER_ORIGIN}/v1/predictions/${prediction.id}`,
        cancel: `${PROVIDER_ORIGIN}/v1/predictions/${prediction.id}/cancel`,
      },
      metrics: completed ? { predict_time: prediction.delayMs / 1000 } : {},
    };
    const missing = (options.metadataBytes ?? 5241) - Buffer.byteLength(JSON.stringify(body));
    if (missing > 0) body.logs = 'x'.repeat(missing);
    return body;
  };
  const authenticate = (token: string | undefined): IUser | undefined => {
    if (!token) return undefined;
    const parts = token.split('.');
    if (parts.length !== 3) return undefined;
    const expected = createHmac('sha256', database.jwtSecret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest();
    const actual = Buffer.from(parts[2], 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as {
      sub?: string;
      exp: number;
    };
    return claims.sub && claims.exp > Date.now() / 1000 ? users.get(claims.sub) : undefined;
  };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://fixture.local');
      const originalHost = String(request.headers['x-fixture-host']);
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (value && !['host', 'connection', 'x-fixture-host'].includes(name))
          headers.set(name, Array.isArray(value) ? value.join(',') : value);
      }
      const call: ICall = {
        host: originalHost,
        path: url.pathname,
        method: request.method ?? 'GET',
        at: Date.now(),
      };
      calls.push(call);
      const body = ['GET', 'HEAD'].includes(call.method) ? undefined : await readBody(request);
      const json = () => JSON.parse(body?.toString() || '{}') as Record<string, unknown>;
      const authorization = headers.get('authorization')?.replace(/^Bearer /i, '');
      let result: Response;
      if (originalHost === new URL(PROVIDER_ORIGIN).host) {
        if (authorization !== 'fixture-replicate-token')
          throw new Error('Missing fixture provider authentication');
        const found = /^\/v1\/predictions\/([^/]+)(\/cancel)?$/.exec(url.pathname);
        if (
          call.method === 'POST' &&
          (url.pathname === '/v1/predictions' ||
            /^\/v1\/models\/[^/]+\/[^/]+\/predictions$/.test(url.pathname))
        ) {
          if (nextCreateStatus !== null) {
            const status = nextCreateStatus;
            nextCreateStatus = null;
            call.status = status;
            await forward(
              Response.json(
                {
                  detail:
                    status === 402
                      ? 'You have insufficient credit to run this model.'
                      : 'Provider unavailable',
                },
                { status }
              ),
              response
            );
            return;
          }
          const input = json().input as Record<string, unknown>;
          const imageUrl = new URL(String(input.image ?? input.img ?? input.input_image));
          const storagePath = decodeURIComponent(
            imageUrl.pathname.split('/upscale-inputs/')[1] ?? ''
          );
          const source = objects.get(storagePath);
          if (!source) throw new Error(`Prediction input object missing: ${storagePath}`);
          const scale = Number(
            input.scale ?? input.upscale ?? input.scale_factor ?? input.upscale_factor ?? 2
          );
          const prediction: IPrediction = {
            id: `runtime${predictions.size + 1}`,
            startedAt: Date.now(),
            delayMs: providerDelayMs,
            model: String(json().version ?? url.pathname.split('/').slice(3, 5).join('/')),
            input,
            canceled: false,
            error: nextPredictionError,
            output: getImage(
              source.width * scale,
              source.height * scale,
              options.outputBytes ?? 25 * 1024 * 1024
            ),
          };
          predictions.set(prediction.id, prediction);
          nextPredictionError = null;
          call.model = prediction.model;
          call.predictionId = prediction.id;
          // The existing SDK's Prefer: wait request must really hold its HTTP invocation.
          const prefer = /wait(?:=(\d+))?/.exec(headers.get('prefer') ?? '');
          if (prefer) await delay(Math.min(prediction.delayMs, Number(prefer[1] ?? 60) * 1000));
          result = Response.json(predictionResponse(prediction), { status: 201 });
        } else if (found && predictions.has(found[1])) {
          const prediction = predictions.get(found[1])!;
          call.predictionId = prediction.id;
          if (found[2] && call.method === 'POST') prediction.canceled = true;
          result = Response.json(predictionResponse(prediction));
        } else result = Response.json({ detail: 'Prediction not found' }, { status: 404 });
        call.metadataBytes = Buffer.byteLength(await result.clone().text());
      } else if (originalHost === new URL(DELIVERY_ORIGIN).host) {
        const prediction = predictions.get(url.pathname.split('/')[1]);
        result = prediction
          ? imageStream(prediction.output, true)
          : new Response(null, { status: 404 });
      } else if (url.pathname.startsWith('/rest/v1/')) {
        if (
          losePredictionIdentity &&
          url.pathname === '/rest/v1/rpc/record_async_upscale_prediction'
        ) {
          losePredictionIdentity = false;
          result = Response.json(
            { message: 'Fixture dropped prediction identity' },
            { status: 503 }
          );
        } else {
          result = await fetch(
            `${database.restUrl}${url.pathname.slice('/rest/v1'.length)}${url.search}`,
            { method: call.method, headers, body: body ? new Uint8Array(body) : undefined }
          );
        }
        if (!result.ok)
          console.error(
            '[runtime fixture SQL]',
            url.pathname,
            result.status,
            await result.clone().text()
          );
      } else if (url.pathname === '/auth/v1/user') {
        const user = authenticate(authorization);
        result = user
          ? Response.json({
              id: user.id,
              aud: 'authenticated',
              role: 'authenticated',
              email: `fixture-${user.id}@example.test`,
              created_at: new Date(0).toISOString(),
              app_metadata: { provider: 'email', providers: ['email'] },
              user_metadata: {},
            })
          : Response.json({ message: 'Invalid JWT' }, { status: 401 });
      } else if (url.pathname.startsWith('/storage/v1/object/upload/sign/upscale-inputs/')) {
        const storagePath = decodeURIComponent(url.pathname.split('/upscale-inputs/')[1]);
        if (call.method === 'POST' && authorization === database.serviceRoleKey) {
          const token = randomBytes(24).toString('hex');
          capabilities.set(token, storagePath);
          result = Response.json({
            url: `/object/upload/sign/upscale-inputs/${storagePath}?token=${token}`,
          });
        } else if (
          call.method === 'PUT' &&
          capabilities.get(url.searchParams.get('token') ?? '') === storagePath &&
          !objects.has(storagePath)
        ) {
          const form = await new Response(new Uint8Array(body!), { headers }).formData();
          const upload = form.get('');
          if (!upload || typeof upload === 'string')
            throw new Error('Signed upload omitted the file');
          const bytes = Buffer.from(await upload.arrayBuffer());
          if (!bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
            throw new Error('Release fixture expects a PNG');
          objects.set(storagePath, {
            bytes,
            width: bytes.readUInt32BE(16),
            height: bytes.readUInt32BE(20),
          });
          result = Response.json({ Key: `upscale-inputs/${storagePath}` });
        } else
          result = Response.json(
            { message: 'Invalid or already-used signed upload' },
            { status: 400 }
          );
      } else if (
        url.pathname === '/storage/v1/object/list/upscale-inputs' &&
        authorization === database.serviceRoleKey
      ) {
        const { prefix, search = '' } = json();
        result = Response.json(
          [...objects]
            .filter(
              ([name]) =>
                name.startsWith(`${prefix}/`) && name.split('/').at(-1)?.includes(String(search))
            )
            .map(([name, object]) => ({
              name: name.split('/').at(-1),
              id: name,
              metadata: { size: object.bytes.length, mimetype: 'image/png' },
            }))
        );
      } else if (url.pathname.startsWith('/storage/v1/object/sign/upscale-inputs/')) {
        const storagePath = decodeURIComponent(url.pathname.split('/upscale-inputs/')[1]);
        if (call.method === 'POST' && authorization === database.serviceRoleKey) {
          const capability = randomBytes(24).toString('hex');
          capabilities.set(capability, storagePath);
          result = Response.json({
            signedURL: `/object/sign/upscale-inputs/${storagePath}?token=${capability}`,
          });
        } else if (
          capabilities.get(url.searchParams.get('token') ?? '') === storagePath &&
          objects.has(storagePath)
        ) {
          const object = objects.get(storagePath)!;
          const range = /^bytes=(\d+)-(\d+)$/.exec(headers.get('range') ?? '');
          if (!range) throw new Error('Application unexpectedly read the full input image');
          const start = Number(range[1]);
          const end = Math.min(Number(range[2]), object.bytes.length - 1);
          result = new Response(new Uint8Array(object.bytes.subarray(start, end + 1)), {
            status: 206,
            headers: {
              'Content-Type': 'image/png',
              'Content-Length': String(end - start + 1),
              'Content-Range': `bytes ${start}-${end}/${object.bytes.length}`,
            },
          });
        } else result = new Response(null, { status: 404 });
      } else if (
        url.pathname === '/storage/v1/object/upscale-inputs' &&
        call.method === 'DELETE' &&
        authorization === database.serviceRoleKey
      ) {
        for (const storagePath of json().prefixes as string[]) objects.delete(storagePath);
        result = Response.json([]);
      } else {
        result = Response.json(
          {
            error: `Unimplemented fixture transport: ${call.method} ${originalHost}${url.pathname}`,
          },
          { status: 404 }
        );
      }
      call.status = result.status;
      await forward(result, response);
    } catch (error) {
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({ message: error instanceof Error ? error.message : 'Fixture failed' })
      );
    }
  });
  let worker: Miniflare | undefined;
  let inspector: Awaited<ReturnType<typeof connectInspector>> | undefined;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    inspector?.close();
    try {
      await worker?.dispose();
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await database.close();
    }
  };
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const fixtureOrigin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const modules = [
      { type: 'ESModule' as const, path: entrypoint },
      ...(await readdir(compiled, { recursive: true }))
        .filter(file => file.endsWith('.wasm'))
        .map(file => ({ type: 'CompiledWasm' as const, path: path.join(compiled, file) })),
    ];
    const workerdPath =
      hostEnvironment.MINIFLARE_WORKERD_PATH ??
      (require('workerd') as { default?: unknown }).default;
    if (typeof workerdPath !== 'string')
      throw new Error('The pinned workerd package did not expose an executable path');
    if (!existsSync(workerdPath))
      throw new Error(`Pinned workerd binary is missing: ${workerdPath}`);
    const previousWorkerdPath = hostEnvironment.MINIFLARE_WORKERD_PATH;
    hostEnvironment.MINIFLARE_WORKERD_PATH = workerdPath;
    try {
      worker = new Miniflare({
        name: 'myimageupscaler',
        modules,
        compatibilityDate: '2024-12-30',
        compatibilityFlags: JSON.parse(await readFile(path.join(ROOT, 'wrangler.json'), 'utf8'))
          .compatibility_flags,
        inspectorPort: 0,
        cf: { country: 'US', colo: 'YVR' },
        r2Buckets: ['NEXT_INC_CACHE_R2_BUCKET'],
        durableObjects: { NEXT_CACHE_DO_QUEUE: { className: 'DOQueueHandler', useSQLite: true } },
        assets: {
          directory: path.join(buildRoot, 'source/.open-next/assets'),
          binding: 'ASSETS',
          routerConfig: { has_user_worker: true },
        },
        serviceBindings: {
          WORKER_SELF_REFERENCE: 'myimageupscaler',
        },
        bindings: {
          ENV: 'production',
          NODE_ENV: 'production',
          NEXT_PUBLIC_ENV: 'production',
          NEXT_PUBLIC_BASE_URL: ORIGIN,
          NEXT_PUBLIC_SUPABASE_URL: SUPABASE_ORIGIN,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: database.anonKey,
          SUPABASE_SERVICE_ROLE_KEY: database.serviceRoleKey,
          REPLICATE_API_TOKEN: 'fixture-replicate-token',
          STRIPE_SECRET_KEY: 'sk_test_fixture',
          STRIPE_PRICE_HOBBY: 'price_async_hobby',
          STRIPE_PRICE_PRO: 'price_async_pro',
          STRIPE_PRICE_BUSINESS: 'price_async_business',
          AMPLITUDE_API_KEY: '',
          BASELIME_API_KEY: '',
          CRON_SECRET: 'local-runtime-cron-only',
          ENABLE_PREMIUM_MODELS: options.premiumModels === false ? '' : 'true',
        },
        outboundService: async request => {
          const url = new URL(request.url);
          if (![SUPABASE_ORIGIN, PROVIDER_ORIGIN, DELIVERY_ORIGIN].includes(url.origin))
            throw new Error(`Unexpected Worker network egress: ${url.host}${url.pathname}`);
          const response = await fetch(`${fixtureOrigin}${url.pathname}${url.search}`, {
            method: request.method,
            headers: { ...Object.fromEntries(request.headers), 'x-fixture-host': url.host },
            body: ['GET', 'HEAD'].includes(request.method)
              ? undefined
              : await request.arrayBuffer(),
          });
          return new WorkerResponse(response.body as never, {
            status: response.status,
            headers: Object.fromEntries(response.headers),
          });
        },
      });
      await worker.ready;
    } finally {
      if (previousWorkerdPath === undefined) delete hostEnvironment.MINIFLARE_WORKERD_PATH;
      else hostEnvironment.MINIFLARE_WORKERD_PATH = previousWorkerdPath;
    }
    inspector = await connectInspector(worker, options.subject);
    const runtimeWorker = worker;
    return {
      // NextRequest normalizes loopback IPs to localhost. Matching the browser
      // Host keeps locale rewrites internal, as they are on the deployed domain.
      browserOrigin: (await runtimeWorker.ready).origin.replace('127.0.0.1', 'localhost'),
      externalRequest: async (urlString, init = {}) => {
        const url = new URL(urlString);
        if (url.origin !== SUPABASE_ORIGIN)
          throw new Error('Only local Supabase transport is exposed to browsers');
        return fetch(`${fixtureOrigin}${url.pathname}${url.search}`, {
          ...init,
          headers: { ...Object.fromEntries(new Headers(init.headers)), 'x-fixture-host': url.host },
        });
      },
      database,
      artifact,
      calls,
      invocations,
      inspector,
      close,
      setProviderDelayMs: milliseconds => {
        if (!Number.isFinite(milliseconds) || milliseconds < 0)
          throw new Error('Invalid provider fixture delay');
        providerDelayMs = milliseconds;
      },
      losePredictionIdentityOnce: () => {
        losePredictionIdentity = true;
      },
      rejectNextCreateOnce: status => {
        nextCreateStatus = status;
      },
      failNextPredictionOnce: message => {
        nextPredictionError = message;
      },
      createUser: async userOptions => {
        const user = await database.createUser(userOptions);
        users.set(user.id, user);
        return user;
      },
      putInput: input => {
        const storagePath = `${input.userId}/${input.jobId}.png`;
        // Prepare measured-cohort image bytes outside the timed POST invocation.
        const scale = input.width === 1500 && input.height === 1000 ? 4 : 2;
        getImage(
          input.width * scale,
          input.height * scale,
          options.outputBytes ?? 25 * 1024 * 1024
        );
        objects.set(storagePath, {
          bytes: getImage(input.width, input.height, input.bytes),
          width: input.width,
          height: input.height,
        });
        return storagePath;
      },
      request: async (user, pathname, body, signal) => {
        const startedAt = Date.now();
        const method = body === undefined ? 'GET' : 'POST';
        const response = await runtimeWorker.dispatchFetch(ORIGIN + pathname, {
          method,
          headers: {
            ...(user ? { Authorization: `Bearer ${user.accessToken}` } : {}),
            'Content-Type': 'application/json',
            'X-Upscale-Protocol': '2',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal,
        });
        invocations.push({
          path: pathname,
          method,
          startedAt,
          headersMs: Date.now() - startedAt,
          status: response.status,
        });
        return response as unknown as Response;
      },
      requestHttp: async (user, pathname, body, signal) => {
        const startedAt = Date.now();
        const method = body === undefined ? 'GET' : 'POST';
        const workerOrigin = await runtimeWorker.ready;
        const response = await fetch(new URL(pathname, workerOrigin), {
          method,
          headers: {
            ...(user ? { Authorization: `Bearer ${user.accessToken}` } : {}),
            'Content-Type': 'application/json',
            'X-Upscale-Protocol': '2',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal,
        });
        invocations.push({
          path: pathname,
          method,
          startedAt,
          headersMs: Date.now() - startedAt,
          status: response.status,
        });
        return response;
      },
      cron: async (secret = 'local-runtime-cron-only') =>
        (await runtimeWorker.dispatchFetch(ORIGIN + '/api/cron/provider-health', {
          method: 'POST',
          headers: { 'x-cron-secret': secret },
        })) as unknown as Response,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

async function run(command: string, args: string[], cwd: string, logPath: string): Promise<number> {
  await mkdir(path.dirname(logPath), { recursive: true });
  const output = createWriteStream(logPath);
  // Build snapshots contain no .env files, and child processes inherit only host-tool essentials.
  const child = spawn(command, args, {
    cwd,
    env: {
      PATH: hostEnvironment.PATH,
      HOME: hostEnvironment.HOME,
      LANG: 'C.UTF-8',
      NODE_ENV: 'production',
      ENV: 'production',
      NEXT_PUBLIC_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      WRANGLER_SEND_METRICS: 'false',
      NEXT_PUBLIC_SUPABASE_URL: SUPABASE_ORIGIN,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon-key',
      NEXT_PUBLIC_BASE_URL: ORIGIN,
      STRIPE_SECRET_KEY: 'sk_test_fixture',
      SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(output, { end: false });
  child.stderr.pipe(output, { end: false });
  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', status => resolve(status ?? 1));
  });
  await new Promise<void>(resolve => output.end(resolve));
  return code;
}

async function build(subject: IRuntimeOptions['subject']): Promise<void> {
  const buildRoot = path.join(SCRATCH, subject);
  const source = path.join(buildRoot, 'source');
  const previousArtifact = existsSync(path.join(source, '.open-next/compiled/worker.js'));
  await rm(source, { recursive: true, force: true });
  await mkdir(source, { recursive: true });
  const files = [
    ...new Set(
      execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: ROOT })
        .toString()
        .split('\0')
        .filter(Boolean)
    ),
  ].filter(
    file =>
      !file
        .split('/')
        .some(
          part =>
            part.startsWith('.env') ||
            ['.git', '.tmp', 'node_modules', '.worktrees', '.dev.vars'].includes(part)
        )
  );
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    const destination = path.join(source, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(ROOT, file), destination);
    hash
      .update(file)
      .update('\0')
      .update(await readFile(destination));
  }
  if (subject === 'synchronous-control') {
    const routePath = path.join(source, 'app/api/upscale/route.ts');
    const original = await readFile(routePath, 'utf8');
    const marker = "if (selectedModel.provider === 'replicate') {";
    if (original.split(marker).length !== 2)
      throw new Error('Synchronous negative-control branch is no longer unique');
    const mutation = original.replace(
      marker,
      "if (selectedModel.provider === 'replicate' && Boolean(false)) {"
    );
    await writeFile(routePath, mutation);
    hash.update('\0synchronous-control\0').update(mutation);
  }
  // OpenNext patches traced dependency copies. A symlink here makes esbuild load
  // the unpatched shared Next.js package instead of the standalone copy.
  await cp(await realpath(path.join(ROOT, 'node_modules')), path.join(source, 'node_modules'), {
    recursive: true,
    verbatimSymlinks: true,
    mode: constants.COPYFILE_FICLONE,
    filter: entry => !['.cache', '.vite', '.vite-temp'].includes(path.basename(entry)),
  });
  const binary = (name: string) => path.join(source, 'node_modules/.bin', name);
  const buildLog = path.join(ASYNC_RUNTIME_ARTIFACTS, `${subject}-build.log`);
  console.log(`Building ${subject} OpenNext application; log: ${buildLog}`);
  if (await run(binary('opennextjs-cloudflare'), ['build'], source, buildLog))
    throw new Error(`OpenNext build failed: ${buildLog}`);
  const bundleLog = path.join(ASYNC_RUNTIME_ARTIFACTS, `${subject}-bundle.log`);
  if (
    await run(
      binary('wrangler'),
      ['deploy', '--dry-run', '--config', 'wrangler.json', '--outdir', '.open-next/compiled'],
      source,
      bundleLog
    )
  )
    throw new Error(`Worker bundling failed: ${bundleLog}`);
  const identity: IArtifact = {
    subject,
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim(),
    sourceSha256: hash.digest('hex'),
    bundleSha256: createHash('sha256')
      .update(await readFile(path.join(source, '.open-next/compiled/worker.js')))
      .digest('hex'),
  };
  await writeFile(path.join(buildRoot, 'identity.json'), JSON.stringify(identity, null, 2));
  await writeFile(
    path.join(ASYNC_RUNTIME_ARTIFACTS, `${subject}-identity.json`),
    JSON.stringify(
      {
        ...identity,
        previousArtifactRemoved: previousArtifact,
        builtAt: new Date().toISOString(),
        mutation:
          subject === 'synchronous-control'
            ? "Disable only the async Replicate branch, restoring the existing processor's SDK run() wait"
            : null,
      },
      null,
      2
    )
  );
}

async function main() {
  await mkdir(ASYNC_RUNTIME_ARTIFACTS, { recursive: true });
  if (!argv.includes('--subject=synchronous-control')) await build('candidate');
  if (!argv.includes('--subject=candidate')) await build('synchronous-control');
  if (argv.includes('--build-only')) return;
  const args = [
    path.join(ROOT, 'node_modules/@playwright/test/cli.js'),
    'test',
    'tests/workers/async-upscale.preview.spec.ts',
    '--config=tests/helpers/async-upscale-runtime.ts',
    '--project=workers-preview',
  ];
  for (const [tag, marker] of [
    ['collection-control', 'ASYNC_RUNTIME_COLLECTION_SENTINEL'],
    ['synchronous-control', 'ASYNC_RUNTIME_EARLY_RESPONSE_CONTROL'],
  ]) {
    const log = path.join(ASYNC_RUNTIME_ARTIFACTS, `${tag}.log`);
    const code = await run(execPath, [...args, '--grep', `@${tag}`], ROOT, log);
    if (code === 0 || !(await readFile(log, 'utf8')).includes(marker))
      throw new Error(`Required negative control did not fail its intended assertion: ${log}`);
    console.log(`Observed required ${tag} assertion failure: ${log}`);
  }
  const log = path.join(ASYNC_RUNTIME_ARTIFACTS, 'candidate-runtime.log');
  const code = await run(
    execPath,
    [...args, '--grep-invert', '@(synchronous-control|collection-control)'],
    ROOT,
    log
  );
  console.log(await readFile(log, 'utf8'));
  if (code !== 0) throw new Error(`Built Worker runtime gate failed: ${log}`);
}

if (argv.includes('--run') || argv.includes('--build-only')) {
  await main();
}
