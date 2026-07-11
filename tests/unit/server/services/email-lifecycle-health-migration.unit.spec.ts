import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260710000300_email_lifecycle_health_report.sql'),
  'utf8'
);

describe('email lifecycle health report migration', () => {
  it('should expose the required seven-day priority metrics', () => {
    expect(migration).toContain("now() - interval '7 days'");
    for (const metric of [
      'sent_count',
      'suppression_count',
      'fallback_count',
      'provider_failure_count',
      'hard_bounce_count',
      'complaint_count',
      'conversion_count',
    ]) {
      expect(migration).toContain(metric);
    }
    expect(migration).toContain('GROUP BY c.priority');
  });

  it('should encode rollout stop thresholds after 500 delivery attempts', () => {
    expect(migration).toContain('m.sent_count + m.provider_failure_count >= 500');
    expect(migration).toContain('> 0.02');
    expect(migration).toContain('> 0.001');
    expect(migration).toContain('> 0.05');
  });

  it('should restrict the report to the service role', () => {
    expect(migration).toContain('FROM authenticated');
    expect(migration).toContain('TO service_role');
  });
});
