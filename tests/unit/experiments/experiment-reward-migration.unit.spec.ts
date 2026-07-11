import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260710000200_idempotent_experiment_rewards.sql'),
  'utf8'
);

describe('idempotent experiment reward migration', () => {
  it('should enforce one reward per purchase and experiment', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS purchase_id TEXT');
    expect(migration).toMatch(
      /UNIQUE INDEX[\s\S]+\(purchase_id, experiment_key\)[\s\S]+WHERE purchase_id IS NOT NULL/
    );
    expect(migration).toMatch(
      /ON CONFLICT \(purchase_id, experiment_key\) WHERE purchase_id IS NOT NULL[\s\S]+DO NOTHING/
    );
  });

  it('should validate assignment and arm before recording', () => {
    expect(migration).toContain("RETURN 'missing_assignment'");
    expect(migration).toContain("RETURN 'invalid_arm'");
    expect(migration).toContain('FROM public.experiment_assignments');
    expect(migration).toContain('FROM public.experiment_arms');
  });

  it('should increment counters only after a successful insert', () => {
    const insertPosition = migration.indexOf('INSERT INTO public.experiment_rewards');
    const duplicatePosition = migration.indexOf("RETURN 'duplicate'");
    const updatePosition = migration.indexOf('UPDATE public.experiment_arms');
    expect(insertPosition).toBeGreaterThan(0);
    expect(duplicatePosition).toBeGreaterThan(insertPosition);
    expect(updatePosition).toBeGreaterThan(duplicatePosition);
    expect(migration).toContain('SET rewards = rewards + p_reward_value');
    expect(migration).toContain('revenue_cents = revenue_cents + p_revenue_cents');
  });

  it('should restrict execution to the service role', () => {
    expect(migration).toContain('FROM authenticated');
    expect(migration).toContain('TO service_role');
  });
});
