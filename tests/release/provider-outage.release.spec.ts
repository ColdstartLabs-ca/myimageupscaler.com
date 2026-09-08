import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  startAsyncUpscaleRuntime,
  type IAsyncUpscaleRuntime,
} from '../helpers/async-upscale-runtime';

let runtime: IAsyncUpscaleRuntime;
test.beforeAll(async () => {
  runtime = await startAsyncUpscaleRuntime({
    subject: 'candidate',
    providerDelayMs: 50,
    outputBytes: 128 * 1024,
  });
});
test.afterAll(async () => {
  await runtime?.close();
});

test('pauses on the first billing failure, refunds once, and recovers after funding returns', async () => {
  const user = await runtime.createUser({
    tier: 'pro',
    subscriptionCredits: 10,
    purchasedCredits: 5,
  });
  const body = () => {
    const jobId = randomUUID();
    return {
      jobId,
      storagePath: runtime.putInput({
        userId: user.id,
        jobId,
        width: 450,
        height: 389,
        bytes: 128 * 1024,
      }),
      mimeType: 'image/png',
      config: { qualityTier: 'quick', scale: 2 },
    };
  };
  const failedJob = body();
  runtime.rejectNextCreateOnce(402);
  const failed = await runtime.request(user, '/api/upscale', failedJob);
  expect(failed.status).toBe(503);
  expect(await failed.json()).toMatchObject({
    jobId: failedJob.jobId,
    status: 'refunded',
    creditsRefunded: true,
  });
  const circuit = await runtime.database.pool.query(
    "SELECT available, circuit_status FROM get_provider_circuit_availability('image-processing')"
  );
  expect(circuit.rows[0]).toEqual({ available: false, circuit_status: 'open' });
  const blocked = await runtime.request(user, '/api/upscale', body());
  expect(blocked.status).toBe(503);
  await blocked.text();
  expect(
    runtime.calls.filter(call => call.host === 'api.replicate.com' && call.method === 'POST')
  ).toHaveLength(1);
  const replay = await runtime.request(user, '/api/upscale', failedJob);
  expect((await replay.json()).status).toBe('refunded');
  const balances = await runtime.database.pool.query(
    'SELECT subscription_credits_balance, purchased_credits_balance FROM profiles WHERE id=$1',
    [user.id]
  );
  expect(balances.rows[0]).toEqual({
    subscription_credits_balance: 10,
    purchased_credits_balance: 5,
  });
  const refunds = await runtime.database.pool.query(
    "SELECT count(*)::int AS count FROM credit_transactions WHERE reference_id=$1 AND type='refund'",
    [`reservation_refund_${failedJob.jobId}`]
  );
  expect(refunds.rows[0].count).toBe(1);

  // Disposable clock control only: the real circuit functions must recover;
  // no forced 'closed' state and no manual production reset.
  await runtime.database.pool.query(
    "UPDATE provider_health_state SET opened_until=now()-interval '1 second' WHERE provider='image-processing'"
  );
  const recoveredJob = body();
  const admitted = await runtime.request(user, '/api/upscale', recoveredJob);
  expect(admitted.status).toBe(202);
  await admitted.text();
  let ready: { status: string; processing?: { deliveryToken: string } } | undefined;
  await expect
    .poll(
      async () => {
        const response = await runtime.request(user, `/api/upscale?jobId=${recoveredJob.jobId}`);
        ready = await response.json();
        return ready?.status;
      },
      { timeout: 20_000, intervals: [100, 1000, 5000] }
    )
    .toBe('ready');
  const output = await runtime.request(user, '/api/upscale/output', {
    reservationJobId: recoveredJob.jobId,
    deliveryToken: ready!.processing!.deliveryToken,
  });
  expect(output.status).toBe(200);
  expect((await output.arrayBuffer()).byteLength).toBeGreaterThan(0);
  const healthy = await runtime.database.pool.query(
    "SELECT status, consecutive_failures, half_open_since FROM provider_health_state WHERE provider='image-processing'"
  );
  expect(healthy.rows[0]).toEqual({
    status: 'closed',
    consecutive_failures: 0,
    half_open_since: null,
  });
});
