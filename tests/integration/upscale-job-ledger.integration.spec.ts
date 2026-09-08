import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import {
  admitUpscale,
  createUpscaleUser,
  startUpscalePostgres,
  type IUpscalePostgres,
} from '../helpers/upscale-postgres';

let database: IUpscalePostgres;
let db: Client;
const token = 'a'.repeat(64);

test.beforeAll(async () => {
  test.setTimeout(180_000);
  database = await startUpscalePostgres({ executorReady: true });
  db = database.db;
});
test.afterAll(async () => {
  await database?.stop();
});

async function account(userId: string) {
  return (
    await db.query(
      `SELECT subscription_credits_balance AS subscription,
    purchased_credits_balance AS purchased FROM public.profiles WHERE id=$1`,
      [userId]
    )
  ).rows[0];
}

async function execution(jobId: string) {
  return (
    await db.query(
      `SELECT e.*, r.status AS reservation_status
    FROM public.upscale_executions e JOIN public.processing_credit_reservations r USING (job_id)
    WHERE e.job_id=$1`,
      [jobId]
    )
  ).rows[0];
}

async function stage(userId: string, jobId: string) {
  const attempt = (
    await db.query(
      `SELECT * FROM public.create_upscale_attempt(
    $1, 'replicate', 'resolved-model', 'v1', $2)`,
      [jobId, randomUUID()]
    )
  ).rows[0];
  expect(attempt).toBeDefined();
  await db.query(`SELECT public.bind_upscale_prediction($1,$2,$3,'processing',now())`, [
    jobId,
    attempt.attempt_id,
    randomUUID(),
  ]);
  expect(
    (
      await db.query(
        `SELECT public.mark_upscale_provider_terminal(
    $1,$2,'succeeded','https://replicate.delivery/output.png','image/png',now()+interval '1 hour',NULL) AS ok`,
        [jobId, attempt.attempt_id]
      )
    ).rows[0].ok
  ).toBe(true);
  return {
    attemptId: attempt.attempt_id as string,
    path: `${userId}/outputs/${jobId}/${attempt.attempt_id}.png`,
  };
}

async function ready(userId: string, jobId: string) {
  const output = await stage(userId, jobId);
  expect(
    (
      await db.query(
        `SELECT public.mark_upscale_ready(
    $1,$2,'image/png',2048,now()+interval '24 hours',$3,1024,1024) AS ok`,
        [jobId, output.path, token]
      )
    ).rows[0].ok
  ).toBe(true);
  return output;
}

test('collection sentinel: migrated ledger uses real PostgreSQL, RLS, fixed function paths and service-only grants', async () => {
  expect((await db.query('SHOW server_version')).rows[0].server_version).toMatch(/^17\./);
  const tables = await db.query(`SELECT relname, relrowsecurity FROM pg_class
    WHERE oid=ANY(ARRAY['public.upscale_executions'::regclass,'public.upscale_attempts'::regclass,
      'public.upscale_outbox'::regclass])`);
  expect(tables.rows).toHaveLength(3);
  expect(tables.rows.every(row => row.relrowsecurity)).toBe(true);
  const functions = await db.query(`SELECT p.oid::regprocedure::text AS signature, p.proconfig,
    has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
    has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.proname LIKE '%upscale%' OR p.proname='refund_v2_processing_credit_reservation')`);
  expect(functions.rows.length).toBeGreaterThan(20);
  for (const row of functions.rows) {
    expect(row, row.signature).toMatchObject({ anon: false, authenticated: false });
    expect(row.proconfig, row.signature).toContain('search_path=public, pg_temp');
  }
  const outsider = await database.connect();
  await outsider.query('SET ROLE authenticated');
  await expect(
    outsider.query('INSERT INTO public.upscale_outbox(job_id,action,generation) VALUES ($1,$2,0)', [
      randomUUID(),
      'advance',
    ])
  ).rejects.toThrow(/permission denied/);
  await outsider.end();
});

test('twenty simultaneous same-job callers get one debit and nineteen recoverable replays', async () => {
  const clients = await Promise.all(Array.from({ length: 20 }, () => database.connect()));
  try {
    for (let round = 0; round < 5; round += 1) {
      const userId = await createUpscaleUser(db, 2, 8);
      const jobId = randomUUID();
      const results = await Promise.all(
        clients.map(async client => {
          await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 20)));
          return admitUpscale(client, userId, jobId, { amount: 5, batchLimit: 1 });
        })
      );
      expect(results.filter(row => row.result_code === 'admitted')).toHaveLength(1);
      expect(results.filter(row => row.result_code === 'replay')).toHaveLength(19);
      expect(await account(userId)).toEqual({ subscription: 0, purchased: 5 });
      expect(
        (
          await db.query(
            `SELECT count(*)::int AS n FROM public.credit_transactions
        WHERE user_id=$1 AND type='usage'`,
            [userId]
          )
        ).rows[0].n
      ).toBe(1);
      expect(
        (await db.query('SELECT count FROM public.batch_usage WHERE user_id=$1', [userId])).rows[0]
          .count
      ).toBe(1);
      expect(
        (
          await db.query('SELECT count(*)::int AS n FROM public.upscale_outbox WHERE job_id=$1', [
            jobId,
          ])
        ).rows[0].n
      ).toBe(1);
    }
  } finally {
    await Promise.all(clients.map(client => client.end()));
  }
});

test('an in-flight admission locks the job before any concurrent debit', async () => {
  const userId = await createUpscaleUser(db);
  const jobId = randomUUID();
  const first = await database.connect();
  const second = await database.connect();
  try {
    await first.query('BEGIN');
    await admitUpscale(first, userId, jobId);
    const pid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const pending = admitUpscale(second, userId, jobId);
    await expect
      .poll(
        async () =>
          (await db.query('SELECT cardinality(pg_blocking_pids($1)) AS n', [pid])).rows[0].n
      )
      .toBeGreaterThan(0);
    await first.query('COMMIT');
    expect((await pending).result_code).toBe('replay');
    expect(await account(userId)).toEqual({ subscription: 7, purchased: 0 });
  } finally {
    await first.query('ROLLBACK');
    await Promise.all([first.end(), second.end()]);
  }
});

test('a failure after the debit rolls back reservation, outbox, batch and projection together', async () => {
  const userId = await createUpscaleUser(db);
  const jobId = randomUUID();
  await db.query(`CREATE FUNCTION public.fail_upscale_projection() RETURNS TRIGGER LANGUAGE plpgsql AS $f$
    BEGIN RAISE EXCEPTION 'injected post-debit failure'; END; $f$;
    CREATE TRIGGER fail_upscale_projection BEFORE INSERT ON public.processing_jobs
    FOR EACH ROW EXECUTE FUNCTION public.fail_upscale_projection()`);
  try {
    await expect(admitUpscale(db, userId, jobId)).rejects.toThrow(/injected post-debit failure/);
  } finally {
    await db.query('DROP TRIGGER fail_upscale_projection ON public.processing_jobs');
  }
  expect(await account(userId)).toEqual({ subscription: 10, purchased: 0 });
  const counts = await db.query(
    `SELECT
    (SELECT count(*)::int FROM public.upscale_executions WHERE job_id=$1) AS executions,
    (SELECT count(*)::int FROM public.processing_credit_reservations WHERE job_id=$1) AS reservations,
    (SELECT count(*)::int FROM public.upscale_outbox WHERE job_id=$1) AS outbox,
    (SELECT count(*)::int FROM public.credit_transactions WHERE user_id=$2) AS transactions,
    (SELECT count(*)::int FROM public.batch_usage WHERE user_id=$2) AS batch`,
    [jobId, userId]
  );
  expect(counts.rows[0]).toEqual({
    executions: 0,
    reservations: 0,
    outbox: 0,
    transactions: 0,
    batch: 0,
  });
});

test('legacy refunds and output RPCs cannot bypass durable reservation and delivery state', async () => {
  const userId = await createUpscaleUser(db, 2, 8);
  const jobId = randomUUID();
  await admitUpscale(db, userId, jobId, { amount: 5 });
  expect(
    (
      await db.query(`SELECT * FROM public.refund_consumed_credits($1,5,$2,2,3,'legacy failure')`, [
        userId,
        jobId,
      ])
    ).rows[0].success
  ).toBe(false);
  expect(
    (
      await db.query(`SELECT public.refund_processing_credit_reservation($1,$2,'tail') AS ok`, [
        userId,
        jobId,
      ])
    ).rows[0].ok
  ).toBe(false);
  expect(
    (
      await db.query(
        `SELECT public.record_processing_credit_reservation_output(
    $1,$2,'https://replicate.delivery/bypass.png','image/png',NULL,$3) AS ok`,
        [userId, jobId, token]
      )
    ).rows[0].ok
  ).toBe(false);
  expect(
    (
      await db.query(
        `SELECT public.acknowledge_processing_credit_reservation(
    $1,$2,'https://replicate.delivery/bypass.png','image/png',NULL,$3) AS ok`,
        [userId, jobId, token]
      )
    ).rows[0].ok
  ).toBe(false);
  expect(
    (
      await db.query(
        `SELECT * FROM public.retrieve_processing_credit_reservation_output($1,$2,$3)`,
        [userId, jobId, token]
      )
    ).rows
  ).toHaveLength(0);
  expect(await account(userId)).toEqual({ subscription: 0, purchased: 5 });
  expect(await execution(jobId)).toMatchObject({
    stage: 'queued',
    reservation_status: 'processing',
  });
  expect(
    (
      await db.query(
        `SELECT to_regprocedure('public.complete_processing_credit_reservation(uuid,uuid,text,text,timestamptz)') AS old`
      )
    ).rows[0].old
  ).toBeNull();
});

test('legacy v1 refunds still restore the recorded pools once even across both refund APIs', async () => {
  const userId = await createUpscaleUser(db, 2, 8);
  const jobId = randomUUID();
  await db.query('SELECT * FROM public.consume_credits_v3($1,5,$2,NULL)', [userId, jobId]);
  expect(
    (
      await db.query(`SELECT * FROM public.refund_consumed_credits($1,99,$2,99,0,'legacy')`, [
        userId,
        jobId,
      ])
    ).rows[0].success
  ).toBe(true);
  await db.query(`SELECT public.refund_processing_credit_reservation($1,$2,'retry')`, [
    userId,
    jobId,
  ]);
  expect(await account(userId)).toEqual({ subscription: 2, purchased: 8 });
  expect(
    (
      await db.query(
        `SELECT count(*)::int AS n FROM public.credit_transactions WHERE user_id=$1 AND type='refund'`,
        [userId]
      )
    ).rows[0].n
  ).toBe(1);
});

test('only one of twenty task deliveries may create a prediction; interrupted submission becomes unknown', async () => {
  const userId = await createUpscaleUser(db);
  const jobId = randomUUID();
  await admitUpscale(db, userId, jobId);
  const clients = await Promise.all(Array.from({ length: 20 }, () => database.connect()));
  try {
    const attempts = await Promise.all(
      clients.map(client =>
        client.query(
          `SELECT * FROM public.create_upscale_attempt(
      $1,'replicate','resolved-model','v1',$2)`,
          [jobId, randomUUID()]
        )
      )
    );
    expect(attempts.filter(result => result.rows[0]?.may_create)).toHaveLength(1);
    expect(new Set(attempts.map(result => result.rows[0]?.attempt_id)).size).toBe(1);
    expect(await execution(jobId)).toMatchObject({
      stage: 'submitting',
      reservation_status: 'processing',
    });
    await db.query(
      `UPDATE public.upscale_executions SET submission_deadline_at=now()-interval '1 second' WHERE job_id=$1`,
      [jobId]
    );
    await db.query('SELECT public.reconcile_upscale_deadlines(100)');
    expect(await execution(jobId)).toMatchObject({
      stage: 'submission_unknown',
      reservation_status: 'processing',
    });
    const again = await db.query(
      `SELECT * FROM public.create_upscale_attempt($1,'replicate','resolved-model','v1',$2)`,
      [jobId, randomUUID()]
    );
    expect(again.rows[0].may_create).toBe(false);
    expect(await account(userId)).toEqual({ subscription: 7, purchased: 0 });
  } finally {
    await Promise.all(clients.map(client => client.end()));
  }
});

test('a final Auto plan can only lower the charge and restores the original pools atomically', async () => {
  const userId = await createUpscaleUser(db, 2, 8);
  const jobId = randomUUID();
  await admitUpscale(db, userId, jobId, { amount: 5, provider: 'deferred', qualityTier: 'auto' });
  expect(
    (
      await db.query(
        `SELECT public.resolve_upscale_execution_plan($1,'resolved-model','replicate','v1',6) AS ok`,
        [jobId]
      )
    ).rows[0].ok
  ).toBe(false);
  expect(await account(userId)).toEqual({ subscription: 0, purchased: 5 });
  for (let i = 0; i < 3; i += 1) {
    expect(
      (
        await db.query(
          `SELECT public.resolve_upscale_execution_plan($1,'resolved-model','replicate','v1',2) AS ok`,
          [jobId]
        )
      ).rows[0].ok
    ).toBe(true);
  }
  expect(await account(userId)).toEqual({ subscription: 0, purchased: 8 });
  expect(await execution(jobId)).toMatchObject({ provider: 'replicate', credits_reserved: 2 });
  await db.query(`SELECT public.settle_upscale_execution_failure($1,'failed',false)`, [jobId]);
  expect(await account(userId)).toEqual({ subscription: 2, purchased: 8 });
});

test('provider completion releases its original batch window and preserves output dimensions and projection identity', async () => {
  const userId = await createUpscaleUser(db);
  const jobId = randomUUID();
  await admitUpscale(db, userId, jobId);
  await db.query(
    `UPDATE public.upscale_executions SET created_at=now()-interval '1 hour' WHERE job_id=$1`,
    [jobId]
  );
  await db.query(
    `UPDATE public.batch_usage SET window_start=date_trunc('hour',now())-interval '1 hour' WHERE user_id=$1`,
    [userId]
  );
  await db.query(
    `INSERT INTO public.batch_usage(user_id,window_start,count) VALUES ($1,date_trunc('hour',now()),3)`,
    [userId]
  );
  const output = await ready(userId, jobId);
  const windows = (
    await db.query('SELECT count FROM public.batch_usage WHERE user_id=$1 ORDER BY window_start', [
      userId,
    ])
  ).rows;
  expect(windows.map(row => row.count)).toEqual([0, 3]);
  expect(await execution(jobId)).toMatchObject({
    output_width: 1024,
    output_height: 1024,
    batch_slot_released: true,
  });
  await db.query('SELECT * FROM public.acquire_upscale_delivery_lease($1,$2,$3)', [
    userId,
    jobId,
    token,
  ]);
  await db.query(`SELECT public.acknowledge_upscale_execution($1,$2,$3,'image/png',$4)`, [
    userId,
    jobId,
    output.path,
    token,
  ]);
  const projected = await db.query(
    `SELECT id,status,model_id,credits_charged FROM public.processing_jobs WHERE user_id=$1`,
    [userId]
  );
  expect(projected.rows).toEqual([
    { id: jobId, status: 'completed', model_id: 'resolved-model', credits_charged: 3 },
  ]);
});

test('a slow stream retains its lease across output expiry and repeated capability rotation', async () => {
  const userId = await createUpscaleUser(db);
  const jobId = randomUUID();
  await admitUpscale(db, userId, jobId);
  const output = await ready(userId, jobId);
  expect(
    (
      await db.query('SELECT * FROM public.acquire_upscale_delivery_lease($1,$2,$3)', [
        userId,
        jobId,
        token,
      ])
    ).rows
  ).toHaveLength(1);
  expect(
    (
      await db.query('SELECT * FROM public.acquire_upscale_delivery_lease($1,$2,$3)', [
        userId,
        jobId,
        token,
      ])
    ).rows
  ).toHaveLength(0);
  for (let i = 1; i <= 8; i += 1)
    await db.query('SELECT * FROM public.issue_upscale_delivery_capability($1,$2,$3)', [
      userId,
      jobId,
      i.toString(16).repeat(64),
    ]);
  await db.query(
    `UPDATE public.upscale_executions SET output_expires_at=now()-interval '1 second' WHERE job_id=$1`,
    [jobId]
  );
  expect(
    (
      await db.query('SELECT public.renew_upscale_delivery_lease($1,$2,$3) AS ok', [
        userId,
        jobId,
        token,
      ])
    ).rows[0].ok
  ).toBe(true);
  expect(
    (
      await db.query(
        `SELECT public.refund_v2_processing_credit_reservation($1,$2,'bypass') AS ok`,
        [userId, jobId]
      )
    ).rows[0].ok
  ).toBe(false);
  await db.query('SELECT public.reconcile_upscale_deadlines(100)');
  expect(await execution(jobId)).toMatchObject({
    stage: 'ready',
    reservation_status: 'processing',
  });
  expect(
    (
      await db.query(`SELECT public.acknowledge_upscale_execution($1,$2,$3,'image/png',$4) AS ok`, [
        userId,
        jobId,
        output.path,
        token,
      ])
    ).rows[0].ok
  ).toBe(true);
  expect(await execution(jobId)).toMatchObject({
    stage: 'completed',
    reservation_status: 'completed',
  });
});

test('completion and refund races conserve both pools over randomized schedules', async () => {
  for (let round = 0; round < 20; round += 1) {
    const userId = await createUpscaleUser(db, 2, 8);
    const jobId = randomUUID();
    await admitUpscale(db, userId, jobId, { amount: 5 });
    const output = await stage(userId, jobId);
    const contender = await database.connect();
    const finish = async () => {
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 15)));
      const staged = (
        await db.query(
          `SELECT public.mark_upscale_ready($1,$2,'image/png',2048,now()+interval '1 hour',$3,1024,1024) AS ok`,
          [jobId, output.path, token]
        )
      ).rows[0].ok;
      if (!staged) return false;
      await db.query('SELECT * FROM public.acquire_upscale_delivery_lease($1,$2,$3)', [
        userId,
        jobId,
        token,
      ]);
      return (
        await db.query(
          `SELECT public.acknowledge_upscale_execution($1,$2,$3,'image/png',$4) AS ok`,
          [userId, jobId, output.path, token]
        )
      ).rows[0].ok;
    };
    const fail = async () => {
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 15)));
      return (
        await contender.query(
          `SELECT public.settle_upscale_execution_failure($1,'race',false) AS ok`,
          [jobId]
        )
      ).rows[0].ok;
    };
    try {
      const outcomes = await Promise.all([finish(), fail()]);
      expect(outcomes.filter(Boolean)).toHaveLength(1);
      const current = await execution(jobId);
      expect(current.stage).toBe(outcomes[0] ? 'completed' : 'failed');
      expect(current.reservation_status).toBe(outcomes[0] ? 'completed' : 'refunded');
      expect(await account(userId)).toEqual(
        outcomes[0] ? { subscription: 0, purchased: 5 } : { subscription: 2, purchased: 8 }
      );
    } finally {
      await contender.end();
    }
  }
});

test('legacy stale cleanup excludes active durable work and Tail recovery creates a due action without refunding', async () => {
  const userId = await createUpscaleUser(db);
  const jobId = randomUUID();
  await admitUpscale(db, userId, jobId);
  await db.query(
    `UPDATE public.processing_credit_reservations SET created_at=now()-interval '1 day' WHERE job_id=$1`,
    [jobId]
  );
  await db.query(`SELECT * FROM public.reconcile_stale_credit_reservations(now(),500)`);
  expect(
    (await db.query('SELECT public.request_upscale_recovery($1) AS ok', [jobId])).rows[0].ok
  ).toBe(true);
  expect(await execution(jobId)).toMatchObject({
    stage: 'queued',
    reservation_status: 'processing',
  });
  expect(await account(userId)).toEqual({ subscription: 7, purchased: 0 });
});

test('published task loss gets a new generation and a stale dispatcher cannot clear another claim', async () => {
  const userId = await createUpscaleUser(db);
  const jobId = randomUUID();
  await admitUpscale(db, userId, jobId);
  await db.query('DELETE FROM public.upscale_outbox WHERE job_id<>$1', [jobId]);
  const first = (await db.query(`SELECT * FROM public.claim_upscale_outbox(1000,'first',120)`))
    .rows[0];
  expect(
    (
      await db.query(`SELECT public.retry_upscale_outbox($1,'stale',now(),'wrong') AS ok`, [
        first.id,
      ])
    ).rows[0].ok
  ).toBe(false);
  expect(
    (await db.query(`SELECT public.ack_upscale_outbox($1,'first') AS ok`, [first.id])).rows[0].ok
  ).toBe(true);
  await db.query(
    `UPDATE public.upscale_executions SET next_action_at=now()-interval '3 minutes' WHERE job_id=$1`,
    [jobId]
  );
  await db.query('SELECT public.reconcile_upscale_deadlines(100)');
  const recovered = (await db.query(`SELECT * FROM public.claim_upscale_outbox(50,'recovery',120)`))
    .rows;
  expect(recovered).toHaveLength(1);
  expect(Number(recovered[0].generation)).toBeGreaterThan(Number(first.generation));
});

test('wake replay protection survives competing instances and expires bounded claims', async () => {
  const signature = 'f'.repeat(64);
  const connections = await Promise.all(Array.from({ length: 20 }, () => database.connect()));
  try {
    const claims = await Promise.all(
      connections.map(client =>
        client.query(`SELECT public.claim_upscale_wake($1,now()+interval '2 minutes') AS ok`, [
          signature,
        ])
      )
    );
    expect(claims.filter(result => result.rows[0].ok)).toHaveLength(1);
    expect(
      (
        await db.query(`SELECT public.claim_upscale_wake($1,now()-interval '1 second') AS ok`, [
          'e'.repeat(64),
        ])
      ).rows[0].ok
    ).toBe(false);
  } finally {
    await Promise.all(connections.map(client => client.end()));
  }
});

test('deadline RPCs cannot expire a live job before its customer deadline', async () => {
  const userId = await createUpscaleUser(db);
  const jobId = randomUUID();
  await admitUpscale(db, userId, jobId);
  expect(
    (
      await db.query(`SELECT public.settle_upscale_execution_failure($1,'premature',true) AS ok`, [
        jobId,
      ])
    ).rows[0].ok
  ).toBe(false);
  expect(await execution(jobId)).toMatchObject({
    stage: 'queued',
    reservation_status: 'processing',
  });
  await db.query(
    `UPDATE public.upscale_executions SET deadline_at=now()-interval '1 second' WHERE job_id=$1`,
    [jobId]
  );
  expect(
    (
      await db.query(`SELECT public.settle_upscale_execution_failure($1,'deadline',true) AS ok`, [
        jobId,
      ])
    ).rows[0].ok
  ).toBe(true);
  expect(await account(userId)).toEqual({ subscription: 10, purchased: 0 });
});

test('dispatch claims at most fifty current actions and skips another transaction locks', async () => {
  const userId = await createUpscaleUser(db, 100, 0);
  await db.query('DELETE FROM public.upscale_outbox');
  for (let i = 0; i < 51; i += 1)
    await admitUpscale(db, userId, randomUUID(), { amount: 1, batchLimit: 100 });
  const first = await database.connect();
  const second = await database.connect();
  try {
    await first.query('BEGIN');
    expect(
      (await first.query(`SELECT * FROM public.claim_upscale_outbox(1000,'first',120)`)).rows
    ).toHaveLength(50);
    expect(
      (await second.query(`SELECT * FROM public.claim_upscale_outbox(1000,'second',120)`)).rows
    ).toHaveLength(1);
  } finally {
    await first.query('ROLLBACK');
    await Promise.all([first.end(), second.end()]);
  }
});

test('a concurrent admission and refund for the same account use the same profile and batch lock order', async () => {
  const userId = await createUpscaleUser(db);
  const existingJob = randomUUID();
  await admitUpscale(db, userId, existingJob);
  const refund = await database.connect();
  const admission = await database.connect();
  let pending: ReturnType<typeof admitUpscale> | undefined;
  try {
    await refund.query('BEGIN');
    await refund.query('SELECT id FROM public.profiles WHERE id=$1 FOR UPDATE', [userId]);
    const pid = (await admission.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pending = admitUpscale(admission, userId, randomUUID());
    void pending.catch(() => undefined);
    // Observe the actual row wait rather than assuming scheduler timing.
    await expect
      .poll(
        async () =>
          (await db.query('SELECT cardinality(pg_blocking_pids($1)) AS n', [pid])).rows[0].n
      )
      .toBeGreaterThan(0);
    expect(
      (
        await refund.query(
          `SELECT public.settle_upscale_execution_failure($1,'failed',false) AS ok`,
          [existingJob]
        )
      ).rows[0].ok
    ).toBe(true);
    await refund.query('COMMIT');
    expect((await pending).result_code).toBe('admitted');
    expect(await account(userId)).toEqual({ subscription: 7, purchased: 0 });
  } finally {
    await refund.query('ROLLBACK');
    await pending?.catch(() => undefined);
    await Promise.all([refund.end(), admission.end()]);
  }
});

test('executor admission fails closed on missing, failed or stale health while preserving existing-job recovery', async () => {
  const userId = await createUpscaleUser(db);
  const admitted = randomUUID();
  await admitUpscale(db, userId, admitted);
  const digest = `sha256:${'1'.repeat(64)}`;
  try {
    await db.query('DELETE FROM public.upscale_executor_health');
    for (const state of ['missing', 'failed', 'stale']) {
      if (state === 'failed')
        await db.query('SELECT public.record_upscale_executor_health($1,false)', [digest]);
      if (state === 'stale') {
        await db.query('SELECT public.record_upscale_executor_health($1,true)', [digest]);
        await db.query(
          `UPDATE public.upscale_executor_health SET checked_at=now()-interval '121 seconds'`
        );
      }
      expect(
        (await db.query('SELECT * FROM public.get_upscale_executor_availability()')).rows[0]
          .healthy,
        state
      ).toBe(false);
      expect((await admitUpscale(db, userId, randomUUID())).result_code, state).toBe(
        'executor_unavailable'
      );
      expect((await admitUpscale(db, userId, admitted)).result_code, state).toBe('replay');
      expect(await account(userId)).toEqual({ subscription: 7, purchased: 0 });
      expect(
        (await db.query('SELECT count FROM public.batch_usage WHERE user_id=$1', [userId])).rows[0]
          .count
      ).toBe(1);
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM public.upscale_executions WHERE user_id=$1',
            [userId]
          )
        ).rows[0].n
      ).toBe(1);
    }
    expect(
      (await db.query('SELECT public.record_upscale_executor_health($1,true) AS ok', ['latest']))
        .rows[0].ok
    ).toBe(false);
  } finally {
    await db.query('SELECT public.record_upscale_executor_health($1,true)', [digest]);
  }
  expect((await admitUpscale(db, userId, randomUUID())).result_code).toBe('admitted');
});

test('deferred explicit analysis retains the selected model and persists the bounded final config atomically', async () => {
  const userId = await createUpscaleUser(db);
  const jobId = randomUUID();
  await admitUpscale(db, userId, jobId, {
    provider: 'deferred',
    config: { scale: 2, smartAnalysis: true },
  });
  const resolved = { scale: 2, smartAnalysis: true, enhancement: { denoise: true } };
  expect(
    (
      await db.query(
        `SELECT public.resolve_upscale_execution_plan($1,'another-model','replicate','v1',3,$2) AS ok`,
        [jobId, resolved]
      )
    ).rows[0].ok
  ).toBe(false);
  expect(
    (
      await db.query(
        `SELECT public.resolve_upscale_execution_plan($1,'resolved-model','replicate','changed-version',3,$2) AS ok`,
        [jobId, resolved]
      )
    ).rows[0].ok
  ).toBe(false);
  expect(
    (
      await db.query(
        `SELECT public.resolve_upscale_execution_plan($1,'resolved-model','replicate','v1',3,$2) AS ok`,
        [jobId, { oversized: 'x'.repeat(17000) }]
      )
    ).rows[0].ok
  ).toBe(false);
  expect((await execution(jobId)).provider).toBe('deferred');
  expect(
    (
      await db.query(
        `SELECT public.resolve_upscale_execution_plan($1,'resolved-model','replicate','v1',3,$2) AS ok`,
        [jobId, resolved]
      )
    ).rows[0].ok
  ).toBe(true);
  expect(await execution(jobId)).toMatchObject({
    provider: 'replicate',
    resolved_model_id: 'resolved-model',
    config: resolved,
  });
  expect(
    (await db.query('SELECT settings FROM public.processing_jobs WHERE id=$1', [jobId])).rows[0]
      .settings
  ).toEqual(resolved);
  expect(
    (
      await db.query(
        `SELECT public.resolve_upscale_execution_plan($1,'resolved-model','replicate','v1',3,$2) AS ok`,
        [jobId, { scale: 2, changed: true }]
      )
    ).rows[0].ok
  ).toBe(false);
});

test('expired delivery capabilities deny new streams while a live lease survives expiry and bounded rotation', async () => {
  const userId = await createUpscaleUser(db);
  const jobId = randomUUID();
  await admitUpscale(db, userId, jobId);
  const output = await ready(userId, jobId);
  const capability = (
    await db.query(
      `SELECT expires_at-created_at AS ttl FROM public.upscale_delivery_capabilities
    WHERE job_id=$1 AND token_hash=$2`,
      [jobId, token]
    )
  ).rows[0];
  expect(capability.ttl.minutes).toBe(5);
  await db.query(
    `UPDATE public.upscale_delivery_capabilities SET expires_at=now()-interval '1 second' WHERE job_id=$1`,
    [jobId]
  );
  expect(
    (
      await db.query('SELECT * FROM public.acquire_upscale_delivery_lease($1,$2,$3)', [
        userId,
        jobId,
        token,
      ])
    ).rows
  ).toHaveLength(0);
  const activeToken = 'b'.repeat(64);
  await db.query('SELECT * FROM public.issue_upscale_delivery_capability($1,$2,$3)', [
    userId,
    jobId,
    activeToken,
  ]);
  expect(
    (
      await db.query('SELECT * FROM public.acquire_upscale_delivery_lease($1,$2,$3)', [
        userId,
        jobId,
        activeToken,
      ])
    ).rows
  ).toHaveLength(1);
  await db.query(
    `UPDATE public.upscale_delivery_capabilities SET expires_at=now()-interval '1 second' WHERE job_id=$1`,
    [jobId]
  );
  for (let i = 1; i <= 8; i += 1)
    await db.query('SELECT * FROM public.issue_upscale_delivery_capability($1,$2,$3)', [
      userId,
      jobId,
      i.toString(16).repeat(64),
    ]);
  expect(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM public.upscale_delivery_capabilities WHERE job_id=$1',
        [jobId]
      )
    ).rows[0].n
  ).toBeLessThanOrEqual(5);
  expect(
    (
      await db.query('SELECT public.renew_upscale_delivery_lease($1,$2,$3) AS ok', [
        userId,
        jobId,
        activeToken,
      ])
    ).rows[0].ok
  ).toBe(true);
  expect(
    (
      await db.query(`SELECT public.acknowledge_upscale_execution($1,$2,$3,'image/png',$4) AS ok`, [
        userId,
        jobId,
        output.path,
        activeToken,
      ])
    ).rows[0].ok
  ).toBe(true);
  expect(await execution(jobId)).toMatchObject({
    stage: 'completed',
    reservation_status: 'completed',
    delivery_lease_token_hash: null,
  });
});

test('completed output downloads release their own lease and repeated original acknowledgement stays idempotent', async () => {
  const userId = await createUpscaleUser(db);
  const jobId = randomUUID();
  await admitUpscale(db, userId, jobId);
  const output = await ready(userId, jobId);
  await db.query('SELECT * FROM public.acquire_upscale_delivery_lease($1,$2,$3)', [
    userId,
    jobId,
    token,
  ]);
  await db.query(`SELECT public.acknowledge_upscale_execution($1,$2,$3,'image/png',$4)`, [
    userId,
    jobId,
    output.path,
    token,
  ]);
  const nextToken = 'c'.repeat(64);
  await db.query('SELECT * FROM public.issue_upscale_delivery_capability($1,$2,$3)', [
    userId,
    jobId,
    nextToken,
  ]);
  await db.query('SELECT * FROM public.acquire_upscale_delivery_lease($1,$2,$3)', [
    userId,
    jobId,
    nextToken,
  ]);
  expect(
    (
      await db.query(`SELECT public.acknowledge_upscale_execution($1,$2,$3,'image/png',$4) AS ok`, [
        userId,
        jobId,
        output.path,
        nextToken,
      ])
    ).rows[0].ok
  ).toBe(true);
  expect(await execution(jobId)).toMatchObject({
    delivery_lease_token_hash: null,
    delivery_lease_expires_at: null,
  });
  for (let i = 1; i <= 8; i += 1)
    await db.query('SELECT * FROM public.issue_upscale_delivery_capability($1,$2,$3)', [
      userId,
      jobId,
      i.toString(16).repeat(64),
    ]);
  expect(
    (
      await db.query(`SELECT public.acknowledge_upscale_execution($1,$2,$3,'image/png',$4) AS ok`, [
        userId,
        jobId,
        output.path,
        token,
      ])
    ).rows[0].ok
  ).toBe(true);
  expect(
    (
      await db.query(
        `SELECT count(*)::int AS n FROM public.credit_transactions WHERE user_id=$1 AND type='usage'`,
        [userId]
      )
    ).rows[0].n
  ).toBe(1);
});

test('staging cannot publish ready after the customer deadline even before the expiry task runs', async () => {
  const userId = await createUpscaleUser(db);
  const jobId = randomUUID();
  await admitUpscale(db, userId, jobId);
  const output = await stage(userId, jobId);
  await db.query(
    `UPDATE public.upscale_executions SET deadline_at=now()-interval '1 second' WHERE job_id=$1`,
    [jobId]
  );
  expect(
    (
      await db.query(
        `SELECT public.mark_upscale_ready($1,$2,'image/png',2048,now()+interval '24 hours',$3,1024,1024) AS ok`,
        [jobId, output.path, token]
      )
    ).rows[0].ok
  ).toBe(false);
  expect(await execution(jobId)).toMatchObject({
    stage: 'staging',
    output_storage_path: null,
    reservation_status: 'processing',
  });
  await db.query('SELECT public.reconcile_upscale_deadlines(100)');
  expect(await execution(jobId)).toMatchObject({
    stage: 'expired',
    reservation_status: 'refunded',
  });
  expect(await account(userId)).toEqual({ subscription: 10, purchased: 0 });
});
