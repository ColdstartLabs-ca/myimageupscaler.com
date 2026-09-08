import { createServer, type Server } from 'node:http';
import { createHash, createHmac, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ModelRegistry } from '@server/services/model-registry';

export const TASK_AUDIENCE = 'https://executor.test';
export const TASK_EMAIL = 'tasks@test.iam.gserviceaccount.com';
export const CALLBACK_SECRET = `whsec_${Buffer.from('executor-local-signature-key').toString('base64')}`;
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
export const OIDC_PUBLIC_KEY = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
export function taskToken(changes: Record<string, unknown> = {}): string {
  const seconds = Math.floor(Date.now() / 1000);
  const data = `${Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fixture' })).toString('base64url')}.${Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: TASK_AUDIENCE, email: TASK_EMAIL, email_verified: true, sub: '123', iat: seconds, exp: seconds + 300, ...changes })).toString('base64url')}`;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), keys.privateKey).toString('base64url')}`;
}
export function callbackHeaders(body: string): Record<string, string> {
  const id = randomUUID();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', Buffer.from(CALLBACK_SECRET.slice(6), 'base64'))
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  return {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature': `v1,${signature}`,
  };
}
export const transportFetch =
  (origin: string): typeof fetch =>
  async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (
      ![
        'api.replicate.com',
        'replicate.delivery',
        'storage.test',
        'cloudtasks.googleapis.com',
      ].includes(url.hostname)
    )
      throw new Error('Unexpected executor outbound host');
    return fetch(`${origin}${url.pathname}${url.search}`, init);
  };
export interface IFixturePrediction {
  id: string;
  model: string;
  version?: string;
  input: unknown;
  webhook: string;
  status: string;
  output?: string;
  completed_at?: string;
}
export interface IHttpFixture {
  origin: string;
  predictions: Map<string, IFixturePrediction>;
  tasks: Map<string, Record<string, unknown>>;
  creates: number;
  uploads: number;
  cancels: number;
  dropNextCreate: boolean;
  failTaskPublish: boolean;
  outputBytes: Buffer;
  finish(id: string): void;
  close(): Promise<void>;
}
export async function startHttpFixture(): Promise<IHttpFixture> {
  const directory = await mkdtemp(join(tmpdir(), 'upscale-http-'));
  const outputBytes = await readFile('tests/fixtures/sample.jpg');
  const metadata = new Map<
    string,
    { name: string; metadata: { size: number; mimetype: string; hash: string } }
  >();
  let server: Server;
  const fixture: IHttpFixture = {
    origin: '',
    creates: 0,
    uploads: 0,
    cancels: 0,
    dropNextCreate: false,
    failTaskPublish: false,
    predictions: new Map(),
    tasks: new Map(),
    outputBytes,
    finish(id) {
      const prediction = fixture.predictions.get(id);
      if (!prediction) throw new Error('Prediction missing');
      prediction.status = 'succeeded';
      prediction.output = `https://replicate.delivery/results/${id}.jpg`;
      prediction.completed_at = new Date().toISOString();
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    },
  };
  server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const json = (body: unknown, status = 200) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    try {
      if (url.pathname.startsWith('/objects/')) {
        const key = decodeURIComponent(url.pathname.slice(9));
        const file = join(directory, createHash('sha256').update(key).digest('hex'));
        if (request.method === 'PUT') {
          if (metadata.has(key)) {
            request.resume();
            return json({}, 409);
          }
          await pipeline(request, createWriteStream(file, { flags: 'wx' }));
          const information = await stat(file);
          const hash = createHash('sha256');
          for await (const chunk of createReadStream(file)) hash.update(chunk);
          metadata.set(key, {
            name: key.split('/').at(-1)!,
            metadata: {
              size: information.size,
              mimetype: String(request.headers['content-type']),
              hash: hash.digest('hex'),
            },
          });
          fixture.uploads += 1;
          return json({});
        }
        if (key.endsWith('/input.png')) {
          response.writeHead(200, {
            'content-type': 'image/jpeg',
            'content-length': outputBytes.length,
          });
          response.end(outputBytes);
          return;
        }
        const record = metadata.get(key);
        if (!record) return json({}, 404);
        response.writeHead(200, {
          'content-type': record.metadata.mimetype,
          'content-length': record.metadata.size,
        });
        await pipeline(createReadStream(file), response);
        return;
      }
      if (url.pathname.startsWith('/metadata/')) {
        const item = metadata.get(decodeURIComponent(url.pathname.slice(10)));
        return json(item ?? {}, item ? 200 : 404);
      }
      if (url.pathname.startsWith('/results/')) {
        response.writeHead(200, {
          'content-type': 'image/jpeg',
          'content-length': outputBytes.length,
        });
        response.end(outputBytes);
        return;
      }
      if (url.pathname === '/v1/predictions' && request.method === 'GET')
        return json({ results: [...fixture.predictions.values()], next: null });
      const predictionRoute = /^\/v1\/predictions\/([^/]+)(\/cancel)?$/.exec(url.pathname);
      if (predictionRoute) {
        const prediction = fixture.predictions.get(predictionRoute[1]);
        if (!prediction) return json({}, 404);
        if (predictionRoute[2]) {
          fixture.cancels += 1;
          prediction.status = 'canceled';
        }
        return json(prediction);
      }
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of request) {
        total += chunk.length;
        if (total > 1024 * 1024) throw new Error('Fixture metadata body too large');
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (url.pathname.endsWith('/tasks')) {
        if (fixture.failTaskPublish) return json({}, 503);
        if (!body.task?.name || !body.task?.httpRequest?.oidcToken) return json({}, 400);
        if (fixture.tasks.has(body.task.name)) return json({}, 409);
        fixture.tasks.set(body.task.name, body.task);
        return json(body.task);
      }
      if (request.method === 'POST' && url.pathname.endsWith('/predictions')) {
        fixture.creates += 1;
        const registry = ModelRegistry.getInstance();
        const model =
          url.pathname.match(/^\/v1\/models\/(.+)\/predictions$/)?.[1] ??
          [...registry.getEnabledModels(), registry.getModel('real-esrgan-large')!]
            .find(item => item.modelVersion?.endsWith(body.version))
            ?.modelVersion?.split(':')[0] ??
          '';
        const prediction: IFixturePrediction = {
          id: randomUUID(),
          model,
          version: body.version,
          input: body.input,
          webhook: body.webhook,
          status: 'starting',
        };
        fixture.predictions.set(prediction.id, prediction);
        if (fixture.dropNextCreate) {
          fixture.dropNextCreate = false;
          response.destroy();
          return;
        }
        return json(prediction, 201);
      }
      json({}, 404);
    } catch (error) {
      if (!response.headersSent)
        json({ error: error instanceof Error ? error.message : 'fixture failed' }, 500);
      else response.destroy();
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture did not listen');
  fixture.origin = `http://127.0.0.1:${address.port}`;
  return fixture;
}
