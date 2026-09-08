import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { build, type Plugin } from 'esbuild';
import { startUpscaleTestBackend, type IUpscaleTestBackend } from './upscale-test-backend';

export interface IUpscaleBrowserHarness {
  url: string;
  backend: IUpscaleTestBackend;
  requests: Array<{ path: string; method: string; status: number; jobId?: string }>;
  close(): Promise<void>;
}

function fixtureEnvironment(backend: IUpscaleTestBackend, browser: boolean): Plugin {
  const values: Record<string, string> = {
    ENV: 'test',
    NEXT_PUBLIC_ENV: 'test',
    NODE_ENV: 'test',
    PLAYWRIGHT_TEST: 'true',
    NEXT_PUBLIC_SUPABASE_URL: backend.publicOrigin,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: backend.anonKey,
    NEXT_PUBLIC_BASE_URL: 'http://localhost:3477',
    SUPABASE_SERVICE_ROLE_KEY: browser ? '' : backend.serviceRoleKey,
    UPSCALE_DURABLE_EXECUTION_ENABLED: 'true',
    UPSCALE_DURABLE_COHORT_PERCENT: '100',
    UPSCALE_EXECUTOR_BASE_URL: 'https://executor.upscale-fixture.invalid',
    UPSCALE_EXECUTOR_SHARED_SECRET: 'fixture-executor-secret-not-used-remotely',
    UPSCALE_BUILD_ID: 'browser-fixture',
    REPLICATE_API_TOKEN: 'fixture-provider-token',
  };
  return {
    name: 'isolated-upscale-environment',
    setup(context) {
      context.onLoad({ filter: /[/\\]shared[/\\]config[/\\]env\.ts$/ }, ({ path: file }) => ({
        // Apply compile-time environment values through the actual validated
        // env module; no developer/production credentials enter either bundle.
        contents: readFileSync(file, 'utf8').replace(
          /process\.env\.([A-Z0-9_]+)/g,
          (_match, key: string) => JSON.stringify(values[key]) ?? 'undefined'
        ),
        loader: 'ts',
      }));
    },
  };
}

export async function startUpscaleBrowserHarness(
  options: {
    port?: number;
    backend?: IUpscaleTestBackend;
    buildBrowser?: boolean;
  } = {}
): Promise<IUpscaleBrowserHarness> {
  const backend = options.backend ?? (await startUpscaleTestBackend());
  const root = path.resolve('.');
  const directory = await mkdtemp(path.join(tmpdir(), 'miu-upscale-browser-'));
  const requests: IUpscaleBrowserHarness['requests'] = [];
  let worker: Worker | undefined;
  const close = async () => {
    if (worker) await worker.terminate();
    await rm(directory, { recursive: true, force: true });
    if (!options.backend) await backend.close();
  };
  try {
    await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
    if (options.buildBrowser !== false) {
      await build({
        absWorkingDir: root,
        entryPoints: ['tests/helpers/upscale-browser-entry.tsx'],
        outfile: path.join(directory, 'workspace.js'),
        bundle: true,
        format: 'iife',
        platform: 'browser',
        jsx: 'automatic',
        define: { 'process.env': '{"NODE_ENV":"development"}', 'process.browser': 'true' },
        external: ['@imgly/background-removal'],
        plugins: [fixtureEnvironment(backend, true)],
      });
      execFileSync(
        'node',
        [
          'node_modules/tailwindcss/lib/cli.js',
          '-i',
          'client/styles/index.css',
          '-c',
          'tailwind.config.js',
          '-o',
          path.join(directory, 'workspace.css'),
          '--minify',
        ],
        { cwd: root, stdio: 'pipe', timeout: 60_000 }
      );
    }
    const serverFile = path.join(directory, 'server.cjs');
    await build({
      absWorkingDir: root,
      stdin: {
        sourcefile: 'upscale-browser-server.ts',
        resolveDir: root,
        contents: `
        import { createServer } from 'node:http';
        import { Readable } from 'node:stream';
        import { readFile } from 'node:fs/promises';
        import path from 'node:path';
        import { parentPort, workerData } from 'node:worker_threads';
        import { NextRequest } from 'next/server';
        import { POST as admit } from './app/api/upscale/route';
        import { GET as status } from './app/api/upscale/jobs/route';
        import { POST as output } from './app/api/upscale/output/route';
        import { POST as upload } from './app/api/upscale/upload/route';
        import { POST as observeFailure } from './app/api/upscale/failure-observation/route';
        const nativeFetch = globalThis.fetch.bind(globalThis);
        globalThis.fetch = async (input, init) => {
          const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
          if (url.origin === workerData.publicOrigin) {
            return nativeFetch(workerData.backendUrl + url.pathname + url.search, init);
          }
          if (url.origin === 'https://executor.upscale-fixture.invalid') return new Response(null, { status: 202 });
          if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return nativeFetch(input, init);
          throw new Error('Unexpected external request in isolated browser fixture: ' + url.host + url.pathname);
        };
        const routes = { '/api/upscale': admit, '/api/upscale/jobs': status, '/api/upscale/output': output, '/api/upscale/upload': upload, '/api/upscale/failure-observation': observeFailure };
        const server = createServer(async (req, res) => {
          const pathname = new URL(req.url, 'http://localhost').pathname;
          try {
            if (pathname === '/dashboard' || pathname === '/') {
              res.writeHead(200, {'Content-Type':'text/html'});
              res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Upscale recovery workspace</title><link rel="stylesheet" href="/workspace.css"></head><body class="bg-base text-foreground"><div id="root"></div><script src="/workspace.js"></script></body></html>');
              return;
            }
            if (pathname === '/workspace.js' || pathname === '/workspace.css') {
              res.writeHead(200, {'Content-Type': pathname.endsWith('.js') ? 'application/javascript' : 'text/css'});
              res.end(await readFile(path.join(workerData.directory, pathname.slice(1)))); return;
            }
            if (!routes[pathname]) {
              const filename = path.resolve(workerData.root, 'public', '.' + pathname);
              if (filename.startsWith(path.join(workerData.root, 'public') + path.sep)) {
                try { res.end(await readFile(filename)); return; } catch {}
              }
              res.writeHead(404, {'Content-Type':'application/json'}); res.end('{}'); return;
            }
            const headers = new Headers();
            for (const [name,value] of Object.entries(req.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
            headers.delete('x-user-id');
            const auth = await nativeFetch(workerData.backendUrl + '/auth/v1/user', { headers: {Authorization: headers.get('authorization') ?? ''} });
            if (auth.ok) headers.set('x-user-id', (await auth.json()).id);
            headers.set('CF-IPCountry','US');
            const chunks = []; for await (const chunk of req) chunks.push(chunk);
            const body = chunks.length ? Buffer.concat(chunks) : undefined;
            const controller = new AbortController();
            res.on('close', () => { if (!res.writableFinished) controller.abort(); });
            const request = new NextRequest('http://localhost:' + server.address().port + req.url, { method:req.method, headers, body, signal:controller.signal });
            const response = await routes[pathname](request);
            const metadata = body ? JSON.parse(body.toString()) : undefined;
            const jobId = metadata?.jobId ?? metadata?.reservationJobId ?? new URL(req.url,'http://localhost').searchParams.get('jobId');
            parentPort.postMessage({type:'request',path:pathname,method:req.method,status:response.status,jobId});
            res.writeHead(response.status,Object.fromEntries(response.headers));
            if (!response.body) { res.end(); return; }
            const stream = Readable.fromWeb(response.body);
            stream.on('error', () => res.destroy());
            res.on('close', () => stream.destroy());
            stream.pipe(res);
          } catch (error) {
            parentPort.postMessage({ type:'error', message:error.message, path:pathname });
            if (!res.headersSent) res.writeHead(500, {'Content-Type':'application/json'});
            res.end(JSON.stringify({error:error.message}));
          }
        });
        server.listen(workerData.port, '127.0.0.1', () => parentPort.postMessage({type:'ready',port:server.address().port}));
      `,
      },
      outfile: serverFile,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      packages: 'external',
      sourcemap: 'inline',
      plugins: [fixtureEnvironment(backend, false)],
    });
    const port = await new Promise<number>((resolve, reject) => {
      worker = new Worker(serverFile, {
        execArgv: ['--enable-source-maps'],
        workerData: {
          backendUrl: backend.url,
          publicOrigin: backend.publicOrigin,
          root,
          directory,
          port: options.port ?? 0,
        },
      });
      worker.on('error', reject);
      worker.on('message', message => {
        if (message.type === 'ready') resolve(message.port);
        else if (message.type === 'request') requests.push(message);
        else if (message.type === 'error')
          console.error('[upscale browser route]', message.path, message.message);
      });
    });
    return { url: `http://127.0.0.1:${port}`, backend, requests, close };
  } catch (error) {
    await close();
    throw error;
  }
}
