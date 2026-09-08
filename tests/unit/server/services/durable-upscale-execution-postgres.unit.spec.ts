import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { startUpscalePostgres, type IUpscalePostgres } from '../../../helpers/upscale-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Real-PostgreSQL contract proof for the durable upscale execution ledger.
 *
 * The migration under test is applied on top of the real baseline migrations
 * that own the credit reservation, batch quota and projection tables, so every
 * assertion here exercises committed database behaviour rather than SQL text.
 */

const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);
const FINGERPRINT = 'f'.repeat(48);
const attemptIds = new Map<string, string>();

function outputPath(userId: string, jobId: string): string {
  return `${userId}/outputs/${jobId}/${attemptIds.get(jobId)}.jpg`;
}

let db: Client | undefined;
let other: Client | undefined;
let database: IUpscalePostgres | undefined;

function sql(): Client {
  if (!db) throw new Error('PostgreSQL test client was not initialized');
  return db;
}

async function createUser(subscription: number, purchased: number): Promise<string> {
  const userId = randomUUID();
  await sql().query(`INSERT INTO auth.users (id) VALUES ($1)`, [userId]);
  await sql().query(
    `INSERT INTO public.profiles (id, subscription_credits_balance, purchased_credits_balance)
     VALUES ($1, $2, $3)`,
    [userId, subscription, purchased]
  );
  return userId;
}

interface IAdmitOverrides {
  fingerprint?: string;
  amount?: number;
  batchLimit?: number;
  buildId?: string;
  deadlineAt?: string | null;
}

async function admit(userId: string | null, jobId: string, overrides: IAdmitOverrides = {}) {
  const result = await sql().query(
    `SELECT * FROM public.admit_upscale_execution(
       $1, $2, $3, 'inputs/source.png', 'image/png', 1024, 512, 512, 'balanced', 2,
       '{"scale":2}'::JSONB, 'billing-model', 'resolved-model', 'replicate', 'v1',
       $4, $5, $6, $7, NULL)`,
    [
      userId,
      jobId,
      overrides.fingerprint ?? FINGERPRINT,
      overrides.amount ?? 3,
      overrides.batchLimit ?? 5,
      overrides.deadlineAt ?? null,
      overrides.buildId ?? 'test-build',
    ]
  );
  return result.rows[0];
}

async function balances(userId: string): Promise<{ subscription: number; purchased: number }> {
  const row = await sql().query(
    `SELECT subscription_credits_balance AS s, purchased_credits_balance AS p
     FROM public.profiles WHERE id = $1`,
    [userId]
  );
  return { subscription: row.rows[0].s, purchased: row.rows[0].p };
}

async function stageOf(jobId: string): Promise<string | null> {
  const row = await sql().query(`SELECT stage FROM public.upscale_executions WHERE job_id = $1`, [
    jobId,
  ]);
  return row.rows[0]?.stage ?? null;
}

async function reservationStatus(jobId: string): Promise<string | null> {
  const row = await sql().query(
    `SELECT status FROM public.processing_credit_reservations WHERE job_id = $1`,
    [jobId]
  );
  return row.rows[0]?.status ?? null;
}

/** Drives an admitted job to `ready` with a live output and delivery token. */
async function driveToReady(
  userId: string,
  jobId: string,
  options: { outputExpiresIn?: string; token?: string } = {}
): Promise<void> {
  const attempt = await sql().query(
    `SELECT * FROM public.create_upscale_attempt($1, 'replicate', 'resolved-model', 'v1', $2)`,
    [jobId, `corr-${jobId}`]
  );
  const attemptId = attempt.rows[0].attempt_id;
  attemptIds.set(jobId, attemptId);
  await sql().query(`SELECT public.bind_upscale_prediction($1, $2, $3, 'starting', now())`, [
    jobId,
    attemptId,
    `pred-${jobId}`,
  ]);
  await sql().query(
    `SELECT public.mark_upscale_provider_terminal(
       $1, $2, 'succeeded', 'https://provider.example/output.jpg', 'image/jpeg', now() + interval '1 hour', NULL)`,
    [jobId, attemptId]
  );
  await sql().query(
    `SELECT public.mark_upscale_ready(
       $1, $2, 'image/jpeg', 2048, now() + $3::interval, $4)`,
    [
      jobId,
      outputPath(userId, jobId),
      options.outputExpiresIn ?? '1 hour',
      options.token ?? TOKEN_A,
    ]
  );
}

/** Drives an admitted job to `staging` (provider succeeded, output not staged). */
async function driveToStaging(jobId: string): Promise<string> {
  const attempt = await sql().query(
    `SELECT * FROM public.create_upscale_attempt($1, 'replicate', 'resolved-model', 'v1', $2)`,
    [jobId, `corr-${jobId}`]
  );
  const attemptId = attempt.rows[0].attempt_id;
  attemptIds.set(jobId, attemptId);
  await sql().query(`SELECT public.bind_upscale_prediction($1, $2, $3, 'starting', now())`, [
    jobId,
    attemptId,
    `pred-${jobId}`,
  ]);
  await sql().query(
    `SELECT public.mark_upscale_provider_terminal(
       $1, $2, 'succeeded', 'https://provider.example/output.jpg', 'image/jpeg', now() + interval '1 hour', NULL)`,
    [jobId, attemptId]
  );
  return attemptId;
}

describe('durable upscale execution ledger on PostgreSQL 17', () => {
  beforeAll(async () => {
    database = await startUpscalePostgres({ executorReady: true });
    db = database.db;
    other = await database.connect();
  }, 180_000);

  afterAll(async () => {
    await database?.stop();
  }, 60_000);

  beforeEach(async () => {
    await sql().query('RESET ROLE');
  });

  describe('contract 1: legacy stale reconciliation ignores protocol v2', () => {
    it('refunds a stale v1 reservation and leaves a 10-minute-old v2 reservation untouched', async () => {
      const legacyUser = await createUser(10, 0);
      const durableUser = await createUser(10, 0);
      const legacyJob = randomUUID();
      const durableJob = randomUUID();

      await sql().query(`SELECT * FROM public.consume_credits_v3($1, 3, $2, 'legacy')`, [
        legacyUser,
        legacyJob,
      ]);
      await admit(durableUser, durableJob);

      await sql().query(
        `UPDATE public.processing_credit_reservations
         SET created_at = now() - interval '30 minutes'
         WHERE job_id = ANY($1::UUID[])`,
        [[legacyJob, durableJob]]
      );

      const reconciled = await sql().query(
        `SELECT * FROM public.reconcile_stale_credit_reservations(now() - interval '10 minutes', 100)`
      );

      expect(reconciled.rows[0]).toMatchObject({ refunded_count: 1, quarantined_count: 0 });
      expect(await reservationStatus(legacyJob)).toBe('refunded');
      expect(await reservationStatus(durableJob)).toBe('processing');
      expect(await balances(durableUser)).toEqual({ subscription: 7, purchased: 0 });
      expect(await balances(legacyUser)).toEqual({ subscription: 10, purchased: 0 });
    });
  });

  describe('contract 2: admission is atomic and replay-safe', () => {
    it('commits debit, reservation, execution, outbox and batch slot together', async () => {
      const userId = await createUser(4, 6);
      const jobId = randomUUID();

      const admitted = await admit(userId, jobId, { amount: 5 });

      expect(admitted).toMatchObject({
        result_code: 'admitted',
        stage: 'queued',
        reserved_credits: 5,
        credits_remaining: 5,
      });
      expect(await balances(userId)).toEqual({ subscription: 0, purchased: 5 });
      const reservation = await sql().query(
        `SELECT status, protocol_version, consumed_subscription, consumed_purchased
         FROM public.processing_credit_reservations WHERE job_id = $1`,
        [jobId]
      );
      expect(reservation.rows[0]).toMatchObject({
        status: 'processing',
        protocol_version: 'v2',
        consumed_subscription: 4,
        consumed_purchased: 1,
      });
      const outbox = await sql().query(
        `SELECT action, generation FROM public.upscale_outbox WHERE job_id = $1`,
        [jobId]
      );
      expect(outbox.rows).toEqual([{ action: 'advance', generation: '0' }]);
      const batch = await sql().query(`SELECT count FROM public.batch_usage WHERE user_id = $1`, [
        userId,
      ]);
      expect(batch.rows[0].count).toBe(1);
      const projection = await sql().query(
        `SELECT status, credits_used FROM public.processing_jobs WHERE id = $1`,
        [jobId]
      );
      expect(projection.rows[0]).toMatchObject({ status: 'queued', credits_used: 5 });
    });

    it('rolls back the debit and the batch slot when credits are insufficient', async () => {
      const userId = await createUser(1, 0);
      const jobId = randomUUID();

      await expect(admit(userId, jobId, { amount: 5 })).rejects.toThrow(/Insufficient credits/);

      expect(await balances(userId)).toEqual({ subscription: 1, purchased: 0 });
      expect(await reservationStatus(jobId)).toBeNull();
      expect(await stageOf(jobId)).toBeNull();
      const batch = await sql().query(`SELECT count FROM public.batch_usage WHERE user_id = $1`, [
        userId,
      ]);
      expect(batch.rows).toHaveLength(0);
    });

    it('rolls back every write when the execution insert fails mid-admission', async () => {
      const userId = await createUser(10, 0);
      const jobId = randomUUID();
      await sql().query(`
        CREATE OR REPLACE FUNCTION public.inject_admission_failure()
        RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
        BEGIN
          IF NEW.build_id = 'inject-failure' THEN
            RAISE EXCEPTION 'injected admission failure';
          END IF;
          RETURN NEW;
        END;
        $fn$;
        CREATE TRIGGER inject_admission_failure
          BEFORE INSERT ON public.upscale_executions
          FOR EACH ROW EXECUTE FUNCTION public.inject_admission_failure();
      `);

      try {
        await expect(admit(userId, jobId, { buildId: 'inject-failure' })).rejects.toThrow(
          /injected admission failure/
        );
      } finally {
        await sql().query(`DROP TRIGGER inject_admission_failure ON public.upscale_executions`);
      }

      expect(await balances(userId)).toEqual({ subscription: 10, purchased: 0 });
      expect(await reservationStatus(jobId)).toBeNull();
      const transactions = await sql().query(
        `SELECT count(*)::INT AS n FROM public.credit_transactions WHERE user_id = $1`,
        [userId]
      );
      expect(transactions.rows[0].n).toBe(0);
      const batch = await sql().query(`SELECT count FROM public.batch_usage WHERE user_id = $1`, [
        userId,
      ]);
      expect(batch.rows).toHaveLength(0);
    });

    it('replays the same job+fingerprint without a second debit and conflicts on a changed one', async () => {
      const userId = await createUser(10, 0);
      const jobId = randomUUID();

      await admit(userId, jobId, { amount: 3 });
      const replay = await admit(userId, jobId, { amount: 3 });
      const conflict = await admit(userId, jobId, { amount: 3, fingerprint: 'c'.repeat(48) });

      expect(replay).toMatchObject({ result_code: 'replay', stage: 'queued', reserved_credits: 3 });
      expect(conflict).toMatchObject({ result_code: 'conflict', stage: 'queued' });
      expect(await balances(userId)).toEqual({ subscription: 7, purchased: 0 });
      const usage = await sql().query(
        `SELECT count(*)::INT AS n FROM public.credit_transactions WHERE user_id = $1 AND type = 'usage'`,
        [userId]
      );
      expect(usage.rows[0].n).toBe(1);
      const batch = await sql().query(`SELECT count FROM public.batch_usage WHERE user_id = $1`, [
        userId,
      ]);
      expect(batch.rows[0].count).toBe(1);
      const outbox = await sql().query(
        `SELECT count(*)::INT AS n FROM public.upscale_outbox WHERE job_id = $1`,
        [jobId]
      );
      expect(outbox.rows[0].n).toBe(1);
    });
  });

  describe('contract 3: mutation surface is closed to untrusted roles', () => {
    const mutations = [
      "public.admit_upscale_execution(NULL::UUID, NULL::UUID, NULL, NULL, NULL, 1, 1, 1, 'balanced', 2, '{}'::JSONB, 'm', 'm', 'replicate', NULL, 1, 1, NULL, 'b', NULL)",
      "public.refund_v2_processing_credit_reservation(NULL::UUID, NULL::UUID, 'x')",
      "public.mark_upscale_ready(NULL::UUID, 'p', 'image/png', 1, now(), $$" + TOKEN_A + '$$)',
      "public.acknowledge_upscale_execution(NULL::UUID, NULL::UUID, 'p', 'image/png', $$" +
        TOKEN_A +
        '$$)',
      "public.claim_upscale_outbox(1, 'probe', 60)",
      "public.settle_upscale_execution_failure(NULL::UUID, 'x', FALSE)",
      'public.reconcile_upscale_deadlines(1)',
    ];

    it.each(['anon', 'authenticated'])('denies %s every durable mutation function', async role => {
      for (const call of mutations) {
        await sql().query(`SET ROLE ${role}`);
        await expect(sql().query(`SELECT * FROM ${call}`)).rejects.toThrow(/permission denied/);
        await sql().query('RESET ROLE');
      }
    });

    it('denies a bare PUBLIC role every durable mutation function', async () => {
      const probeRole = `contract_public_probe_${randomUUID().replace(/-/g, '')}`;
      await sql().query(`CREATE ROLE ${probeRole}`);
      try {
        for (const call of mutations) {
          await sql().query(`SET ROLE ${probeRole}`);
          await expect(sql().query(`SELECT * FROM ${call}`)).rejects.toThrow(/permission denied/);
          await sql().query('RESET ROLE');
        }
      } finally {
        await sql().query('RESET ROLE');
        await sql().query(`DROP ROLE ${probeRole}`);
      }
    });

    it('allows service_role to admit and fails closed on NULL identity input', async () => {
      const userId = await createUser(10, 0);
      const jobId = randomUUID();
      await sql().query('SET ROLE service_role');
      try {
        const admitted = await admit(userId, jobId);
        expect(admitted.result_code).toBe('admitted');

        const nullUser = await admit(null, randomUUID());
        expect(nullUser).toMatchObject({
          result_code: 'invalid_admission',
          failure_reason: 'invalid_admission',
        });

        const nullToken = await sql().query(
          `SELECT public.acknowledge_upscale_execution($1, $2, 'p', 'image/png', NULL) AS ok`,
          [userId, jobId]
        );
        expect(nullToken.rows[0].ok).toBe(false);

        const nullRefund = await sql().query(
          `SELECT public.refund_v2_processing_credit_reservation(NULL, $1, 'x') AS ok`,
          [jobId]
        );
        expect(nullRefund.rows[0].ok).toBe(false);
      } finally {
        await sql().query('RESET ROLE');
      }
      expect(await reservationStatus(jobId)).toBe('processing');
    });
  });

  describe('contract 4: refunds restore the exact pool split exactly once', () => {
    it('restores subscription and purchased pools and refunds only once', async () => {
      const userId = await createUser(2, 8);
      const jobId = randomUUID();
      await admit(userId, jobId, { amount: 5 });
      expect(await balances(userId)).toEqual({ subscription: 0, purchased: 5 });

      const first = await sql().query(
        `SELECT public.settle_upscale_execution_failure($1, 'provider_failed', FALSE) AS ok`,
        [jobId]
      );
      const second = await sql().query(
        `SELECT public.settle_upscale_execution_failure($1, 'provider_failed', FALSE) AS ok`,
        [jobId]
      );
      const directRefund = await sql().query(
        `SELECT public.refund_v2_processing_credit_reservation($1, $2, 'provider_failed') AS ok`,
        [userId, jobId]
      );

      expect(first.rows[0].ok).toBe(true);
      expect(second.rows[0].ok).toBe(true);
      expect(directRefund.rows[0].ok).toBe(true);
      expect(await balances(userId)).toEqual({ subscription: 2, purchased: 8 });
      const refunds = await sql().query(
        `SELECT count(*)::INT AS n FROM public.credit_transactions WHERE user_id = $1 AND type = 'refund'`,
        [userId]
      );
      expect(refunds.rows[0].n).toBe(1);
      expect(await reservationStatus(jobId)).toBe('refunded');
      expect(await stageOf(jobId)).toBe('failed');
      const batch = await sql().query(`SELECT count FROM public.batch_usage WHERE user_id = $1`, [
        userId,
      ]);
      expect(batch.rows[0].count).toBe(0);
    });
  });

  describe('contract 5: terminal states are one-way', () => {
    it('does not regress staging when a provider terminal callback is delivered twice', async () => {
      const userId = await createUser(10, 0);
      const jobId = randomUUID();
      await admit(userId, jobId);
      const attemptId = await driveToStaging(jobId);

      const duplicate = await sql().query(
        `SELECT public.mark_upscale_provider_terminal(
           $1, $2, 'succeeded', 'https://provider.example/duplicate.jpg',
           'image/jpeg', now() + interval '1 hour', NULL) AS ok`,
        [jobId, attemptId]
      );
      const outbox = await sql().query(
        `SELECT action, count(*)::INT AS count
         FROM public.upscale_outbox WHERE job_id = $1 AND action = 'stage' GROUP BY action`,
        [jobId]
      );

      expect(duplicate.rows[0].ok).toBe(true);
      expect(await stageOf(jobId)).toBe('staging');
      expect(outbox.rows).toEqual([{ action: 'stage', count: 1 }]);
      const attempt = await sql().query(
        `SELECT provider_output_url FROM public.upscale_attempts WHERE attempt_id = $1`,
        [attemptId]
      );
      expect(attempt.rows[0].provider_output_url).toBe('https://provider.example/output.jpg');
    });

    it('refuses to stale-refund a completed job', async () => {
      const userId = await createUser(10, 0);
      const jobId = randomUUID();
      await admit(userId, jobId, { amount: 3 });
      await driveToReady(userId, jobId);
      await sql().query(`SELECT * FROM public.acquire_upscale_delivery_lease($1, $2, $3, 120)`, [
        userId,
        jobId,
        TOKEN_A,
      ]);
      const acknowledged = await sql().query(
        `SELECT public.acknowledge_upscale_execution($1, $2, $3, 'image/jpeg', $4) AS ok`,
        [userId, jobId, outputPath(userId, jobId), TOKEN_A]
      );
      expect(acknowledged.rows[0].ok).toBe(true);

      const settled = await sql().query(
        `SELECT public.settle_upscale_execution_failure($1, 'stale', TRUE) AS ok`,
        [jobId]
      );
      const legacyStale = await sql().query(
        `SELECT * FROM public.reconcile_stale_credit_reservations(now() + interval '1 day', 100)`
      );

      expect(settled.rows[0].ok).toBe(false);
      expect(legacyStale.rows[0]).toMatchObject({ refunded_count: 0 });
      expect(await stageOf(jobId)).toBe('completed');
      expect(await reservationStatus(jobId)).toBe('completed');
      expect(await balances(userId)).toEqual({ subscription: 7, purchased: 0 });
    });

    it('refuses to move a refunded/failed job back to ready or completed', async () => {
      const userId = await createUser(10, 0);
      const jobId = randomUUID();
      await admit(userId, jobId, { amount: 3 });
      await driveToStaging(jobId);
      await sql().query(
        `SELECT public.settle_upscale_execution_failure($1, 'provider_failed', FALSE) AS ok`,
        [jobId]
      );

      const ready = await sql().query(
        `SELECT public.mark_upscale_ready($1, $2, 'image/jpeg', 2048, now() + interval '1 hour', $3) AS ok`,
        [jobId, outputPath(userId, jobId), TOKEN_A]
      );
      const acknowledged = await sql().query(
        `SELECT public.acknowledge_upscale_execution($1, $2, $3, 'image/jpeg', $4) AS ok`,
        [userId, jobId, outputPath(userId, jobId), TOKEN_A]
      );

      expect(ready.rows[0].ok).toBe(false);
      expect(acknowledged.rows[0].ok).toBe(false);
      expect(await stageOf(jobId)).toBe('failed');
      expect(await reservationStatus(jobId)).toBe('refunded');
      expect(await balances(userId)).toEqual({ subscription: 10, purchased: 0 });
    });

    it('refuses to mark ready when the reservation is no longer live', async () => {
      const userId = await createUser(10, 0);
      const jobId = randomUUID();
      await admit(userId, jobId, { amount: 3 });
      await driveToStaging(jobId);
      // The accounting side was settled out of band; the ledger must not hand
      // out an output the user is no longer paying for.
      await sql().query(
        `SELECT public.refund_v2_processing_credit_reservation($1, $2, 'out_of_band') AS ok`,
        [userId, jobId]
      );

      const ready = await sql().query(
        `SELECT public.mark_upscale_ready($1, $2, 'image/jpeg', 2048, now() + interval '1 hour', $3) AS ok`,
        [jobId, outputPath(userId, jobId), TOKEN_A]
      );

      expect(ready.rows[0].ok).toBe(false);
      expect(await stageOf(jobId)).not.toBe('ready');
      expect(await balances(userId)).toEqual({ subscription: 10, purchased: 0 });
    });
  });

  describe('contract 6: capability rotation does not break an active delivery', () => {
    it('keeps the active lease usable by the original token after a re-issue', async () => {
      const userId = await createUser(10, 0);
      const jobId = randomUUID();
      await admit(userId, jobId, { amount: 3 });
      await driveToReady(userId, jobId);

      const lease = await sql().query(
        `SELECT * FROM public.acquire_upscale_delivery_lease($1, $2, $3, 120)`,
        [userId, jobId, TOKEN_A]
      );
      expect(lease.rows).toHaveLength(1);
      const leaseExpiry: Date = lease.rows[0].delivery_lease_expires_at;

      // Status polling in another tab rotates the capability.
      const reissued = await sql().query(
        `SELECT * FROM public.issue_upscale_delivery_capability($1, $2, $3)`,
        [userId, jobId, TOKEN_B]
      );
      expect(reissued.rows).toHaveLength(1);

      const after = await sql().query(
        `SELECT delivery_lease_expires_at, delivery_token_hash, delivery_token_hash_history
         FROM public.upscale_executions WHERE job_id = $1`,
        [jobId]
      );
      expect(after.rows[0].delivery_lease_expires_at?.getTime()).toBe(leaseExpiry.getTime());
      expect(after.rows[0].delivery_token_hash).toBe(TOKEN_B);
      expect(after.rows[0].delivery_token_hash_history).toContain(TOKEN_A);

      const renewed = await sql().query(
        `SELECT public.renew_upscale_delivery_lease($1, $2, $3, 120) AS ok`,
        [userId, jobId, TOKEN_A]
      );
      const acknowledged = await sql().query(
        `SELECT public.acknowledge_upscale_execution($1, $2, $3, 'image/jpeg', $4) AS ok`,
        [userId, jobId, outputPath(userId, jobId), TOKEN_A]
      );

      expect(renewed.rows[0].ok).toBe(true);
      expect(acknowledged.rows[0].ok).toBe(true);
      expect(await stageOf(jobId)).toBe('completed');
      expect(await reservationStatus(jobId)).toBe('completed');
    });
  });

  describe('contract 7: ready output expiry', () => {
    it('refuses to expire a ready output while a delivery lease is live', async () => {
      const userId = await createUser(10, 0);
      const jobId = randomUUID();
      await admit(userId, jobId, { amount: 3 });
      await driveToReady(userId, jobId, { outputExpiresIn: '2 seconds' });
      await sql().query(`SELECT * FROM public.acquire_upscale_delivery_lease($1, $2, $3, 120)`, [
        userId,
        jobId,
        TOKEN_A,
      ]);
      await sql().query(
        `UPDATE public.upscale_executions SET output_expires_at = now() - interval '1 minute'
         WHERE job_id = $1`,
        [jobId]
      );

      const blocked = await sql().query(
        `SELECT public.settle_upscale_execution_failure($1, 'output_expired', TRUE) AS ok`,
        [jobId]
      );

      expect(blocked.rows[0].ok).toBe(false);
      expect(await stageOf(jobId)).toBe('ready');
      expect(await reservationStatus(jobId)).toBe('processing');
    });

    it('reconciles and refunds an expired ready output, then rejects late completion', async () => {
      const userId = await createUser(10, 0);
      const jobId = randomUUID();
      await admit(userId, jobId, { amount: 3 });
      await driveToReady(userId, jobId);
      await sql().query(
        `UPDATE public.upscale_executions
         SET output_expires_at = now() - interval '1 minute',
             deadline_at = now() - interval '1 minute',
             delivery_lease_expires_at = NULL
         WHERE job_id = $1`,
        [jobId]
      );

      const reconciled = await sql().query(`SELECT public.reconcile_upscale_deadlines(100) AS n`);

      expect(reconciled.rows[0].n).toBe(1);
      expect(await stageOf(jobId)).toBe('expired');
      expect(await reservationStatus(jobId)).toBe('refunded');
      expect(await balances(userId)).toEqual({ subscription: 10, purchased: 0 });

      const lateLease = await sql().query(
        `SELECT * FROM public.acquire_upscale_delivery_lease($1, $2, $3, 120)`,
        [userId, jobId, TOKEN_A]
      );
      const lateAck = await sql().query(
        `SELECT public.acknowledge_upscale_execution($1, $2, $3, 'image/jpeg', $4) AS ok`,
        [userId, jobId, outputPath(userId, jobId), TOKEN_A]
      );

      expect(lateLease.rows).toHaveLength(0);
      expect(lateAck.rows[0].ok).toBe(false);
      expect(await balances(userId)).toEqual({ subscription: 10, purchased: 0 });
    });
  });

  describe('contract 8: outbox claims are concurrency-safe and bounded', () => {
    it('skips locked rows, blocks a duplicate claim and bounds ack/retry', async () => {
      if (!other) throw new Error('second PostgreSQL session was not initialized');
      const userId = await createUser(10, 0);
      const jobId = randomUUID();
      await admit(userId, jobId, { amount: 3 });
      await sql().query(`DELETE FROM public.upscale_outbox WHERE job_id <> $1`, [jobId]);

      await sql().query('BEGIN');
      const firstClaim = await sql().query(
        `SELECT * FROM public.claim_upscale_outbox(10, 'worker-a', 120)`
      );
      const concurrentClaim = await other.query(
        `SELECT * FROM public.claim_upscale_outbox(10, 'worker-b', 120)`
      );
      await sql().query('COMMIT');

      expect(firstClaim.rows).toHaveLength(1);
      expect(concurrentClaim.rows).toHaveLength(0);

      const claimId = firstClaim.rows[0].id;
      const claimAfterCommit = await other.query(
        `SELECT * FROM public.claim_upscale_outbox(10, 'worker-b', 120)`
      );
      expect(claimAfterCommit.rows).toHaveLength(0);

      const wrongAck = await sql().query(`SELECT public.ack_upscale_outbox($1, 'worker-b') AS ok`, [
        claimId,
      ]);
      expect(wrongAck.rows[0].ok).toBe(false);

      const retried = await sql().query(
        `SELECT public.retry_upscale_outbox($1, 'transient', now(), 'worker-a') AS ok`,
        [claimId]
      );
      expect(retried.rows[0].ok).toBe(true);
      const reclaim = await other.query(
        `SELECT * FROM public.claim_upscale_outbox(10, 'worker-b', 120)`
      );
      expect(reclaim.rows).toHaveLength(1);

      const ack = await other.query(`SELECT public.ack_upscale_outbox($1, 'worker-b') AS ok`, [
        claimId,
      ]);
      const duplicateAck = await other.query(
        `SELECT public.ack_upscale_outbox($1, 'worker-b') AS ok`,
        [claimId]
      );
      const retryAfterAck = await other.query(
        `SELECT public.retry_upscale_outbox($1, 'late', now(), 'worker-b') AS ok`,
        [claimId]
      );

      expect(ack.rows[0].ok).toBe(true);
      expect(duplicateAck.rows[0].ok).toBe(false);
      expect(retryAfterAck.rows[0].ok).toBe(false);
      const finalRow = await sql().query(
        `SELECT attempt_count, published_at, claimed_by FROM public.upscale_outbox WHERE id = $1`,
        [claimId]
      );
      expect(finalRow.rows[0].attempt_count).toBe(2);
      expect(finalRow.rows[0].published_at).not.toBeNull();
      expect(finalRow.rows[0].claimed_by).toBeNull();
    });
  });

  describe('contract 9: executor wakes are replay-safe', () => {
    it('should accept one live wake claim and reject concurrent replays or expired claims', async () => {
      if (!database) throw new Error('PostgreSQL test database was not initialized');
      const clients = await Promise.all(Array.from({ length: 20 }, () => database!.connect()));
      try {
        const signature = 'f'.repeat(64);
        const results = await Promise.all(
          clients.map(client =>
            client.query(
              `SELECT public.claim_upscale_wake($1, now() + interval '2 minutes') AS ok`,
              [signature]
            )
          )
        );

        expect(results.filter(result => result.rows[0].ok)).toHaveLength(1);
        expect(
          (
            await sql().query(
              `SELECT public.claim_upscale_wake($1, now() - interval '1 second') AS ok`,
              ['e'.repeat(64)]
            )
          ).rows[0].ok
        ).toBe(false);
      } finally {
        await Promise.all(clients.map(client => client.end()));
      }
    });
  });

  describe('contract 10: completion races a refund without losing credits', () => {
    it('yields one terminal outcome regardless of which session wins', async () => {
      if (!other) throw new Error('second PostgreSQL session was not initialized');

      // Completion acquires the job lock first; the refund must observe it.
      const winnerUser = await createUser(10, 0);
      const winnerJob = randomUUID();
      await admit(winnerUser, winnerJob, { amount: 3 });
      await driveToStaging(winnerJob);

      await sql().query('BEGIN');
      await sql().query(
        `SELECT public.mark_upscale_ready($1, $2, 'image/jpeg', 2048, now() + interval '1 hour', $3)`,
        [winnerJob, outputPath(winnerUser, winnerJob), TOKEN_A]
      );
      await sql().query(`SELECT * FROM public.acquire_upscale_delivery_lease($1, $2, $3, 120)`, [
        winnerUser,
        winnerJob,
        TOKEN_A,
      ]);
      const ackInFlight = await sql().query(
        `SELECT public.acknowledge_upscale_execution($1, $2, $3, 'image/jpeg', $4) AS ok`,
        [winnerUser, winnerJob, outputPath(winnerUser, winnerJob), TOKEN_A]
      );
      const losingRefund = other
        .query('BEGIN')
        .then(() =>
          other!.query(
            `SELECT public.settle_upscale_execution_failure($1, 'race_refund', FALSE) AS ok`,
            [winnerJob]
          )
        );
      await new Promise(resolve => setTimeout(resolve, 400));
      await sql().query('COMMIT');
      const refundResult = await losingRefund;
      await other.query('COMMIT');

      expect(ackInFlight.rows[0].ok).toBe(true);
      expect(refundResult.rows[0].ok).toBe(false);
      expect(await stageOf(winnerJob)).toBe('completed');
      expect(await reservationStatus(winnerJob)).toBe('completed');
      expect(await balances(winnerUser)).toEqual({ subscription: 7, purchased: 0 });
      const winnerRefunds = await sql().query(
        `SELECT count(*)::INT AS n FROM public.credit_transactions WHERE user_id = $1 AND type = 'refund'`,
        [winnerUser]
      );
      expect(winnerRefunds.rows[0].n).toBe(0);

      // Reverse order: the refund holds the job lock first.
      const refundUser = await createUser(10, 0);
      const refundJob = randomUUID();
      await admit(refundUser, refundJob, { amount: 3 });
      await driveToStaging(refundJob);

      await other.query('BEGIN');
      const refundInFlight = await other.query(
        `SELECT public.settle_upscale_execution_failure($1, 'race_refund', FALSE) AS ok`,
        [refundJob]
      );
      const losingReady = sql()
        .query('BEGIN')
        .then(() =>
          sql().query(
            `SELECT public.mark_upscale_ready($1, $2, 'image/jpeg', 2048, now() + interval '1 hour', $3) AS ok`,
            [refundJob, outputPath(refundUser, refundJob), TOKEN_A]
          )
        );
      await new Promise(resolve => setTimeout(resolve, 400));
      await other.query('COMMIT');
      const readyResult = await losingReady;
      await sql().query('COMMIT');

      expect(refundInFlight.rows[0].ok).toBe(true);
      expect(readyResult.rows[0].ok).toBe(false);
      expect(await stageOf(refundJob)).toBe('failed');
      expect(await reservationStatus(refundJob)).toBe('refunded');
      expect(await balances(refundUser)).toEqual({ subscription: 10, purchased: 0 });
      const refundRows = await sql().query(
        `SELECT count(*)::INT AS n FROM public.credit_transactions WHERE user_id = $1 AND type = 'refund'`,
        [refundUser]
      );
      expect(refundRows.rows[0].n).toBe(1);
    });
  });
});
