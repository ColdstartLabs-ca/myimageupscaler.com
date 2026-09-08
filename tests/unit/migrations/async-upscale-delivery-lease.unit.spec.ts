import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const leaseMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260907000200_async_upscale_delivery_leases.sql'),
  'utf8'
);
const outputRoute = readFileSync(join(process.cwd(), 'app/api/upscale/output/route.ts'), 'utf8');

describe('async delivery lease contract', () => {
  it('keeps a delivery lease strictly longer than the output stream deadline', () => {
    const outputDeadlineMs = Number(
      (/const OUTPUT_FETCH_TIMEOUT_MS = ([\d_]+);/.exec(outputRoute)?.[1] ?? '').replaceAll(
        '_',
        ''
      ) || NaN
    );
    const leaseDurationMinutes = Number(
      /v_lease_expires_at := LEAST\(v_row\.delivery_deadline_at, now\(\) \+ INTERVAL '(\d+) minutes'\)/.exec(
        leaseMigration
      )?.[1] ?? NaN
    );

    expect(outputDeadlineMs).toBe(120_000);
    expect(leaseDurationMinutes * 60_000).toBeGreaterThan(outputDeadlineMs);
    expect(leaseMigration).toMatch(
      /v_row\.delivery_deadline_at <= now\(\) \+ INTERVAL '2 minutes'/
    );
  });
});
