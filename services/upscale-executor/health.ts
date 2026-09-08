import { GoogleAuth } from 'google-auth-library';

export interface IExecutorHealthProbeOptions {
  targetUrl?: string;
  audience?: string;
  imageDigest?: string;
  record: (imageDigest: string, healthy: boolean) => Promise<boolean>;
  fetch?: typeof fetch;
  token?: () => Promise<string>;
  timeoutMs?: number;
}

/** Scheduler heartbeat checks the private worker, including its immutable image. */
export function createExecutorHealthProbe(
  options: IExecutorHealthProbeOptions
): () => Promise<void> {
  const auth = new GoogleAuth();
  const timeoutMs = Math.min(5000, Math.max(1, options.timeoutMs ?? 5000));
  return async () => {
    if (!options.imageDigest || !/^sha256:[a-f0-9]{64}$/.test(options.imageDigest)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let healthy = false;
    try {
      healthy = await Promise.race([
        (async () => {
          if (!options.targetUrl || !options.audience) return false;
          const target = new URL('/healthz', options.targetUrl);
          if (target.protocol !== 'https:') return false;
          const token = options.token
            ? await options.token()
            : await (
                await auth.getIdTokenClient(options.audience)
              ).idTokenProvider.fetchIdToken(options.audience);
          const response = await (options.fetch ?? fetch)(target.toString(), {
            headers: { Authorization: `Bearer ${token}` },
            redirect: 'error',
            signal: controller.signal,
          });
          if (!response.ok || !response.body) {
            await response.body?.cancel();
            return false;
          }
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let size = 0;
          try {
            for (;;) {
              const chunk = await reader.read();
              if (chunk.done) break;
              size += chunk.value.byteLength;
              if (size > 2048) return false;
              chunks.push(chunk.value);
            }
          } finally {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
          }
          const data = JSON.parse(Buffer.concat(chunks).toString());
          return (
            data.ok === true && data.mode === 'executor' && data.imageDigest === options.imageDigest
          );
        })(),
        new Promise<boolean>(resolve => {
          timer = setTimeout(() => {
            controller.abort();
            resolve(false);
          }, timeoutMs);
        }),
      ]);
    } catch {
      healthy = false;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
    if (!(await options.record(options.imageDigest, healthy)))
      throw new Error('Executor heartbeat was not recorded');
  };
}
