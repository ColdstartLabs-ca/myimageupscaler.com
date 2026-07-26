import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dockerAvailable = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
const containerName = `miu-email-eligibility-${randomUUID()}`;
let client: Client | undefined;
let connectionString: string | undefined;

describe.runIf(dockerAvailable)(
  'lifecycle queue eligibility restoration on PostgreSQL 16',
  () => {
    beforeAll(async () => {
      execFileSync('docker', [
        'run',
        '--rm',
        '-d',
        '--name',
        containerName,
        '-e',
        'POSTGRES_PASSWORD=test',
        '-P',
        'postgres:16-alpine',
      ]);
      const mapping = execFileSync('docker', ['port', containerName, '5432/tcp'], {
        encoding: 'utf8',
      }).trim();
      connectionString = `postgresql://postgres:test@127.0.0.1:${mapping.split(':').at(-1)}/postgres`;

      for (let attempt = 0; attempt < 60; attempt += 1) {
        const candidate = new Client({ connectionString });
        try {
          await candidate.connect();
          client = candidate;
          break;
        } catch {
          await candidate.end().catch(() => undefined);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      if (!client) throw new Error('PostgreSQL test connection failed');

      await client.query(`
        CREATE ROLE anon;
        CREATE ROLE authenticated;
        CREATE ROLE service_role;
        CREATE SCHEMA extensions;
        CREATE EXTENSION pgcrypto WITH SCHEMA extensions;

        CREATE TABLE public.profiles(
          id UUID PRIMARY KEY,
          signup_country TEXT
        );
        CREATE TABLE public.email_lifecycle_campaigns(
          key TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          template_name TEXT NOT NULL,
          email_type TEXT NOT NULL,
          preference_key TEXT,
          enabled BOOLEAN NOT NULL,
          cooldown_days INTEGER NOT NULL,
          priority TEXT NOT NULL,
          sort_priority INTEGER NOT NULL
        );
        CREATE TABLE public.email_lifecycle_queue(
          id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
          campaign_key TEXT NOT NULL REFERENCES public.email_lifecycle_campaigns(key),
          user_id UUID REFERENCES public.profiles(id),
          recipient_email TEXT NOT NULL,
          scheduled_for TIMESTAMPTZ NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          reason TEXT,
          template_data JSONB NOT NULL DEFAULT '{}'::jsonb,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          sent_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
          subscription_id TEXT,
          processing_claim_id UUID,
          processing_claimed_at TIMESTAMPTZ,
          recipient_value_score INTEGER,
          recipient_value_band TEXT,
          recipient_value_decision TEXT,
          recipient_value_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
          recipient_value_policy_version TEXT,
          recipient_value_classified_at TIMESTAMPTZ,
          recipient_value_run_id UUID
        );
        CREATE TABLE public.email_lifecycle_events(
          id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
          queue_id UUID,
          user_id UUID,
          event_type TEXT NOT NULL,
          campaign_key TEXT,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          occurred_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
        );
        CREATE TABLE public.email_queue_pruning_runs(
          id UUID PRIMARY KEY,
          policy_version TEXT NOT NULL,
          mode TEXT NOT NULL,
          candidate_count INTEGER NOT NULL,
          candidate_checksum TEXT NOT NULL,
          rolled_back_at TIMESTAMPTZ,
          applied_at TIMESTAMPTZ
        );
        CREATE TABLE public.email_queue_pruning_run_items(
          run_id UUID NOT NULL,
          queue_id UUID NOT NULL,
          queue_updated_at TIMESTAMPTZ NOT NULL,
          recipient_value_score INTEGER NOT NULL,
          recipient_value_band TEXT NOT NULL,
          recipient_value_decision TEXT NOT NULL,
          recipient_value_reasons JSONB NOT NULL,
          recipient_value_policy_version TEXT NOT NULL
        );

        INSERT INTO public.email_lifecycle_campaigns VALUES
          ('marketing', 'Marketing', 'lifecycle', 'feature', 'marketing',
            'marketing_emails', true, 7, 'lifecycle', 50),
          ('transactional', 'Transactional', 'system', 'receipt', 'transactional',
            NULL, true, 0, 'transactional', 100);
      `);
      await client.query(
        readFileSync(
          'supabase/migrations/20260725000100_restore_email_queue_eligibility.sql',
          'utf8'
        )
      );
    }, 120_000);

    afterAll(async () => {
      await client?.end();
      spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
    });

    it('rejects an unclassified pending marketing row but allows transactional enqueue', async () => {
      if (!client) throw new Error('PostgreSQL test client was not initialized');
      await expect(
        client.query(`
          INSERT INTO public.email_lifecycle_queue(
            campaign_key, recipient_email, scheduled_for
          ) VALUES ('marketing', 'redacted@example.com', pg_catalog.now())
        `)
      ).rejects.toThrow('Unclassified pending marketing lifecycle row is forbidden');

      await expect(
        client.query(`
          INSERT INTO public.email_lifecycle_queue(
            campaign_key, recipient_email, scheduled_for
          ) VALUES ('transactional', 'redacted@example.com', pg_catalog.now())
        `)
      ).resolves.toBeDefined();
    });

    it('allows unrelated enqueue drift but rejects mutation of a persisted run item', async () => {
      if (!client) throw new Error('PostgreSQL test client was not initialized');
      const fixture = await client.query(`
        INSERT INTO public.email_lifecycle_queue(
          campaign_key, recipient_email, scheduled_for,
          recipient_value_score, recipient_value_band, recipient_value_decision,
          recipient_value_reasons, recipient_value_policy_version, recipient_value_classified_at
        ) VALUES (
          'marketing', 'redacted@example.com', pg_catalog.now(),
          40, 'medium', 'keep_medium', '[]'::jsonb, 'v1', pg_catalog.now()
        ) RETURNING id, updated_at
      `);
      const queueId = fixture.rows[0].id;
      const runId = randomUUID();
      await client.query(
        `
          INSERT INTO public.email_queue_pruning_runs
            (id, policy_version, mode, candidate_count, candidate_checksum)
          VALUES ($1, 'v1', 'dry_run', 1, 'checksum')
        `,
        [runId]
      );
      await client.query(
        `
          INSERT INTO public.email_queue_pruning_run_items
          SELECT $1, q.id, q.updated_at, 80, 'high', 'keep_high', '[]'::jsonb, 'v1'
          FROM public.email_lifecycle_queue AS q
          WHERE q.id = $2
        `,
        [runId, queueId]
      );
      await client.query(`
        INSERT INTO public.email_lifecycle_queue(
          campaign_key, recipient_email, scheduled_for,
          recipient_value_score, recipient_value_band, recipient_value_decision,
          recipient_value_reasons, recipient_value_policy_version, recipient_value_classified_at
        ) VALUES (
          'marketing', 'unrelated@example.com', pg_catalog.now(),
          40, 'medium', 'keep_medium', '[]'::jsonb, 'v1', pg_catalog.now()
        )
      `);

      const applied = await client.query(
        `SELECT public.apply_email_recipient_value_run($1, 'v1', 1, 'checksum', 'apply') AS result`,
        [runId]
      );
      expect(applied.rows[0].result).toMatchObject({ mode: 'applied', changed_count: 1 });

      const secondQueue = await client.query(`
        INSERT INTO public.email_lifecycle_queue(
          campaign_key, recipient_email, scheduled_for,
          recipient_value_score, recipient_value_band, recipient_value_decision,
          recipient_value_reasons, recipient_value_policy_version, recipient_value_classified_at
        ) VALUES (
          'marketing', 'mutated@example.com', pg_catalog.now(),
          40, 'medium', 'keep_medium', '[]'::jsonb, 'v1', pg_catalog.now()
        ) RETURNING id, updated_at
      `);
      const secondRunId = randomUUID();
      await client.query(
        `
          INSERT INTO public.email_queue_pruning_runs
            (id, policy_version, mode, candidate_count, candidate_checksum)
          VALUES ($1, 'v1', 'dry_run', 1, 'checksum-2')
        `,
        [secondRunId]
      );
      await client.query(
        `
          INSERT INTO public.email_queue_pruning_run_items
          SELECT $1, q.id, q.updated_at, 80, 'high', 'keep_high', '[]'::jsonb, 'v1'
          FROM public.email_lifecycle_queue AS q
          WHERE q.id = $2
        `,
        [secondRunId, secondQueue.rows[0].id]
      );
      await client.query(
        `
          UPDATE public.email_lifecycle_queue
          SET updated_at = updated_at + INTERVAL '1 second'
          WHERE id = $1
        `,
        [secondQueue.rows[0].id]
      );
      await expect(
        client.query(
          `SELECT public.apply_email_recipient_value_run($1, 'v1', 1, 'checksum-2', 'apply')`,
          [secondRunId]
        )
      ).rejects.toThrow('Recipient-value run item changed');
    });

    it('rejects incoherent decision and band pairs before applying a run', async () => {
      if (!client) throw new Error('PostgreSQL test client was not initialized');
      const fixture = await client.query(`
        INSERT INTO public.email_lifecycle_queue(
          campaign_key, recipient_email, scheduled_for,
          recipient_value_score, recipient_value_band, recipient_value_decision,
          recipient_value_reasons, recipient_value_policy_version, recipient_value_classified_at
        ) VALUES (
          'marketing', 'incoherent@example.com', pg_catalog.now(),
          40, 'medium', 'keep_medium', '[]'::jsonb, 'v1', pg_catalog.now()
        ) RETURNING id, updated_at
      `);
      const runId = randomUUID();
      await client.query(
        `
          INSERT INTO public.email_queue_pruning_runs
            (id, policy_version, mode, candidate_count, candidate_checksum)
          VALUES ($1, 'v1', 'dry_run', 1, 'incoherent-checksum')
        `,
        [runId]
      );
      await client.query(
        `
          INSERT INTO public.email_queue_pruning_run_items
          SELECT $1, q.id, q.updated_at, 80, 'cancel', 'keep_high', '[]'::jsonb, 'v1'
          FROM public.email_lifecycle_queue AS q
          WHERE q.id = $2
        `,
        [runId, fixture.rows[0].id]
      );

      await expect(
        client.query(
          `SELECT public.apply_email_recipient_value_run(
            $1, 'v1', 1, 'incoherent-checksum', 'apply'
          )`,
          [runId]
        )
      ).rejects.toThrow('Recipient-value run contains an unsafe decision');
    });

    it('serializes apply against a concurrent run-item mutation', async () => {
      if (!client || !connectionString) {
        throw new Error('PostgreSQL test client was not initialized');
      }
      const fixture = await client.query(`
        INSERT INTO public.email_lifecycle_queue(
          campaign_key, recipient_email, scheduled_for,
          recipient_value_score, recipient_value_band, recipient_value_decision,
          recipient_value_reasons, recipient_value_policy_version, recipient_value_classified_at
        ) VALUES (
          'marketing', 'concurrent@example.com', pg_catalog.now(),
          40, 'medium', 'keep_medium', '[]'::jsonb, 'v1', pg_catalog.now()
        ) RETURNING id
      `);
      const runId = randomUUID();
      await client.query(
        `
          INSERT INTO public.email_queue_pruning_runs
            (id, policy_version, mode, candidate_count, candidate_checksum)
          VALUES ($1, 'v1', 'dry_run', 1, 'concurrent-checksum')
        `,
        [runId]
      );
      await client.query(
        `
          INSERT INTO public.email_queue_pruning_run_items
          SELECT $1, q.id, q.updated_at, 80, 'high', 'keep_high', '[]'::jsonb, 'v1'
          FROM public.email_lifecycle_queue AS q
          WHERE q.id = $2
        `,
        [runId, fixture.rows[0].id]
      );

      const concurrent = new Client({ connectionString });
      await concurrent.connect();
      try {
        await concurrent.query('BEGIN');
        await concurrent.query(
          `
            UPDATE public.email_lifecycle_queue
            SET updated_at = updated_at + INTERVAL '1 second'
            WHERE id = $1
          `,
          [fixture.rows[0].id]
        );
        const apply = client.query(
          `SELECT public.apply_email_recipient_value_run(
            $1, 'v1', 1, 'concurrent-checksum', 'apply'
          )`,
          [runId]
        );
        await new Promise(resolve => setTimeout(resolve, 100));
        await concurrent.query('COMMIT');
        await expect(apply).rejects.toThrow('Recipient-value run item changed');
      } finally {
        await concurrent.query('ROLLBACK').catch(() => undefined);
        await concurrent.end();
      }
    });

    it('releases a deterministic cohort with a hard one-hundred daily ceiling', async () => {
      if (!client) throw new Error('PostgreSQL test client was not initialized');
      await client.query(`
        INSERT INTO public.profiles
        SELECT extensions.gen_random_uuid(), 'PH'
        FROM pg_catalog.generate_series(1, 1500);
        INSERT INTO public.email_lifecycle_queue(
          id, campaign_key, user_id, recipient_email, scheduled_for,
          recipient_value_score, recipient_value_band, recipient_value_decision,
          recipient_value_reasons, recipient_value_policy_version, recipient_value_classified_at
        )
        SELECT
          extensions.gen_random_uuid(), 'marketing', p.id, 'redacted@example.com',
          pg_catalog.now() - INTERVAL '1 day',
          20, 'experiment', 'hold_experiment', '[]'::jsonb, 'v1', pg_catalog.now()
        FROM public.profiles AS p
        WHERE p.signup_country = 'PH';
      `);

      const first = await client.query(
        `SELECT public.release_email_recipient_value_holdout(CURRENT_DATE, 100) AS released`
      );
      const releasedIds = await client.query(`
        SELECT id
        FROM public.email_lifecycle_queue
        WHERE recipient_value_holdout_released_at IS NOT NULL
        ORDER BY id
      `);
      const second = await client.query(
        `SELECT public.release_email_recipient_value_holdout(CURRENT_DATE, 100) AS released`
      );
      await client.query(`
        UPDATE public.email_lifecycle_queue
        SET recipient_value_holdout_released_at = NULL
        WHERE recipient_value_decision = 'hold_experiment'
      `);
      const replay = await client.query(
        `SELECT public.release_email_recipient_value_holdout(CURRENT_DATE, 100) AS released`
      );
      const replayedIds = await client.query(`
        SELECT id
        FROM public.email_lifecycle_queue
        WHERE recipient_value_holdout_released_at IS NOT NULL
        ORDER BY id
      `);
      await client.query(`
        UPDATE public.email_lifecycle_queue
        SET recipient_value_holdout_released_at =
          recipient_value_holdout_released_at - INTERVAL '1 day'
        WHERE recipient_value_holdout_released_at IS NOT NULL
      `);
      const dueHoldout = await client.query(`
        SELECT id
        FROM public.get_due_email_lifecycle_queue(250, pg_catalog.now())
        WHERE recipient_value_decision = 'hold_experiment'
      `);
      const health = await client.query(`
        SELECT *
        FROM public.get_email_lifecycle_queue_health(pg_catalog.now())
      `);

      expect(first.rows[0].released).toBe(100);
      expect(releasedIds.rowCount).toBe(100);
      expect(second.rows[0].released).toBe(0);
      expect(replay.rows[0].released).toBe(100);
      expect(replayedIds.rows).toEqual(releasedIds.rows);
      expect(dueHoldout.rowCount).toBe(100);
      expect(Number(health.rows[0].held_count)).toBe(1500);
      expect(Number(health.rows[0].eligible_count)).toBeGreaterThanOrEqual(100);
      expect(Number(health.rows[0].unclassified_count)).toBe(0);
    });

    it('halts health on unsubscribe threshold or any provider block event', async () => {
      if (!client) throw new Error('PostgreSQL test client was not initialized');
      await client.query(`
        INSERT INTO public.email_lifecycle_events(event_type, campaign_key)
        SELECT 'sent', 'marketing'
        FROM pg_catalog.generate_series(1, 100);
        INSERT INTO public.email_lifecycle_events(event_type)
        SELECT 'unsubscribed'
        FROM pg_catalog.generate_series(1, 4);
      `);
      const unsubscribeHealth = await client.query(`
        SELECT stop_recommended, unsubscribe_rate
        FROM public.get_email_lifecycle_health(pg_catalog.now() - INTERVAL '1 day')
        WHERE campaign_priority = 'lifecycle'
      `);
      expect(unsubscribeHealth.rows[0].unsubscribe_rate).toBe('0.0400');
      expect(unsubscribeHealth.rows[0].stop_recommended).toBe(true);

      await client.query(`
        DELETE FROM public.email_lifecycle_events WHERE event_type = 'unsubscribed';
        INSERT INTO public.email_lifecycle_events(event_type, campaign_key, metadata)
        VALUES (
          'failed', 'marketing',
          '{"classification":"provider_blocked","error":"provider_blocked"}'::jsonb
        );
      `);
      const blockHealth = await client.query(`
        SELECT stop_recommended, provider_block_count
        FROM public.get_email_lifecycle_health(pg_catalog.now() - INTERVAL '1 day')
        WHERE campaign_priority = 'lifecycle'
      `);
      expect(Number(blockHealth.rows[0].provider_block_count)).toBe(1);
      expect(blockHealth.rows[0].stop_recommended).toBe(true);
    });
  }
);
