import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dockerAvailable = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
const containerName = `miu-recipient-performance-${randomUUID()}`;
let client: Client | undefined;

describe.runIf(dockerAvailable)('recipient-value performance migration on PostgreSQL 16', () => {
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

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const ready =
        spawnSync('docker', ['exec', containerName, 'pg_isready', '-U', 'postgres'], {
          stdio: 'ignore',
        }).status === 0;
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    const mapping = execFileSync('docker', ['port', containerName, '5432/tcp'], {
      encoding: 'utf8',
    }).trim();
    const port = Number(mapping.slice(mapping.lastIndexOf(':') + 1));
    client = new Client({
      connectionString: `postgresql://postgres:test@127.0.0.1:${port}/postgres`,
    });
    await client.connect();
    await client.query(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE TABLE public.profiles(id UUID PRIMARY KEY, signup_country TEXT);
      CREATE TABLE public.email_lifecycle_queue(
        id UUID PRIMARY KEY,
        user_id UUID,
        campaign_key TEXT,
        recipient_value_policy_version TEXT,
        recipient_value_band TEXT,
        recipient_value_decision TEXT,
        sent_at TIMESTAMPTZ
      );
      CREATE TABLE public.email_lifecycle_events(
        queue_id UUID,
        event_type TEXT,
        occurred_at TIMESTAMPTZ,
        metadata JSONB
      );
      CREATE TABLE public.email_logs(status TEXT, provider_response JSONB, sent_at TIMESTAMPTZ);
    `);
    await client.query(
      readFileSync(
        'supabase/migrations/20260716000100_optimize_recipient_value_performance.sql',
        'utf8'
      )
    );
  }, 30_000);

  afterAll(async () => {
    await client?.end();
    spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
  });

  it('applies and preserves privacy, attribution, failure correlation, and grants', async () => {
    if (!client) throw new Error('PostgreSQL test client was not initialized');
    await client.query(`
      INSERT INTO profiles
      SELECT md5(i::TEXT)::UUID, CASE WHEN i <= 20 THEN 'US' ELSE 'CA' END
      FROM generate_series(1, 39) AS i;

      INSERT INTO email_lifecycle_queue
      SELECT
        md5(i::TEXT)::UUID,
        md5(i::TEXT)::UUID,
        'fixture',
        'v1',
        'high',
        'keep_high',
        pg_catalog.now() - INTERVAL '1 hour'
      FROM generate_series(1, 39) AS i;

      INSERT INTO email_lifecycle_events
      SELECT
        md5(i::TEXT)::UUID,
        'sent',
        pg_catalog.now() - INTERVAL '1 hour',
        pg_catalog.jsonb_build_object('messageId', 'msg-' || i)
      FROM generate_series(1, 39) AS i;

      INSERT INTO email_lifecycle_events
      SELECT md5(i::TEXT)::UUID, 'clicked', pg_catalog.now() - INTERVAL '30 minutes', '{}'::JSONB
      FROM generate_series(1, 5) AS i;

      INSERT INTO email_lifecycle_events
      SELECT md5(i::TEXT)::UUID, 'returned', pg_catalog.now() - INTERVAL '25 minutes', '{}'::JSONB
      FROM generate_series(1, 4) AS i;

      INSERT INTO email_lifecycle_events
      SELECT md5(i::TEXT)::UUID, 'purchased_after_email', pg_catalog.now() - INTERVAL '10 minutes', '{}'::JSONB
      FROM generate_series(1, 2) AS i;

      INSERT INTO email_lifecycle_events VALUES
        (md5('3')::UUID, 'purchased_after_email', pg_catalog.now() + INTERVAL '8 days', '{}'::JSONB),
        (md5('1')::UUID, 'failed', pg_catalog.now() - INTERVAL '5 minutes', '{"error":"permanent_bounce"}'::JSONB);

      INSERT INTO email_logs VALUES
        ('failed', '{"messageId":"msg-1","permanent_bounce":true}'::JSONB, pg_catalog.now()),
        ('failed', '{"messageId":"msg-2","complaint":true}'::JSONB, pg_catalog.now()),
        ('failed', '{"messageId":"unrelated","complaint":true}'::JSONB, pg_catalog.now());
    `);

    const report = await client.query(`
      SELECT
        country,
        sent_count,
        clicked_count,
        returned_count,
        purchased_after_email_count,
        send_to_purchase_conversion_rate,
        conversion_ci_lower,
        conversion_ci_upper,
        hard_bounce_count,
        complaint_count
      FROM public.get_email_recipient_value_performance(
        pg_catalog.now() - INTERVAL '7 days'
      )
    `);

    expect(report.rows).toEqual([
      expect.objectContaining({
        country: 'US',
        sent_count: '20',
        clicked_count: '5',
        returned_count: '4',
        purchased_after_email_count: '2',
        send_to_purchase_conversion_rate: '0.1000',
        conversion_ci_lower: '0.0279',
        conversion_ci_upper: '0.3010',
        hard_bounce_count: '1',
        complaint_count: '1',
      }),
    ]);

    const grants = await client.query(`
      SELECT
        pg_catalog.has_function_privilege(
          'anon',
          'public.get_email_recipient_value_performance(timestamp with time zone)',
          'EXECUTE'
        ) AS anon_execute,
        pg_catalog.has_function_privilege(
          'authenticated',
          'public.get_email_recipient_value_performance(timestamp with time zone)',
          'EXECUTE'
        ) AS authenticated_execute,
        pg_catalog.has_function_privilege(
          'service_role',
          'public.get_email_recipient_value_performance(timestamp with time zone)',
          'EXECUTE'
        ) AS service_role_execute
    `);
    expect(grants.rows[0]).toEqual({
      anon_execute: false,
      authenticated_execute: false,
      service_role_execute: true,
    });
  });
});
