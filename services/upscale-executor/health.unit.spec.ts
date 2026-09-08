import { describe, expect, it, vi } from 'vitest';
import { createExecutorHealthProbe } from './health';
import { createExecutorServer, startExecutorHttpServer } from './index';
import type { IExecutorRpc } from './advance';

const digest = `sha256:${'a'.repeat(64)}`;
const snapshot = { ok: true, mode: 'executor', imageDigest: digest };
describe('executor readiness heartbeat', () => {
  it('records only the configured image from the private executor with an OIDC token', async () => {
    const record = vi.fn(async () => true);
    const transport = vi.fn(async () => Response.json(snapshot));
    await createExecutorHealthProbe({
      targetUrl: 'https://executor.test',
      audience: 'https://executor.test',
      imageDigest: digest,
      record,
      fetch: transport,
      token: async () => 'signed-id-token',
    })();
    expect(record).toHaveBeenCalledWith(digest, true);
    expect(transport.mock.calls[0]).toEqual([
      'https://executor.test/healthz',
      expect.objectContaining({
        headers: { Authorization: 'Bearer signed-id-token' },
        redirect: 'error',
      }),
    ]);
  });
  it.each([
    { ...snapshot, imageDigest: `sha256:${'b'.repeat(64)}` },
    { ...snapshot, mode: 'dispatcher' },
    { ...snapshot, ok: false },
  ])('withholds admission for mismatched or unhealthy executor %j', async payload => {
    const record = vi.fn(async () => true);
    await createExecutorHealthProbe({
      targetUrl: 'https://executor.test',
      audience: 'https://executor.test',
      imageDigest: digest,
      record,
      fetch: async () => Response.json(payload),
      token: async () => 'token',
    })();
    expect(record).toHaveBeenCalledWith(digest, false);
  });
  it('bounds stalled token acquisition and records failure', async () => {
    const record = vi.fn(async () => true);
    await createExecutorHealthProbe({
      targetUrl: 'https://executor.test',
      audience: 'https://executor.test',
      imageDigest: digest,
      record,
      timeoutMs: 20,
      token: () => new Promise(() => {}),
    })();
    expect(record).toHaveBeenCalledWith(digest, false);
  });
  it('requires the health identity before exposing the executor image', async () => {
    const service = createExecutorServer({
      rpc: {} as IExecutorRpc,
      config: { mode: 'executor', imageDigest: digest },
      authorizeHealth: request => request.headers.get('authorization') === 'Bearer fixture',
    });
    expect((await service.handleRequest(new Request('https://executor.test/healthz'))).status).toBe(
      401
    );
    const response = await service.handleRequest(
      new Request('https://executor.test/healthz', { headers: { Authorization: 'Bearer fixture' } })
    );
    expect(await response.json()).toMatchObject(snapshot);
  });
  it('starts a recurring health heartbeat for the dispatcher HTTP process', async () => {
    const refreshHealth = vi.fn(async () => undefined);
    const server = await startExecutorHttpServer({
      rpc: {} as IExecutorRpc,
      refreshHealth,
      config: { mode: 'dispatcher', host: '127.0.0.1', port: 0 },
    });
    try {
      await vi.waitFor(() => expect(refreshHealth).toHaveBeenCalledTimes(1));
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
