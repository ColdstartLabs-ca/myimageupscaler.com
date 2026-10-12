import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { env } from 'node:process';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

describe.runIf(env.RUN_POSTGRES_TESTS === '1')(
  'terminal queue prune ordering on PostgreSQL',
  () => {
    it('selects the same eligible rows without sorting the terminal backlog', async () => {
      const name = `miu-prune-order-${randomUUID()}`;
      let client: Client | undefined;
      let started = false;
      try {
        execFileSync(
          'docker',
          [
            'run',
            '--rm',
            '-d',
            '--name',
            name,
            '-e',
            'POSTGRES_PASSWORD=test',
            '-p',
            '127.0.0.1::5432',
            'public.ecr.aws/supabase/postgres:17.6.1.052',
          ],
          { stdio: 'ignore' }
        );
        started = true;
        const port = Number(
          execFileSync('docker', ['port', name, '5432/tcp'], { encoding: 'utf8' })
            .trim()
            .split(':')
            .at(-1)
        );
        for (let attempt = 0; attempt < 40; attempt++) {
          const candidate = new Client({
            host: '127.0.0.1',
            port,
            user: 'supabase_admin',
            password: 'test',
            database: 'postgres',
          });
          try {
            await candidate.connect();
            client = candidate;
            break;
          } catch {
            await candidate.end();
            await new Promise(resolve => setTimeout(resolve, 250));
          }
        }
        if (!client) throw new Error('Owned PostgreSQL failed to start');
        await client.query(`
        CREATE TABLE public.email_lifecycle_queue(id uuid PRIMARY KEY, status text,
          updated_at timestamptz, sent_at timestamptz, recipient_value_run_id uuid,
          recipient_value_holdout_released_at timestamptz, recipient_value_decision text);
        CREATE TABLE public.email_lifecycle_events(queue_id uuid, event_type text, occurred_at timestamptz);
        CREATE TABLE public.email_queue_pruning_run_items(queue_id uuid, run_id uuid);
        INSERT INTO public.email_lifecycle_queue(id,status,updated_at)
        SELECT gen_random_uuid(), CASE WHEN n%10=0 THEN 'pending' WHEN n%10=1 THEN 'sent'
          ELSE 'skipped' END, now()-interval '60 days'-(n%1000)*interval '1 second'
        FROM generate_series(1,50000) n;
      `);
        const retention = readFileSync(
          'supabase/migrations/20261010221620_dependency_aware_email_queue_retention.sql',
          'utf8'
        );
        await client.query(retention);
        await client.query('ANALYZE public.email_lifecycle_queue');
        const candidateSql = retention.match(
          /SELECT q.id\s+FROM public.email_lifecycle_queue AS q[\s\S]*?LIMIT v_limit/
        )?.[0];
        if (!candidateSql) throw new Error('Retention candidate query missing');
        const query = candidateSql
          .replaceAll('p_terminal_cutoff', "now()-interval '30 days'")
          .replaceAll('p_attribution_cutoff', "now()-interval '90 days'")
          .replaceAll('v_limit', '1000');
        const hasSort = async () => {
          const result = await client!.query(`EXPLAIN (FORMAT JSON) ${query}`);
          return JSON.stringify(result.rows).includes('Sort');
        };
        expect(await hasSort()).toBe(true);
        const before = (await client.query(query)).rows;
        await client.query(
          readFileSync(
            'supabase/migrations/20261011114412_email_queue_prune_order_index.sql',
            'utf8'
          )
        );
        expect(await hasSort()).toBe(false);
        expect((await client.query(query)).rows).toEqual(before);
        expect(before).toHaveLength(1000);
      } finally {
        await client?.end();
        if (started) execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
      }
    }, 60_000);
  }
);
