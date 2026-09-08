import { OAuth2Client } from 'google-auth-library';
import {
  createSupabaseExecutorRpc,
  createStorageInputResolver,
  createStorageOutputStorage,
  createCloudTasksPublisher,
  startExecutorHttpServer,
} from '../index';
import { createStreamingOutputStager, type IExecutorRpc } from '../advance';
import { createOidcAuthorizer } from '../oidc';
import { ReplicateAdapter } from '../replicate-adapter';
import { createPostgresDatabase } from './postgres-database';
import { transportFetch, CALLBACK_SECRET, TASK_AUDIENCE, TASK_EMAIL } from './http-fixture';

const [connectionString, origin, publicKeyEncoded, mode, checkpoint] = process.argv.slice(2);
if (!connectionString || !origin || !publicKeyEncoded)
  throw new Error('Executor fixture arguments missing');
const database = createPostgresDatabase(connectionString, origin);
const rpc = createSupabaseExecutorRpc(database);
const stopAt = async (point: string): Promise<void> => {
  if (checkpoint !== point) return;
  process.send?.({ checkpoint: point });
  await new Promise<void>(() => {
    /* Parent kills the process at the committed boundary. */
  });
};
for (const [method, point] of [
  ['getExecution', 'admission_commit'],
  ['createAttempt', 'attempt_persisted'],
  ['bindPrediction', 'prediction_bound'],
  ['markReady', 'output_staged'],
  ['settleFailure', 'settlement_committed'],
  ['acknowledgeOutbox', 'task_published'],
] as const) {
  const original = rpc[method].bind(rpc);
  (rpc as unknown as Record<string, unknown>)[method] = async (...args: unknown[]) => {
    // Publication crash is before acknowledgement, after the real Tasks HTTP acceptance.
    if (point === 'task_published') await stopAt(point);
    const result = await (original as (...values: unknown[]) => Promise<unknown>)(...args);
    if (point !== 'task_published') await stopAt(point);
    return result;
  };
}
const localTransport = transportFetch(origin);
const transport: typeof fetch = async (input, init) => {
  const response = await localTransport(input, init);
  if (init?.method === 'POST' && String(input).endsWith('/predictions') && response.ok)
    await stopAt('provider_accepted');
  return response;
};
const provider = new ReplicateAdapter({
  token: 'test-provider-key',
  callbackBaseUrl: 'https://callback.test/webhooks/replicate',
  webhookSecret: CALLBACK_SECRET,
  fetch: transport,
});
const verifier = new OAuth2Client();
const authorize = createOidcAuthorizer({
  audience: TASK_AUDIENCE,
  serviceAccountEmail: TASK_EMAIL,
  verify: async (jwt, audience) =>
    (
      await verifier.verifySignedJwtWithCertsAsync(
        jwt,
        { fixture: Buffer.from(publicKeyEncoded, 'base64').toString() },
        audience,
        ['https://accounts.google.com', 'accounts.google.com']
      )
    ).getPayload(),
});
const server = await startExecutorHttpServer({
  rpc: rpc as IExecutorRpc,
  provider,
  inputResolver: createStorageInputResolver(database.storage),
  outputStager: createStreamingOutputStager({
    storage: createStorageOutputStorage(database.storage),
    fetch: transport,
  }),
  taskPublisher: createCloudTasksPublisher({
    queueName: 'projects/test/locations/local/queues/upscale',
    targetUrl: TASK_AUDIENCE,
    audience: TASK_AUDIENCE,
    serviceAccountEmail: TASK_EMAIL,
    accessToken: 'test-access',
    fetch: transport,
  }),
  authorizeTask: authorize,
  authorizeDispatch: authorize,
  verifyReplicateCallback: input => provider.verifyWebhook(input),
  config: {
    host: '127.0.0.1',
    port: 0,
    mode: mode === 'callbacks' ? 'callbacks' : mode === 'dispatcher' ? 'dispatcher' : 'executor',
  },
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Executor did not bind');
process.send?.({ ready: `http://127.0.0.1:${address.port}` });
process.once('SIGTERM', () => {
  server.closeAllConnections();
  server.close(() => {
    void database.close().finally(() => {
      process.exitCode = 0;
    });
  });
});
