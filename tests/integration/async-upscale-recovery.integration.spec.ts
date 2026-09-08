import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  startAsyncUpscaleRuntime,
  type IAsyncUpscaleRuntime,
} from '../helpers/async-upscale-runtime';

const INPUT_BYTES = 128 * 1024;
const INITIAL_SUBSCRIPTION_CREDITS = 10;
const INITIAL_PURCHASED_CREDITS = 5;

interface IJob {
  id: string;
  user: { id: string; accessToken: string };
  body: Record<string, unknown>;
}

interface IReservation {
  user_id: string;
  job_id: string;
  status: string;
  amount: number;
  consumed_subscription: number;
  consumed_purchased: number;
  attempt_id: string;
  provider_phase: string;
  provider_prediction_id: string | null;
  batch_window_start: string;
  next_observation_at: string | null;
  delivery_lease_expires_at: string | null;
  acknowledged_at: string | null;
  failure_code: string | null;
}

test.describe.configure({ mode: 'serial', timeout: 10 * 60_000 });

let runtime: IAsyncUpscaleRuntime;

async function createJob(): Promise<IJob> {
  const user = await runtime.createUser({
    tier: 'pro',
    subscriptionCredits: INITIAL_SUBSCRIPTION_CREDITS,
    purchasedCredits: INITIAL_PURCHASED_CREDITS,
  });
  const id = randomUUID();
  const storagePath = runtime.putInput({
    userId: user.id,
    jobId: id,
    width: 1024,
    height: 1024,
    bytes: INPUT_BYTES,
  });
  return {
    id,
    user,
    body: {
      jobId: id,
      storagePath,
      mimeType: 'image/png',
      config: { qualityTier: 'quick', scale: 2 },
    },
  };
}

async function reservation(jobId: string): Promise<IReservation> {
  const result = await runtime.database.pool.query<IReservation>(
    `SELECT user_id, job_id, status, amount, consumed_subscription, consumed_purchased,
       attempt_id, provider_phase, provider_prediction_id, batch_window_start,
       next_observation_at, delivery_lease_expires_at, acknowledged_at, failure_code
     FROM processing_credit_reservations WHERE job_id = $1`,
    [jobId]
  );
  expect(result.rows).toHaveLength(1);
  return result.rows[0];
}

async function setDue(jobId: string, expired = false): Promise<void> {
  if (expired) {
    // The deadline is immutable in production; this is a disposable-clock
    // control used to reach the 15-minute boundary without waiting 15 minutes.
    await runtime.database.pool.query(
      'ALTER TABLE processing_credit_reservations DISABLE TRIGGER protect_async_upscale_context'
    );
  }
  try {
    await runtime.database.pool.query(
      expired
        ? `UPDATE processing_credit_reservations
           SET attempt_started_at = now() - interval '16 minutes',
               execution_deadline_at = now() - interval '1 minute',
               next_observation_at = now() - interval '1 minute'
           WHERE job_id = $1`
        : `UPDATE processing_credit_reservations
           SET next_observation_at = now() - interval '1 second'
           WHERE job_id = $1`,
      [jobId]
    );
  } finally {
    if (expired)
      await runtime.database.pool.query(
        'ALTER TABLE processing_credit_reservations ENABLE TRIGGER protect_async_upscale_context'
      );
  }
}

async function setDeliveryDue(jobId: string): Promise<void> {
  await runtime.database.pool.query(
    'ALTER TABLE processing_credit_reservations DISABLE TRIGGER protect_async_upscale_context'
  );
  try {
    await runtime.database.pool.query(
      `UPDATE processing_credit_reservations
       SET delivery_deadline_at = now() - interval '1 second',
           output_expires_at = now() - interval '1 second'
       WHERE job_id = $1`,
      [jobId]
    );
  } finally {
    await runtime.database.pool.query(
      'ALTER TABLE processing_credit_reservations ENABLE TRIGGER protect_async_upscale_context'
    );
  }
}

async function profileBalances(
  userId: string
): Promise<{ subscription: number; purchased: number }> {
  const result = await runtime.database.pool.query<{
    subscription_credits_balance: number;
    purchased_credits_balance: number;
  }>(
    `SELECT subscription_credits_balance, purchased_credits_balance
     FROM profiles WHERE id = $1`,
    [userId]
  );
  return {
    subscription: Number(result.rows[0].subscription_credits_balance),
    purchased: Number(result.rows[0].purchased_credits_balance),
  };
}

test.beforeAll(async () => {
  runtime = await startAsyncUpscaleRuntime({
    subject: 'candidate',
    providerDelayMs: 30_000,
    metadataBytes: 5241,
    // Keep the first tab's response open long enough to exercise a real
    // concurrent delivery attempt in the Worker runtime.
    outputBytes: 4 * 1024 * 1024,
  });
});

test.beforeEach(() => {
  // Each assertion owns its provider-call accounting. The runtime is shared
  // because starting a disposable Postgres/Worker pair per test is expensive.
  runtime.calls.length = 0;
  runtime.invocations.length = 0;
});

test.afterAll(async () => {
  await runtime?.close();
});

test('should refund once when an accepted prediction ID is lost', async () => {
  runtime.setProviderDelayMs(30_000);
  const job = await createJob();
  runtime.losePredictionIdentityOnce();

  const admission = await runtime.request(job.user, '/api/upscale', job.body);
  expect(admission.status).toBe(503);
  await admission.text();
  const before = await reservation(job.id);
  expect(before.provider_prediction_id).toBeNull();
  expect(before.provider_phase).toBe('submitting');

  await setDue(job.id, true);
  const cron = await runtime.cron();
  expect(cron.status).toBe(200);
  const cronBody = await cron.json();
  expect(cronBody.asyncReconciliation).toMatchObject({ processedCount: 1, failedCount: 0 });

  const after = await reservation(job.id);
  expect(after.status).toBe('refunded');
  expect(after.failure_code).toBe('PROCESSING_TIMEOUT');
  expect(await profileBalances(job.user.id)).toEqual({
    subscription: INITIAL_SUBSCRIPTION_CREDITS,
    purchased: INITIAL_PURCHASED_CREDITS,
  });
  const refunds = await runtime.database.pool.query(
    `SELECT count(*)::int AS count FROM credit_transactions
     WHERE reference_id = $1 AND type = 'refund'`,
    [`reservation_refund_${job.id}`]
  );
  expect(refunds.rows[0].count).toBe(1);
  expect(runtime.calls.filter(call => call.host === 'api.replicate.com')).toHaveLength(1);
});

test('should recover a known prediction when the browser closes', async () => {
  runtime.setProviderDelayMs(50);
  const job = await createJob();
  const admission = await runtime.request(job.user, '/api/upscale', job.body);
  expect(admission.status).toBe(202);
  await admission.text();
  expect((await reservation(job.id)).provider_prediction_id).toBeTruthy();
  await delay(100);
  await setDue(job.id);

  const cron = await runtime.cron();
  expect(cron.status).toBe(200);
  expect(await cron.json()).toMatchObject({
    success: true,
    asyncReconciliation: { processedCount: 1, failedCount: 0 },
  });
  const status = await runtime.request(job.user, `/api/upscale?jobId=${job.id}`);
  expect(status.status).toBe(200);
  expect(await status.json()).toMatchObject({
    success: true,
    jobId: job.id,
    status: 'ready',
    processing: { reservationJobId: job.id, deliveryToken: expect.any(String) },
  });
  expect((await reservation(job.id)).provider_phase).toBe('succeeded');
});

test('should acknowledge once when a valid stream reaches EOF', async () => {
  runtime.setProviderDelayMs(50);
  const job = await createJob();
  const admission = await runtime.request(job.user, '/api/upscale', job.body);
  expect(admission.status).toBe(202);
  const admissionBody = await admission.json();
  await delay(100);
  await setDue(job.id);
  await (await runtime.cron()).text();
  const status = await runtime.request(job.user, `/api/upscale?jobId=${job.id}`);
  const statusBody = await status.json();
  const capability = {
    reservationJobId: statusBody.processing.reservationJobId,
    deliveryToken: statusBody.processing.deliveryToken,
  };

  const first = await runtime.request(job.user, '/api/upscale/output', capability);
  expect(first.status).toBe(200);
  await expect(first.text()).resolves.toMatch(/PNG/);
  const completed = await reservation(job.id);
  expect(completed.status).toBe('completed');
  expect(completed.acknowledged_at).toBeTruthy();

  const replay = await runtime.request(job.user, '/api/upscale/output', {
    reservationJobId: admissionBody.jobId,
    deliveryToken: capability.deliveryToken,
  });
  expect(replay.status).toBe(200);
  await replay.arrayBuffer();
  expect((await reservation(job.id)).acknowledged_at).toBe(completed.acknowledged_at);
});

test('should prevent refund while a delivery lease is active', async () => {
  runtime.setProviderDelayMs(50);
  const job = await createJob();
  const admission = await runtime.request(job.user, '/api/upscale', job.body);
  expect(admission.status).toBe(202);
  await admission.text();
  await delay(100);
  await setDue(job.id);
  await (await runtime.cron()).text();
  const status = await runtime.request(job.user, `/api/upscale?jobId=${job.id}`);
  const statusBody = await status.json();
  const output = await runtime.request(job.user, '/api/upscale/output', {
    reservationJobId: job.id,
    deliveryToken: statusBody.processing.deliveryToken,
  });
  expect(output.status).toBe(200);
  const reader = output.body!.getReader();
  await reader.read();
  expect((await reservation(job.id)).delivery_lease_expires_at).toBeTruthy();

  await setDeliveryDue(job.id);
  const refundAttempt = await runtime.database.pool.query<{ status: string; refunded: boolean }>(
    `SELECT (public.apply_async_upscale_observation(
       $1, $2, $3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
     )->'reservation'->>'status') AS status,
     public.refund_processing_credit_reservation($1, $2, 'stale_worker_reservation') AS refunded`,
    [job.user.id, job.id, (await reservation(job.id)).attempt_id]
  );
  expect(refundAttempt.rows[0]).toEqual({ status: 'processing', refunded: false });
  await reader.cancel('test interrupted');
});

test('should recover an interrupted download after bounded lease expiry without another charge', async () => {
  runtime.setProviderDelayMs(50);
  const job = await createJob();
  const admission = await runtime.request(job.user, '/api/upscale', job.body);
  expect(admission.status).toBe(202);
  await admission.text();
  await delay(100);
  await setDue(job.id);
  await (await runtime.cron()).text();
  const status = await runtime.request(job.user, `/api/upscale?jobId=${job.id}`);
  const statusBody = await status.json();
  const capability = {
    reservationJobId: job.id,
    deliveryToken: statusBody.processing.deliveryToken,
  };
  const abort = new AbortController();
  const interrupted = await runtime.requestHttp(
    job.user,
    '/api/upscale/output',
    capability,
    abort.signal
  );
  const reader = interrupted.body!.getReader();
  await reader.read();
  const claimed = await reservation(job.id);
  expect(claimed.status).toBe('processing');
  expect(claimed.acknowledged_at).toBeNull();
  expect(claimed.delivery_lease_expires_at).not.toBeNull();
  const leaseRemaining = Date.parse(claimed.delivery_lease_expires_at!) - Date.now();
  expect(leaseRemaining).toBeGreaterThan(0);
  expect(leaseRemaining).toBeLessThanOrEqual(180_000);
  const owner = (
    await runtime.database.pool.query(
      `SELECT delivery_lease_token, delivery_token_hash, output_url, output_mime_type, output_expires_at
     FROM processing_credit_reservations WHERE job_id = $1`,
      [job.id]
    )
  ).rows[0];
  try {
    abort.abort();
  } catch {
    // Miniflare can surface the downstream stream's AbortError from abort().
  }
  // A terminated Worker cannot guarantee its cancel callback runs. Prompt
  // release is an optimization; the durable expiry must permit recovery.
  const abandoned = await reservation(job.id);
  expect(abandoned.status).toBe('processing');
  expect(abandoned.acknowledged_at).toBeNull();
  if (abandoned.delivery_lease_expires_at) {
    // Disposable database clock control only. Do not clear the token/lease:
    // the production claim RPC must recognize and reclaim the expired owner.
    await runtime.database.pool.query(
      `UPDATE processing_credit_reservations
       SET delivery_lease_expires_at = now() - interval '1 second'
       WHERE job_id = $1 AND delivery_lease_expires_at = $2::timestamptz`,
      [job.id, abandoned.delivery_lease_expires_at]
    );
  }

  const retry = await runtime.request(job.user, '/api/upscale/output', capability);
  expect(retry.status).toBe(200);
  const staleOwner = await runtime.database.pool.query(
    `SELECT public.release_async_upscale_delivery($1, $2, $3, $4) AS released,
       public.acknowledge_async_upscale_delivery($1, $2, $3, $4, $5, $6, $7) AS acknowledgement`,
    [
      job.user.id,
      job.id,
      owner.delivery_token_hash,
      owner.delivery_lease_token,
      owner.output_url,
      owner.output_mime_type,
      owner.output_expires_at,
    ]
  );
  expect(staleOwner.rows[0]).toEqual({
    released: false,
    acknowledgement: { outcome: 'lease_expired' },
  });
  const retryBody = Buffer.from(await retry.arrayBuffer());
  expect([retryBody.readUInt32BE(16), retryBody.readUInt32BE(20)]).toEqual([2048, 2048]);
  expect(await reservation(job.id)).toMatchObject({
    status: 'completed',
    acknowledged_at: expect.any(String),
  });
  const ledger = await runtime.database.pool.query(
    `SELECT type, count(*)::int AS count, sum(amount)::int AS amount
     FROM credit_transactions WHERE reference_id IN ($1, $2) GROUP BY type`,
    [job.id, `reservation_refund_${job.id}`]
  );
  expect(ledger.rows).toEqual([{ type: 'usage', count: 1, amount: -1 }]);
  expect(await profileBalances(job.user.id)).toEqual({ subscription: 9, purchased: 5 });
  expect(
    runtime.calls.filter(
      call =>
        call.host === 'api.replicate.com' &&
        call.method === 'POST' &&
        call.path.endsWith('/predictions')
    )
  ).toHaveLength(1);
});

test('should return a typed retryable response when another tab owns the delivery lease', async () => {
  runtime.setProviderDelayMs(50);
  const job = await createJob();
  const admission = await runtime.request(job.user, '/api/upscale', job.body);
  expect(admission.status).toBe(202);
  await admission.text();
  await delay(100);
  await setDue(job.id);
  await (await runtime.cron()).text();
  const status = await runtime.request(job.user, `/api/upscale?jobId=${job.id}`);
  const statusBody = await status.json();
  const capability = {
    reservationJobId: job.id,
    deliveryToken: statusBody.processing.deliveryToken,
  };
  const first = await runtime.request(job.user, '/api/upscale/output', capability);
  expect(first.status).toBe(200);
  expect((await reservation(job.id)).delivery_lease_expires_at).toBeTruthy();
  const firstReader = first.body!.getReader();
  await firstReader.read();
  expect((await reservation(job.id)).delivery_lease_expires_at).toBeTruthy();
  const second = await runtime.request(job.user, '/api/upscale/output', capability);
  expect(second.status).toBe(503);
  expect(second.headers.get('Retry-After')).toBeTruthy();
  await expect(second.json()).resolves.toMatchObject({
    error: { code: 'AI_UNAVAILABLE', details: { outputBusy: true, retryable: true } },
  });
  await firstReader.cancel();
});

test('should refuse output when a refund wins the delivery claim', async () => {
  runtime.setProviderDelayMs(50);
  const job = await createJob();
  const admission = await runtime.request(job.user, '/api/upscale', job.body);
  expect(admission.status).toBe(202);
  await admission.text();
  await delay(100);
  await setDue(job.id);
  await (await runtime.cron()).text();
  const status = await runtime.request(job.user, `/api/upscale?jobId=${job.id}`);
  const statusBody = await status.json();
  await setDeliveryDue(job.id);
  const attempt = await reservation(job.id);
  const expired = await runtime.database.pool.query(
    `SELECT public.apply_async_upscale_observation(
       $1, $2, $3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
     ) AS result`,
    [job.user.id, job.id, attempt.attempt_id]
  );
  expect(expired.rows[0].result.reservation.status).toBe('refunded');
  const output = await runtime.request(job.user, '/api/upscale/output', {
    reservationJobId: job.id,
    deliveryToken: statusBody.processing.deliveryToken,
  });
  expect(output.status).toBe(404);
});

test('should reserve one pool split and batch slot when twenty callers replay a job', async () => {
  runtime.setProviderDelayMs(30_000);
  const job = await createJob();
  const first = await runtime.request(job.user, '/api/upscale', job.body);
  expect(first.status).toBe(202);
  await first.text();

  const replays = await Promise.all(
    Array.from({ length: 20 }, () => runtime.request(job.user, '/api/upscale', job.body))
  );
  for (const replay of replays) {
    expect(replay.status).toBe(202);
    await replay.text();
  }
  const usage = await runtime.database.pool.query(
    `SELECT count(*)::int AS count, coalesce(sum(amount), 0)::int AS amount
     FROM credit_transactions WHERE reference_id = $1 AND type = 'usage'`,
    [job.id]
  );
  expect(usage.rows[0]).toEqual({ count: 1, amount: -1 });
  const batch = await runtime.database.pool.query(
    `SELECT count FROM batch_usage WHERE user_id = $1 AND window_start = date_trunc('hour', now())`,
    [job.user.id]
  );
  expect(Number(batch.rows[0].count)).toBe(1);
  expect(
    runtime.calls.filter(
      call =>
        call.host === 'api.replicate.com' &&
        call.method === 'POST' &&
        /\/predictions$/.test(call.path)
    )
  ).toHaveLength(1);
});

test('should keep a known prediction processing when Tail and stale refunds race', async () => {
  runtime.setProviderDelayMs(30_000);
  const job = await createJob();
  const admission = await runtime.request(job.user, '/api/upscale', job.body);
  expect(admission.status).toBe(202);
  await admission.text();
  await setDue(job.id);
  const [tail, cron] = await Promise.all([
    runtime.database.pool.query(
      `SELECT public.refund_processing_credit_reservation($1, $2, 'tail_observed_exceededMemory') AS refunded`,
      [job.user.id, job.id]
    ),
    runtime.cron(),
  ]);
  expect(tail.rows[0].refunded).toBe(false);
  expect(cron.status).toBe(200);
  const after = await reservation(job.id);
  expect(after.status).toBe('processing');
  expect(after.provider_phase).toBe('processing');
  expect((await profileBalances(job.user.id)).subscription).toBe(INITIAL_SUBSCRIPTION_CREDITS - 1);
});

test('should release only the original batch window when a failure crosses an hour boundary', async () => {
  runtime.setProviderDelayMs(50);
  const job = await createJob();
  const admission = await runtime.request(job.user, '/api/upscale', job.body);
  expect(admission.status).toBe(202);
  await admission.text();
  await delay(100);
  const oldWindow = new Date(Date.now() - 60 * 60 * 1000);
  await runtime.database.pool.query(
    'ALTER TABLE processing_credit_reservations DISABLE TRIGGER protect_async_upscale_context'
  );
  try {
    await runtime.database.pool.query(
      `UPDATE processing_credit_reservations SET batch_window_start = date_trunc('hour', $2::timestamptz)
       WHERE job_id = $1`,
      [job.id, oldWindow.toISOString()]
    );
  } finally {
    await runtime.database.pool.query(
      'ALTER TABLE processing_credit_reservations ENABLE TRIGGER protect_async_upscale_context'
    );
  }
  await runtime.database.pool.query(
    `INSERT INTO batch_usage(user_id, window_start, count)
     VALUES ($1, date_trunc('hour', $2::timestamptz), 4)
     ON CONFLICT (user_id, window_start) DO UPDATE SET count = EXCLUDED.count`,
    [job.user.id, oldWindow.toISOString()]
  );
  await setDue(job.id);
  const row = await reservation(job.id);
  const claim = await runtime.database.pool.query<{ observation_token: string }>(
    `SELECT public.claim_async_upscale_observation($1, $2)->>'observation_token' AS observation_token`,
    [job.user.id, job.id]
  );
  const applied = await runtime.database.pool.query(
    `SELECT public.apply_async_upscale_observation(
       $1, $2, $3, $4::uuid, 'failed', NULL, NULL, NULL, NULL,
       'TIMEOUT', 'fixture failure', 'timeout'
     ) AS result`,
    [job.user.id, job.id, row.attempt_id, claim.rows[0].observation_token]
  );
  expect(applied.rows[0].result.reservation.status).toBe('refunded');
  const oldBatch = await runtime.database.pool.query(
    `SELECT count FROM batch_usage WHERE user_id = $1 AND window_start = date_trunc('hour', $2::timestamptz)`,
    [job.user.id, oldWindow.toISOString()]
  );
  expect(Number(oldBatch.rows[0].count)).toBe(3);
  const currentBatch = await runtime.database.pool.query(
    `SELECT count FROM batch_usage WHERE user_id = $1 AND window_start = date_trunc('hour', now())`,
    [job.user.id]
  );
  expect(Number(currentBatch.rows[0].count)).toBe(1);

  const late = await runtime.database.pool.query(
    `SELECT public.apply_async_upscale_observation(
       $1, $2, $3, NULL, 'succeeded', 'https://replicate.delivery/late.png',
       'image/png', now(), now() + interval '1 hour', NULL, NULL, NULL
     )->'reservation'->>'status' AS status`,
    [job.user.id, job.id, row.attempt_id]
  );
  expect(late.rows[0].status).toBe('refunded');
});
