import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { Client } from 'pg';
import { createUpscaleUser, startUpscalePostgres, type IUpscalePostgres } from './upscale-postgres';

const JWT_SECRET = 'local-upscale-fixture-only-secret-never-used-outside-tests';
const POSTGREST_IMAGE = 'postgrest/postgrest:v12.2.12';
export const UPSCALE_TEST_SUPABASE_ORIGIN = 'https://upscale-test.supabase.co';

interface IStoredObject {
  bytes: Buffer;
  mimeType: string;
  chunkBytes?: number;
  delayMs?: number;
}

export interface IUpscaleTestUser {
  id: string;
  email: string;
  accessToken: string;
  session: Record<string, unknown>;
}

export interface IUpscaleTestBackend {
  url: string;
  publicOrigin: string;
  anonKey: string;
  serviceRoleKey: string;
  db: Client;
  postgres: IUpscalePostgres;
  createUser(credits?: number): Promise<IUpscaleTestUser>;
  putObject(
    path: string,
    bytes: Buffer,
    mimeType?: string,
    options?: Pick<IStoredObject, 'chunkBytes' | 'delayMs'>
  ): void;
  stageReady(
    jobId: string,
    bytes: Buffer,
    dimensions?: { width: number; height: number }
  ): Promise<string>;
  refund(jobId: string): Promise<void>;
  close(): Promise<void>;
}

function token(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'supabase',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
      ...claims,
    })
  ).toString('base64url');
  return `${header}.${payload}.${createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url')}`;
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
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

async function availablePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  return port;
}

/**
 * Local PostgreSQL + actual PostgREST transport. Only Auth and private object
 * storage are fixtures; application routes and all ledger RPCs remain real.
 * The public HTTPS origin is mapped to `url` by the test transport, preserving
 * the application's production URL-validation rules.
 */
export async function startUpscaleTestBackend(): Promise<IUpscaleTestBackend> {
  const postgres = await startUpscalePostgres({ executorReady: true });
  const db = postgres.db;
  const restContainer = `miu-upscale-rest-${randomUUID()}`;
  const objects = new Map<string, IStoredObject>();
  const capabilities = new Map<string, { path: string; write: boolean }>();
  const users = new Map<string, IUpscaleTestUser>();
  const anonKey = token({ role: 'anon' });
  const serviceRoleKey = token({ role: 'service_role' });
  let restUrl = '';
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers))
        if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      headers.delete('host');
      headers.delete('connection');
      const auth = headers.get('authorization')?.replace(/^Bearer /i, '');
      const user = auth
        ? [...users.values()].find(candidate => candidate.accessToken === auth)
        : undefined;
      const body =
        request.method === 'GET' || request.method === 'HEAD' ? undefined : await readBody(request);
      const json = () => JSON.parse(body?.toString() || '{}') as Record<string, unknown>;
      let result: Response;
      if (request.method === 'OPTIONS') {
        result = new Response(null, { status: 204 });
      } else if (url.pathname === '/health') {
        result = Response.json({ ready: true });
      } else if (url.pathname.startsWith('/rest/v1/')) {
        result = await fetch(`${restUrl}${url.pathname.slice('/rest/v1'.length)}${url.search}`, {
          method: request.method,
          headers,
          body,
        });
        if (!result.ok)
          console.error(
            '[upscale fixture database]',
            url.pathname,
            result.status,
            await result.clone().text()
          );
      } else if (url.pathname === '/auth/v1/user' && user) {
        result = Response.json(user.session.user);
      } else if (url.pathname === '/auth/v1/logout') {
        result = new Response(null, { status: 204 });
      } else if (url.pathname === '/auth/v1/token') {
        const refreshToken = json().refresh_token;
        const matching = [...users.values()].find(
          candidate => candidate.session.refresh_token === refreshToken
        );
        result = matching
          ? Response.json(matching.session)
          : Response.json({ error: 'invalid refresh token' }, { status: 401 });
      } else if (url.pathname.startsWith('/storage/v1/object/upload/sign/upscale-inputs/')) {
        const path = decodeURIComponent(
          url.pathname.slice('/storage/v1/object/upload/sign/upscale-inputs/'.length)
        );
        if (request.method === 'POST' && auth === serviceRoleKey) {
          const capability = randomBytes(24).toString('hex');
          capabilities.set(capability, { path, write: true });
          result = Response.json({
            url: `/object/upload/sign/upscale-inputs/${path}?token=${capability}`,
            token: capability,
          });
        } else {
          const capability = capabilities.get(url.searchParams.get('token') ?? '');
          if (!capability?.write || capability.path !== path)
            result = Response.json({ message: 'Invalid upload capability' }, { status: 403 });
          else if (objects.has(path))
            result = Response.json(
              { statusCode: '409', message: 'The resource already exists', error: 'Duplicate' },
              { status: 409 }
            );
          else {
            const form = await new Response(body, { headers }).formData();
            const file = form.get('');
            if (!(file instanceof Blob)) throw new Error('Storage upload did not include a file');
            objects.set(path, {
              bytes: Buffer.from(await file.arrayBuffer()),
              mimeType: file.type,
            });
            result = Response.json({ Key: `upscale-inputs/${path}` });
          }
        }
      } else if (
        url.pathname === '/storage/v1/object/list/upscale-inputs' &&
        auth === serviceRoleKey
      ) {
        const { prefix = '', search = '' } = json();
        result = Response.json(
          [...objects]
            .filter(
              ([path]) =>
                path.startsWith(`${prefix}/`) && path.split('/').at(-1)?.includes(String(search))
            )
            .map(([path, object]) => ({
              name: path.slice(String(prefix).length + 1),
              id: path,
              metadata: { size: object.bytes.length, mimetype: object.mimeType },
            }))
        );
      } else if (url.pathname.startsWith('/storage/v1/object/sign/upscale-inputs/')) {
        const path = decodeURIComponent(
          url.pathname.slice('/storage/v1/object/sign/upscale-inputs/'.length)
        );
        if (request.method === 'POST' && auth === serviceRoleKey) {
          const capability = randomBytes(24).toString('hex');
          capabilities.set(capability, { path, write: false });
          result = Response.json({
            signedURL: `/object/sign/upscale-inputs/${path}?token=${capability}`,
          });
        } else {
          const capability = capabilities.get(url.searchParams.get('token') ?? '');
          const object = objects.get(path);
          if (!capability || capability.write || capability.path !== path || !object)
            result = new Response(null, { status: 404 });
          else {
            const range = /^bytes=(\d+)-(\d+)$/.exec(headers.get('range') ?? '');
            const start = range ? Number(range[1]) : 0;
            const end = range
              ? Math.min(object.bytes.length - 1, Number(range[2]))
              : object.bytes.length - 1;
            const bytes = object.bytes.subarray(start, end + 1);
            const outputHeaders = new Headers({
              'Content-Type': object.mimeType,
              'Content-Length': String(bytes.length),
            });
            if (range)
              outputHeaders.set('Content-Range', `bytes ${start}-${end}/${object.bytes.length}`);
            let offset = 0;
            let cancelled = false;
            result = new Response(
              new ReadableStream<Uint8Array>({
                async pull(controller) {
                  if (object.delayMs)
                    await new Promise(resolve => setTimeout(resolve, object.delayMs));
                  if (cancelled) return;
                  if (offset >= bytes.length) {
                    controller.close();
                    return;
                  }
                  const next = bytes.subarray(offset, offset + (object.chunkBytes ?? 64 * 1024));
                  offset += next.length;
                  controller.enqueue(next);
                },
                cancel() {
                  cancelled = true;
                },
              }),
              { status: range ? 206 : 200, headers: outputHeaders }
            );
          }
        }
      } else if (
        url.pathname === '/storage/v1/object/upscale-inputs' &&
        request.method === 'DELETE' &&
        auth === serviceRoleKey
      ) {
        for (const path of (json().prefixes as string[]) ?? []) objects.delete(path);
        result = Response.json([]);
      } else {
        result = Response.json(
          { error: `Unimplemented fixture transport: ${request.method} ${url.pathname}` },
          { status: 404 }
        );
      }
      result = new Response(result.body, { status: result.status, headers: result.headers });
      result.headers.set('Access-Control-Allow-Origin', '*');
      result.headers.set('Access-Control-Allow-Headers', '*');
      result.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      await forward(result, response);
    } catch (error) {
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          message: error instanceof Error ? error.message : 'Fixture transport failed',
        })
      );
    }
  });
  const close = async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    spawnSync('docker', ['rm', '-f', '-v', restContainer], { stdio: 'ignore', timeout: 30_000 });
    await postgres.stop();
  };
  try {
    await db.query(`
      -- The bare Postgres image has the pre-PostgREST-12 auth shim; GoTrue
      -- normally upgrades this during startup. Match modern JWT claim storage.
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL STABLE AS $fn$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.sub', true), ''),
          NULLIF(current_setting('request.jwt.claims', true), '')::JSONB->>'sub')::UUID;
      $fn$;
      ALTER TABLE public.profiles
        ADD COLUMN email TEXT NOT NULL DEFAULT 'browser-fixture@test.local',
        ADD COLUMN role TEXT NOT NULL DEFAULT 'user',
        ADD COLUMN subscription_status TEXT DEFAULT 'active',
        ADD COLUMN subscription_tier TEXT DEFAULT 'pro',
        ADD COLUMN is_flagged_freeloader BOOLEAN DEFAULT FALSE,
        ADD COLUMN region_tier TEXT DEFAULT 'standard',
        ADD COLUMN signup_country TEXT DEFAULT 'US';
      CREATE TABLE public.free_credit_grants (user_id UUID PRIMARY KEY, granted_credits INTEGER NOT NULL DEFAULT 0);
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.free_credit_grants TO service_role;
      CREATE FUNCTION public.get_user_data(target_user_id UUID) RETURNS JSONB
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
      BEGIN
        IF auth.uid() IS DISTINCT FROM target_user_id THEN RAISE EXCEPTION 'Access denied'; END IF;
        RETURN (SELECT jsonb_build_object('profile', to_jsonb(p), 'subscription', NULL) FROM public.profiles p WHERE p.id=target_user_id);
      END; $fn$;
      REVOKE ALL ON FUNCTION public.get_user_data(UUID) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.get_user_data(UUID) TO authenticated, service_role;
    `);
    const restPort = await availablePort();
    restUrl = `http://127.0.0.1:${restPort}`;
    execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--name',
        restContainer,
        '--network',
        'host',
        '-e',
        `PGRST_DB_URI=${postgres.connectionString}`,
        '-e',
        'PGRST_DB_SCHEMAS=public',
        '-e',
        'PGRST_DB_ANON_ROLE=anon',
        '-e',
        `PGRST_JWT_SECRET=${JWT_SECRET}`,
        '-e',
        'PGRST_SERVER_HOST=127.0.0.1',
        '-e',
        `PGRST_SERVER_PORT=${restPort}`,
        POSTGREST_IMAGE,
      ],
      { stdio: 'pipe', timeout: 60_000 }
    );
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        const response = await fetch(`${restUrl}/profiles?select=id&limit=0`, {
          headers: { Authorization: `Bearer ${serviceRoleKey}` },
        });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        /* container readiness */
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) {
      const logs = spawnSync('docker', ['logs', '--tail', '20', restContainer], {
        encoding: 'utf8',
      });
      throw new Error(`Local PostgREST unavailable: ${logs.stderr || logs.stdout}`);
    }
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    return {
      url,
      publicOrigin: UPSCALE_TEST_SUPABASE_ORIGIN,
      anonKey,
      serviceRoleKey,
      db,
      postgres,
      async createUser(credits = 20) {
        const id = await createUpscaleUser(db, credits, 0);
        const email = `upscale-${id}@test.local`;
        await db.query('UPDATE public.profiles SET email=$2 WHERE id=$1', [id, email]);
        await db.query(
          'INSERT INTO public.free_credit_grants (user_id, granted_credits) VALUES ($1,$2)',
          [id, credits]
        );
        const accessToken = token({ sub: id, role: 'authenticated', aud: 'authenticated', email });
        const user: IUpscaleTestUser = {
          id,
          email,
          accessToken,
          session: {
            access_token: accessToken,
            refresh_token: randomBytes(32).toString('hex'),
            token_type: 'bearer',
            expires_in: 86400,
            expires_at: Math.floor(Date.now() / 1000) + 86400,
            user: {
              id,
              email,
              aud: 'authenticated',
              role: 'authenticated',
              created_at: new Date().toISOString(),
              app_metadata: { provider: 'email', providers: ['email'] },
              user_metadata: {},
            },
          },
        };
        users.set(id, user);
        return user;
      },
      putObject(path, bytes, mimeType = 'image/png', options = {}) {
        objects.set(path, { bytes, mimeType, ...options });
      },
      async stageReady(jobId, bytes, dimensions) {
        const {
          rows: [job],
        } = await db.query('SELECT * FROM public.upscale_executions WHERE job_id=$1', [jobId]);
        if (!job) throw new Error('No admitted job to stage');
        const {
          rows: [attempt],
        } = await db.query('SELECT * FROM public.create_upscale_attempt($1,$2,$3,$4,$5)', [
          jobId,
          job.provider,
          job.resolved_model_id,
          job.model_version,
          randomBytes(32).toString('hex'),
        ]);
        await db.query('SELECT public.bind_upscale_prediction($1,$2,$3)', [
          jobId,
          attempt.attempt_id,
          `fixture-${attempt.attempt_id}`,
        ]);
        await db.query('SELECT public.mark_upscale_provider_terminal($1,$2,$3,$4,$5)', [
          jobId,
          attempt.attempt_id,
          'succeeded',
          'https://replicate.delivery/fixture.png',
          'image/png',
        ]);
        const path = `${job.user_id}/outputs/${jobId}/${attempt.attempt_id}.png`;
        objects.set(path, { bytes, mimeType: 'image/png' });
        const {
          rows: [result],
        } = await db.query('SELECT public.mark_upscale_ready($1,$2,$3,$4,$5,$6,$7,$8) AS ready', [
          jobId,
          path,
          'image/png',
          bytes.length,
          new Date(Date.now() + 86400_000).toISOString(),
          'a'.repeat(64),
          dimensions?.width ?? job.input_width * job.scale,
          dimensions?.height ?? job.input_height * job.scale,
        ]);
        if (!result.ready) throw new Error('Real ledger rejected fixture output staging');
        return path;
      },
      async refund(jobId) {
        const {
          rows: [result],
        } = await db.query(
          "SELECT public.settle_upscale_execution_failure($1,'fixture_provider_failure',false) AS refunded",
          [jobId]
        );
        if (!result.refunded) throw new Error('Real ledger did not refund fixture job');
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
