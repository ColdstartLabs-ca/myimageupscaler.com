/**
 * PRD-SQR-03 AC-3 / AC-4 integration proof.
 *
 * Runs the real retention service and the real idempotency service against a
 * disposable local Supabase stack. It never touches a remote or production DB.
 *
 * The stack is owned by this lane and is distinct from the shared
 * `.claude/worktrees/local-test-db` lane: default project `miu-sqr03`,
 * API port 55431. Override with SQR03_TEST_DB_PROJECT / SQR03_TEST_DB_PORT /
 * SQR03_TEST_DB_URL / SQR03_TEST_DB_SERVICE_KEY.
 *
 * Behavior:
 * - By default the suite skips with a warning when the owned stack is not up.
 * - Set SQR03_REQUIRE_INTEGRATION=1 (CI/parent gate) to make a missing stack or
 *   a missing RPC FAIL the suite instead of skipping. A prepared skip is not
 *   evidence.
 *
 * AC-3: terminal queue rows are pruned by terminal age, and rows the rollback
 *       run, holdout release state or 90-day click/return attribution need
 *       survive. Pending and sent rows are never touched.
 * AC-4: a tombstoned webhook row keeps its event_id, so the real replay guard
 *       still rejects the duplicate.
 */
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => {
  const projectId = process.env.SQR03_TEST_DB_PROJECT || 'miu-sqr03';
  const apiPort = Number(process.env.SQR03_TEST_DB_PORT || 55431);
  const url = process.env.SQR03_TEST_DB_URL || `http://127.0.0.1:${apiPort}`;
  // Public Supabase local-development demo service-role key; grants nothing off the local stack.
  const key =
    process.env.SQR03_TEST_DB_SERVICE_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
  return { projectId, apiPort, url, key, requireIntegration: process.env.SQR03_REQUIRE_INTEGRATION === '1' };
});

// --- SQR03 ownership/safety guards ----------------------------------------
// These run before the first network call. A stray SQR03_TEST_DB_URL or
// SQR03_TEST_DB_PG_URL must never point the suite at a remote or production
// host: the owned stack is disposable and the service-role key is public.
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** The project id is interpolated into a Docker name regex; reject anything unsafe. */
function assertOwnedProjectId(projectId: string): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(projectId)) {
    throw new Error(
      `SQR03_TEST_DB_PROJECT must be a lowercase [a-z0-9-] slug (got "${projectId}"); ` +
        'refusing to build a Docker name filter from it.'
    );
  }
}

/** The API base URL must be plain HTTP on loopback at the exact owned API port. */
function assertOwnedApiUrl(url: string, apiPort: number): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`SQR03_TEST_DB_URL is not a valid URL: "${url}"`);
  }
  if (parsed.protocol !== 'http:') {
    throw new Error(
      `SQR03_TEST_DB_URL must use http:// for the local stack (got "${parsed.protocol}")`
    );
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`SQR03_TEST_DB_URL must point at loopback (got host "${parsed.hostname}")`);
  }
  if (Number(parsed.port) !== apiPort) {
    throw new Error(
      `SQR03_TEST_DB_URL port must be the owned API port ${apiPort} (got "${parsed.port}")`
    );
  }
}

/** The PG target must be loopback, DB port = API port + 1, database "postgres". */
function assertOwnedPgConfig(
  raw: { connectionString?: string; host?: string; port?: number; database?: string },
  apiPort: number
): void {
  const expectedPort = apiPort + 1;
  if (raw.connectionString) {
    let parsed: URL;
    try {
      parsed = new URL(raw.connectionString);
    } catch {
      throw new Error('SQR03_TEST_DB_PG_URL is not a valid URL');
    }
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
      throw new Error(`SQR03_TEST_DB_PG_URL must be a postgres URL (got "${parsed.protocol}")`);
    }
    if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
      throw new Error(`SQR03_TEST_DB_PG_URL must point at loopback (got host "${parsed.hostname}")`);
    }
    if (Number(parsed.port) !== expectedPort) {
      throw new Error(`SQR03_TEST_DB_PG_URL port must be ${expectedPort} (got "${parsed.port}")`);
    }
    if (parsed.pathname.replace(/^\//, '') !== 'postgres') {
      throw new Error('SQR03_TEST_DB_PG_URL database must be "postgres"');
    }
    return;
  }
  const host = raw.host ?? '127.0.0.1';
  const port = raw.port ?? expectedPort;
  const database = raw.database ?? 'postgres';
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(`SQR03_TEST_DB_PGHOST must be loopback (got "${host}")`);
  }
  if (port !== expectedPort) {
    throw new Error(`SQR03_TEST_DB_PGPORT must be ${expectedPort} (got "${port}")`);
  }
  if (database !== 'postgres') {
    throw new Error(`SQR03_TEST_DB_PGDATABASE must be "postgres" (got "${database}")`);
  }
}

const pgEnv = {
  connectionString: process.env.SQR03_TEST_DB_PG_URL,
  host: process.env.SQR03_TEST_DB_PGHOST || '127.0.0.1',
  port: Number(process.env.SQR03_TEST_DB_PGPORT || config.apiPort + 1),
  database: process.env.SQR03_TEST_DB_PGDATABASE || 'postgres',
};

// Refuse an unsafe target before the first SQL/auth/query. The Supabase client
// is created lazily and performs no I/O, so this aborts ahead of any network.
assertOwnedProjectId(config.projectId);
assertOwnedApiUrl(config.url, config.apiPort);
assertOwnedPgConfig(pgEnv, config.apiPort);

vi.mock('@server/supabase/supabaseAdmin', async () => {
  // The shared vitest.setup.tsx stubs @supabase/supabase-js globally with a
  // client that has no .rpc, and stubs global fetch. This real integration
  // suite needs both real, so bypass the stubs with the actual modules.
  const { createClient } = await vi.importActual<typeof import('@supabase/supabase-js')>(
    '@supabase/supabase-js'
  );
  const { fetch: realFetch } = await vi.importActual<{ fetch: typeof globalThis.fetch }>('undici');
  globalThis.fetch = realFetch;
  return {
    supabaseAdmin: createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
});

import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { runDatabaseRetention } from '@server/services/databaseRetention.service';
import { IdempotencyService } from '@/app/api/webhooks/stripe/services/idempotency.service';
import { Client, type ClientConfig } from 'pg';

/** Direct DB session for the deterministic two-session lock race. */
function pgConfig(): ClientConfig {
  if (pgEnv.connectionString) return { connectionString: pgEnv.connectionString };
  return {
    host: pgEnv.host,
    port: pgEnv.port,
    user: process.env.SQR03_TEST_DB_PGUSER || 'postgres',
    password: process.env.SQR03_TEST_DB_PGPASSWORD || 'postgres',
    database: pgEnv.database,
  };
}

/** Running row for an exact container name, or null. */
function ownedContainerRow(name: string): string | null {
  const result = spawnSync(
    'docker',
    ['ps', '--filter', `name=^${name}$`, '--filter', 'status=running', '--format', '{{.Names}} {{.Ports}}'],
    { encoding: 'utf8', timeout: 5000 }
  );
  if (result.status !== 0 || typeof result.stdout !== 'string') return null;
  return result.stdout.split('\n').find(line => line.startsWith(`${name} `)) ?? null;
}

/**
 * Ownership means both the Kong and the Postgres containers of this exact
 * project are running and publishing the owned ports. The Kong check alone is
 * not enough: the API URL can be overridden while the DB session still points
 * somewhere else.
 */
function isOwnedTestDatabaseRunning(): boolean {
  const kong = ownedContainerRow(`supabase_kong_${config.projectId}`);
  const db = ownedContainerRow(`supabase_db_${config.projectId}`);
  return (
    kong !== null &&
    kong.includes(`:${config.apiPort}->8000/tcp`) &&
    db !== null &&
    db.includes(`:${config.apiPort + 1}->5432/tcp`)
  );
}

const stackRunning = isOwnedTestDatabaseRunning();

if (!stackRunning && config.requireIntegration) {
  throw new Error(
    `SQR03_REQUIRE_INTEGRATION=1 but the owned local Supabase stack is not running ` +
      `(project ${config.projectId}: API 127.0.0.1:${config.apiPort} after ` +
      `supabase_kong_${config.projectId}, DB 127.0.0.1:${config.apiPort + 1} after ` +
      `supabase_db_${config.projectId}). Start it with 'npx supabase start' after ` +
      `'npx supabase init' in this lane, then rerun. A prepared skip is not evidence.`
  );
}
if (!stackRunning) {
  console.warn(
    `[sqr03] local Supabase (${config.projectId}:${config.apiPort}) not running; ` +
      'integration suite skipped. Set SQR03_REQUIRE_INTEGRATION=1 to fail instead.'
  );
}

const suite = stackRunning ? describe : describe.skip;

// These guards run for every invocation, stack up or not. They prove a
// malicious API/PG target is refused by configuration alone, before any query.
describe('SQR03 integration safety guards', () => {
  it('accepts an http loopback API URL at the owned port', () => {
    expect(() => assertOwnedApiUrl('http://127.0.0.1:55431', 55431)).not.toThrow();
    expect(() => assertOwnedApiUrl('http://localhost:55431', 55431)).not.toThrow();
    expect(() => assertOwnedApiUrl('http://[::1]:55431', 55431)).not.toThrow();
  });

  it('refuses a remote, https or off-port API URL before any network', () => {
    expect(() => assertOwnedApiUrl('https://prod.supabase.co', 55431)).toThrow(/loopback|http:/);
    expect(() => assertOwnedApiUrl('http://10.0.0.5:55431', 55431)).toThrow(/loopback/);
    expect(() => assertOwnedApiUrl('http://127.0.0.1:8000', 55431)).toThrow(/port/i);
    expect(() => assertOwnedApiUrl('not a url', 55431)).toThrow(/valid URL/);
  });

  it('accepts only a loopback PG target on the owned DB port (API port + 1)', () => {
    expect(() =>
      assertOwnedPgConfig({ host: '127.0.0.1', port: 55432, database: 'postgres' }, 55431)
    ).not.toThrow();
    expect(() =>
      assertOwnedPgConfig(
        { connectionString: 'postgres://postgres:postgres@127.0.0.1:55432/postgres' },
        55431
      )
    ).not.toThrow();
  });

  it('refuses a remote or off-port PG target before any network', () => {
    expect(() =>
      assertOwnedPgConfig(
        { connectionString: 'postgres://u:p@db.prod.example.com:5432/postgres' },
        55431
      )
    ).toThrow(/loopback/);
    expect(() =>
      assertOwnedPgConfig({ host: '10.0.0.5', port: 55432, database: 'postgres' }, 55431)
    ).toThrow(/loopback/);
    expect(() =>
      assertOwnedPgConfig({ host: '127.0.0.1', port: 5432, database: 'postgres' }, 55431)
    ).toThrow(/port/i);
    expect(() =>
      assertOwnedPgConfig({ host: '127.0.0.1', port: 55432, database: 'production' }, 55431)
    ).toThrow(/postgres/);
    expect(() =>
      assertOwnedPgConfig({ connectionString: 'postgres://u:p@127.0.0.1:55432/production' }, 55431)
    ).toThrow(/postgres/);
  });

  it('refuses a project id that is unsafe for a Docker name filter', () => {
    expect(() => assertOwnedProjectId('miu-sqr03')).not.toThrow();
    expect(() => assertOwnedProjectId('miu.*')).toThrow(/slug/);
    expect(() => assertOwnedProjectId('miu sqr03')).toThrow(/slug/);
    expect(() => assertOwnedProjectId('a$(rm -rf)')).toThrow(/slug/);
    expect(() => assertOwnedProjectId('Admin')).toThrow(/slug/);
  });
});

type Seeded = { queueIds: string[]; runIds: string[]; campaignKeys: string[]; webhookIds: string[] };

suite('dependency-aware database retention (owned local Supabase)', () => {
  const token = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const campaignKey = `sqr03-${token}`;
  const webhookEventId = `sqr03-evt-${token}`;
  const day = 24 * 60 * 60 * 1000;
  const ago = (days: number) => new Date(Date.now() - days * day).toISOString();

  const seeded: Seeded = { queueIds: [], runIds: [], campaignKeys: [], webhookIds: [] };
  const queueIds: Record<string, string> = {};
  let ready = false;
  let setupError: Error | null = null;

  async function cleanup(): Promise<void> {
    if (seeded.webhookIds.length) {
      await supabaseAdmin.from('webhook_events').delete().in('event_id', seeded.webhookIds);
    }
    const ids = seeded.queueIds.filter(Boolean);
    if (ids.length) {
      await supabaseAdmin.from('email_lifecycle_events').delete().in('queue_id', ids);
      await supabaseAdmin.from('email_lifecycle_queue').delete().in('id', ids);
    }
    if (seeded.runIds.length) {
      await supabaseAdmin.from('email_queue_pruning_runs').delete().in('id', seeded.runIds);
    }
    if (seeded.campaignKeys.length) {
      await supabaseAdmin.from('email_lifecycle_campaigns').delete().in('key', seeded.campaignKeys);
    }
  }

  beforeAll(async () => {
    // Probe the RPC first. When it is missing the migration was never applied;
    // fail loudly under the required gate instead of skipping as if nothing ran.
    const probe = await supabaseAdmin.rpc('prune_email_lifecycle_queue', {
      p_terminal_cutoff: ago(30),
      p_attribution_cutoff: ago(90),
      p_limit: 1,
      p_dry_run: true,
    });
    if (probe.error) {
      if (probe.error.code === 'PGRST202' && !config.requireIntegration) return;
      throw new Error(
        `prune_email_lifecycle_queue RPC unavailable; apply the retention migration: ${probe.error.message}`
      );
    }

    try {
      const campaign = await supabaseAdmin
        .from('email_lifecycle_campaigns')
        .insert({
          key: campaignKey,
          name: 'SQR03 retention test',
          category: 'test',
          template_name: 'test',
          email_type: 'transactional',
          cooldown_days: 7,
          priority: 'lifecycle',
        })
        .select('key')
        .single();
      if (campaign.error) throw new Error(campaign.error.message);
      seeded.campaignKeys.push(campaignKey);

      const run = await supabaseAdmin
        .from('email_queue_pruning_runs')
        .insert({
          policy_version: 'v1',
          mode: 'applied',
          queue_snapshot_at: ago(40),
          candidate_count: 1,
          candidate_checksum: token,
        })
        .select('id')
        .single();
      if (run.error) throw new Error(run.error.message);
      seeded.runIds.push(run.data.id as string);
      const runId = run.data.id as string;

      const seeds: Array<Record<string, unknown> & { label: string }> = [
        { label: 'prunable', status: 'skipped', created_at: ago(40), updated_at: ago(40) },
        { label: 'recentlyTerminal', status: 'skipped', created_at: ago(40), updated_at: ago(2) },
        {
          label: 'rollbackRun',
          status: 'cancelled',
          created_at: ago(40),
          updated_at: ago(40),
          recipient_value_run_id: runId,
          recipient_value_decision: 'cancel',
        },
        // Rollback evidence that lives only in the run-item table.
        { label: 'runItemOnly', status: 'cancelled', created_at: ago(40), updated_at: ago(40) },
        // Held holdout: never released, marketing experiment row.
        {
          label: 'holdoutHeld',
          status: 'cancelled',
          created_at: ago(40),
          updated_at: ago(40),
          recipient_value_decision: 'hold_experiment',
        },
        // Released holdout: the release timestamp itself is the dependency.
        {
          label: 'holdoutReleased',
          status: 'cancelled',
          created_at: ago(40),
          updated_at: ago(40),
          recipient_value_holdout_released_at: ago(20),
        },
        { label: 'attributionClicked', status: 'cancelled', created_at: ago(40), updated_at: ago(40) },
        { label: 'attributionReturned', status: 'cancelled', created_at: ago(40), updated_at: ago(40) },
        // Delivered then marked failed by a later step. sent_at stays set, so
        // the row is not a deletion candidate and its sent event survives.
        {
          label: 'failedDelivered',
          status: 'failed',
          created_at: ago(40),
          updated_at: ago(40),
          sent_at: ago(40),
        },
        { label: 'pendingRow', status: 'pending', created_at: ago(40), updated_at: ago(40) },
        { label: 'sentRow', status: 'sent', created_at: ago(40), updated_at: ago(40) },
      ];

      for (const seed of seeds) {
        const { label, ...row } = seed;
        const inserted = await supabaseAdmin
          .from('email_lifecycle_queue')
          .insert({
            campaign_key: campaignKey,
            recipient_email: `${label}@example.test`,
            scheduled_for: ago(40),
            ...row,
          })
          .select('id')
          .single();
        if (inserted.error) throw new Error(`${label}: ${inserted.error.message}`);
        queueIds[label] = inserted.data.id as string;
        seeded.queueIds.push(inserted.data.id as string);
      }

      const item = await supabaseAdmin.from('email_queue_pruning_run_items').insert([
        {
          run_id: runId,
          queue_id: queueIds.rollbackRun,
          queue_updated_at: ago(40),
          recipient_value_score: 0,
          recipient_value_band: 'cancel',
          recipient_value_decision: 'cancel',
          recipient_value_reasons: [],
          recipient_value_policy_version: 'v1',
        },
        {
          run_id: runId,
          queue_id: queueIds.runItemOnly,
          queue_updated_at: ago(40),
          recipient_value_score: 0,
          recipient_value_band: 'cancel',
          recipient_value_decision: 'cancel',
          recipient_value_reasons: [],
          recipient_value_policy_version: 'v1',
        },
      ]);
      if (item.error) throw new Error(item.error.message);

      const events = await supabaseAdmin.from('email_lifecycle_events').insert([
        {
          queue_id: queueIds.attributionClicked,
          campaign_key: campaignKey,
          event_type: 'clicked',
          metadata: {},
          occurred_at: ago(10),
        },
        {
          queue_id: queueIds.attributionReturned,
          campaign_key: campaignKey,
          event_type: 'returned',
          metadata: {},
          occurred_at: ago(15),
        },
      ]);
      if (events.error) throw new Error(events.error.message);

      const webhook = await supabaseAdmin.from('webhook_events').insert({
        event_id: webhookEventId,
        event_type: 'sqr03.test',
        status: 'completed',
        created_at: ago(100),
        payload: { marker: token },
      });
      if (webhook.error) throw new Error(webhook.error.message);
      seeded.webhookIds.push(webhookEventId);

      ready = true;
    } catch (error) {
      setupError = error instanceof Error ? error : new Error(String(error));
      await cleanup();
      throw setupError;
    }
  });

  afterAll(async () => {
    await cleanup();
  });

  async function remainingQueueIds(): Promise<string[]> {
    const ids = Object.values(queueIds).filter(Boolean);
    if (!ids.length) return [];
    const remaining = await supabaseAdmin.from('email_lifecycle_queue').select('id').in('id', ids);
    return (remaining.data ?? []).map(row => row.id as string);
  }

  it('prunes by terminal age and keeps every dependent or nonterminal row', async ctx => {
    if (!ready) ctx.skip();

    const result = await runDatabaseRetention({ now: new Date(), batchSize: 100 });
    const queue = result.policies.find(policy => policy.key === 'email_terminal_queue');
    expect(queue?.deleted).toBeGreaterThanOrEqual(1);

    const remaining = await remainingQueueIds();

    expect(remaining).not.toContain(queueIds.prunable);
    for (const label of [
      'recentlyTerminal',
      'rollbackRun',
      'runItemOnly',
      'holdoutHeld',
      'holdoutReleased',
      'attributionClicked',
      'attributionReturned',
      'failedDelivered',
      'pendingRow',
      'sentRow',
    ]) {
      expect(remaining).toContain(queueIds[label]);
    }
  });

  it('keeps the run-item rows that carry rollback evidence (FK cascade guard)', async ctx => {
    if (!ready) ctx.skip();

    await runDatabaseRetention({ now: new Date(), batchSize: 100 });

    const items = await supabaseAdmin
      .from('email_queue_pruning_run_items')
      .select('queue_id')
      .in('queue_id', [queueIds.rollbackRun, queueIds.runItemOnly]);
    const kept = (items.data ?? []).map(row => row.queue_id as string);
    expect(kept).toContain(queueIds.rollbackRun);
    expect(kept).toContain(queueIds.runItemOnly);
  });

  it('tombstones the webhook payload but the real idempotency guard still rejects the replay', async ctx => {
    if (!ready) ctx.skip();

    await runDatabaseRetention({ now: new Date(), batchSize: 100 });

    const row = await supabaseAdmin
      .from('webhook_events')
      .select('event_id,status,payload')
      .eq('event_id', webhookEventId)
      .maybeSingle();

    expect(row.error).toBeNull();
    expect(row.data?.status).toBe('completed');
    expect(row.data?.payload).toBeNull();

    // Exercise the real dedupe path: a duplicate insert must be refused.
    const replay = await IdempotencyService.checkAndClaimEvent(webhookEventId, 'sqr03.test', {
      marker: 'replay',
    });
    expect(replay.isNew).toBe(false);
    expect(replay.existingStatus).toBe('completed');
  });

  it('does not lose a dependency inserted concurrently with prune (two-session race)', async ctx => {
    if (!ready) ctx.skip();

    // Seed a fresh prunable row for this race only.
    const raceCampaign = `${campaignKey}-race`;
    const campaign = await supabaseAdmin
      .from('email_lifecycle_campaigns')
      .insert({
        key: raceCampaign,
        name: 'SQR03 race',
        category: 'test',
        template_name: 'test',
        email_type: 'transactional',
        cooldown_days: 7,
        priority: 'lifecycle',
      })
      .select('key')
      .single();
    if (campaign.error) throw new Error(campaign.error.message);
    seeded.campaignKeys.push(raceCampaign);

    const race = await supabaseAdmin
      .from('email_queue_pruning_runs')
      .insert({
        policy_version: 'v1',
        mode: 'applied',
        queue_snapshot_at: ago(40),
        candidate_count: 1,
        candidate_checksum: `${token}-race`,
      })
      .select('id')
      .single();
    if (race.error) throw new Error(race.error.message);
    seeded.runIds.push(race.data.id as string);
    const raceRunId = race.data.id as string;

    const inserted = await supabaseAdmin
      .from('email_lifecycle_queue')
      .insert({
        campaign_key: raceCampaign,
        recipient_email: `race@example.test`,
        status: 'cancelled',
        scheduled_for: ago(40),
        created_at: ago(40),
        updated_at: ago(40),
      })
      .select('id')
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    let raceQueueId = inserted.data.id as string;
    seeded.queueIds.push(raceQueueId);

    // Fire the dependency insert and the prune at the same time. If prune is
    // not lock-safe it can delete the row after the item commits and cascade the
    // item away. Run several rounds; every round must keep the pair.
    for (let round = 0; round < 5; round++) {
      await supabaseAdmin.from('email_queue_pruning_run_items').delete().eq('run_id', raceRunId);
      const [itemResult] = await Promise.all([
        supabaseAdmin.from('email_queue_pruning_run_items').insert({
          run_id: raceRunId,
          queue_id: raceQueueId,
          queue_updated_at: ago(40),
          recipient_value_score: 0,
          recipient_value_band: 'cancel',
          recipient_value_decision: 'cancel',
          recipient_value_reasons: [],
          recipient_value_policy_version: 'v1',
        }),
        runDatabaseRetention({ now: new Date(), batchSize: 100 }),
      ]);
      if (itemResult.error) {
        // 23503: prune won the lock and deleted the row before the dependency
        // existed. That is a safe serialization, not a lost dependency; the next
        // round seeds a fresh row. Any other error is a real failure.
        if (itemResult.error.code === '23503') {
          await supabaseAdmin.from('email_lifecycle_queue').delete().eq('id', raceQueueId);
          const reseed = await supabaseAdmin
            .from('email_lifecycle_queue')
            .insert({
              campaign_key: raceCampaign,
              recipient_email: `race@example.test`,
              status: 'cancelled',
              scheduled_for: ago(40),
              created_at: ago(40),
              updated_at: ago(40),
            })
            .select('id')
            .single();
          if (reseed.error) throw new Error(reseed.error.message);
          raceQueueId = reseed.data.id as string;
          seeded.queueIds.push(raceQueueId);
          continue;
        }
        throw new Error(itemResult.error.message);
      }

      // The dependency insert succeeded. The lock-safe prune must not have
      // deleted the row after the item existed: the FK cascade would lose it.
      const row = await supabaseAdmin
        .from('email_lifecycle_queue')
        .select('id')
        .eq('id', raceQueueId)
        .maybeSingle();
      expect(row.data?.id).toBe(raceQueueId);

      const item = await supabaseAdmin
        .from('email_queue_pruning_run_items')
        .select('id')
        .eq('queue_id', raceQueueId)
        .maybeSingle();
      expect(item.data).not.toBeNull();
    }
  });

  it('skips a candidate another session holds, then deletes it after release (deterministic two-session lock race)', async ctx => {
    if (!ready) ctx.skip();

    const lockCampaign = `${campaignKey}-lock`;
    const campaign = await supabaseAdmin
      .from('email_lifecycle_campaigns')
      .insert({
        key: lockCampaign,
        name: 'SQR03 lock race',
        category: 'test',
        template_name: 'test',
        email_type: 'transactional',
        cooldown_days: 7,
        priority: 'lifecycle',
      })
      .select('key')
      .single();
    if (campaign.error) throw new Error(campaign.error.message);
    seeded.campaignKeys.push(lockCampaign);

    const inserted = await supabaseAdmin
      .from('email_lifecycle_queue')
      .insert({
        campaign_key: lockCampaign,
        recipient_email: 'lock@example.test',
        status: 'cancelled',
        scheduled_for: ago(40),
        created_at: ago(40),
        updated_at: ago(40),
      })
      .select('id')
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    const lockQueueId = inserted.data.id as string;
    seeded.queueIds.push(lockQueueId);

    // Session A holds a row lock on the otherwise prunable candidate.
    const holder = new Client(pgConfig());
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM public.email_lifecycle_queue WHERE id = $1 FOR UPDATE', [
        lockQueueId,
      ]);

      // Session B (the RPC) must skip the locked row via SKIP LOCKED.
      await runDatabaseRetention({ now: new Date(), batchSize: 100 });
      const heldRow = await supabaseAdmin
        .from('email_lifecycle_queue')
        .select('id')
        .eq('id', lockQueueId)
        .maybeSingle();
      expect(heldRow.data?.id).toBe(lockQueueId);

      // Proof the row was genuinely prunable: release the lock and prune again.
      await holder.query('COMMIT');
      const after = await runDatabaseRetention({ now: new Date(), batchSize: 100 });
      const queue = after.policies.find(policy => policy.key === 'email_terminal_queue');
      expect(queue?.deleted).toBeGreaterThanOrEqual(1);
      const goneRow = await supabaseAdmin
        .from('email_lifecycle_queue')
        .select('id')
        .eq('id', lockQueueId)
        .maybeSingle();
      expect(goneRow.data).toBeNull();
    } finally {
      await holder.end();
    }
  });
});
