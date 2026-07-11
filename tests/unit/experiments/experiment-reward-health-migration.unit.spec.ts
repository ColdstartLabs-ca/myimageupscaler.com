import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20260710000400_experiment_reward_health_report.sql'
  ),
  'utf8'
);

describe('experiment reward health report migration', () => {
  it('should compare caller-supplied paid checkouts with validated assignments and rewards', () => {
    expect(migration).toContain("jsonb_to_recordset(COALESCE(p_paid_checkouts, '[]'::jsonb))");
    expect(migration).toContain('JOIN public.experiment_assignments assignment');
    expect(migration).toContain('assignment.arm_id = supplied.arm_id');
    expect(migration).toContain('LEFT JOIN public.experiment_rewards reward');
    expect(migration).toContain("reward.reward_type = 'purchase_confirmed'");
  });

  it('should enforce the daily 95 percent attribution and zero duplicate gate', () => {
    expect(migration).toContain('>= 0.95');
    expect(migration).toContain('COALESCE(daily_counts.duplicate_count, 0) = 0');
    expect(migration).toContain("AT TIME ZONE 'UTC'");
  });

  it('should remain read-only and service-role-only', () => {
    expect(migration).toContain('LANGUAGE sql');
    expect(migration).toContain('STABLE');
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
    expect(migration).toContain('TO service_role');
    expect(migration).toContain('FROM authenticated');
  });
});
