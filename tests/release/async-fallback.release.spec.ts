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
test.beforeEach(() => {
  runtime.calls.length = 0;
});

test('recovers a definitive GPU failure with one alternate prediction and one debit', async () => {
  const user = await runtime.createUser({
    tier: 'pro',
    subscriptionCredits: 10,
    purchasedCredits: 5,
  });
  const jobId = randomUUID();
  const storagePath = runtime.putInput({
    userId: user.id,
    jobId,
    width: 450,
    height: 389,
    bytes: 128 * 1024,
  });
  runtime.failNextPredictionOnce('CUDA out of memory. Tried to allocate 256 MiB.');
  const admission = await runtime.request(user, '/api/upscale', {
    jobId,
    storagePath,
    mimeType: 'image/png',
    config: { qualityTier: 'quick', scale: 2 },
  });
  expect(admission.status).toBe(202);
  await admission.text();
  let state:
    | { status: string; processing?: { deliveryToken: string; modelUsed: string } }
    | undefined;
  await expect
    .poll(
      async () => {
        // Concurrent tabs must never submit a second copy of the recovery attempt.
        const responses = await Promise.all(
          Array.from({ length: 4 }, () => runtime.request(user, `/api/upscale?jobId=${jobId}`))
        );
        const states = await Promise.all(responses.map(response => response.json()));
        state = states.find(value => value.status === 'ready') ?? states[0];
        return state?.status;
      },
      { timeout: 20_000, intervals: [100, 1000, 5000] }
    )
    .toBe('ready');
  expect(state!.processing!.modelUsed).toBe('real-esrgan-large');
  const creates = runtime.calls.filter(
    call =>
      call.host === 'api.replicate.com' &&
      call.method === 'POST' &&
      call.path.endsWith('/predictions')
  );
  expect(creates.map(call => call.model)).toEqual([
    'f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa',
    'd0ee3d708c9b911f122a4ad90046c5d26a0293b99476d697f6bb7f2e251ce2d4',
  ]);
  const output = await runtime.request(user, '/api/upscale/output', {
    reservationJobId: jobId,
    deliveryToken: state!.processing!.deliveryToken,
  });
  expect(output.status).toBe(200);
  const bytes = Buffer.from(await output.arrayBuffer());
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([900, 778]);
  const ledger = await runtime.database.pool.query(
    "SELECT count(*)::int AS count, sum(amount)::int AS amount FROM credit_transactions WHERE reference_id=$1 AND type='usage'",
    [jobId]
  );
  expect(ledger.rows[0]).toEqual({ count: 1, amount: -1 });
  const reservation = await runtime.database.pool.query(
    'SELECT status, recovery_count, attempt_history FROM processing_credit_reservations WHERE job_id=$1',
    [jobId]
  );
  expect(reservation.rows[0]).toMatchObject({
    status: 'completed',
    recovery_count: 1,
    attempt_history: [expect.objectContaining({ model: 'real-esrgan', failure: 'gpu_contention' })],
  });
});

for (const failure of ['alternate-failed', 'identity-lost'] as const) {
  test(`${failure}: never creates a third prediction and refunds exactly once`, async () => {
    const user = await runtime.createUser({
      tier: 'pro',
      subscriptionCredits: 10,
      purchasedCredits: 5,
    });
    const jobId = randomUUID();
    const storagePath = runtime.putInput({
      userId: user.id,
      jobId,
      width: 450,
      height: 389,
      bytes: 128 * 1024,
    });
    runtime.failNextPredictionOnce('CUDA out of memory');
    const admitted = await runtime.request(user, '/api/upscale', {
      jobId,
      storagePath,
      mimeType: 'image/png',
      config: { qualityTier: 'quick', scale: 2 },
    });
    expect(admitted.status).toBe(202);
    await admitted.text();
    await expect
      .poll(
        async () => {
          await (await runtime.request(user, `/api/upscale?jobId=${jobId}`)).text();
          const row = await runtime.database.pool.query(
            'SELECT recovery_state FROM processing_credit_reservations WHERE job_id=$1',
            [jobId]
          );
          return row.rows[0].recovery_state;
        },
        { timeout: 20_000, intervals: [100, 1000, 5000] }
      )
      .toBe('queued');
    if (failure === 'identity-lost') runtime.losePredictionIdentityOnce();
    else runtime.failNextPredictionOnce('CUDA out of memory');
    await (await runtime.request(user, `/api/upscale?jobId=${jobId}`)).text();
    if (failure === 'identity-lost') {
      for (let i = 0; i < 3; i++)
        await (await runtime.request(user, `/api/upscale?jobId=${jobId}`)).text();
      const pending = await runtime.database.pool.query(
        'SELECT status, provider_prediction_id, recovery_state FROM processing_credit_reservations WHERE job_id=$1',
        [jobId]
      );
      expect(pending.rows[0]).toEqual({
        status: 'processing',
        provider_prediction_id: null,
        recovery_state: 'submitting',
      });
      // Disposable database clock control; production deadlines remain immutable.
      await runtime.database.pool.query(
        'ALTER TABLE processing_credit_reservations DISABLE TRIGGER protect_async_upscale_context'
      );
      try {
        await runtime.database.pool.query(
          "UPDATE processing_credit_reservations SET attempt_started_at=now()-interval '16 minutes', execution_deadline_at=now()-interval '1 minute', next_observation_at=now()-interval '1 minute' WHERE job_id=$1",
          [jobId]
        );
      } finally {
        await runtime.database.pool.query(
          'ALTER TABLE processing_credit_reservations ENABLE TRIGGER protect_async_upscale_context'
        );
      }
    }
    await expect
      .poll(
        async () => {
          const response = await runtime.request(user, `/api/upscale?jobId=${jobId}`);
          return (await response.json()).status;
        },
        { timeout: 20_000, intervals: [100, 1000, 5000] }
      )
      .toBe('refunded');
    await (await runtime.request(user, `/api/upscale?jobId=${jobId}`)).text();
    expect(
      runtime.calls.filter(
        call =>
          call.host === 'api.replicate.com' &&
          call.method === 'POST' &&
          call.path.endsWith('/predictions')
      )
    ).toHaveLength(2);
    const refunds = await runtime.database.pool.query(
      "SELECT count(*)::int AS count, sum(amount)::int AS amount FROM credit_transactions WHERE reference_id=$1 AND type='refund'",
      [`reservation_refund_${jobId}`]
    );
    expect(refunds.rows[0]).toEqual({ count: 1, amount: 1 });
    const balance = await runtime.database.pool.query(
      'SELECT subscription_credits_balance, purchased_credits_balance FROM profiles WHERE id=$1',
      [user.id]
    );
    expect(balance.rows[0]).toEqual({
      subscription_credits_balance: 10,
      purchased_credits_balance: 5,
    });
  });
}
