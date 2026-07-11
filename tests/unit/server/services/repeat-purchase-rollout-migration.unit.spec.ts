import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('repeat purchase rollout migration', () => {
  it('starts staff-only before percentage rollout', () => {
    const createSql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260711001000_repeat_purchase_rollout.sql'),
      'utf8'
    );
    const correctionSql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260711001100_repeat_purchase_staff_only.sql'),
      'utf8'
    );

    expect(createSql).toContain('auto_top_up_percent integer NOT NULL DEFAULT 0');
    expect(createSql).toContain('repeat_purchase_percent integer NOT NULL DEFAULT 0');
    expect(correctionSql).toContain('SET auto_top_up_percent = 0');
    expect(correctionSql).toContain('repeat_purchase_percent = 0');
  });
});
