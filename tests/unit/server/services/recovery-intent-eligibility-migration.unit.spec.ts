import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260710000500_recovery_intent_eligibility.sql'),
  'utf8'
);

describe('recovery intent eligibility migration', () => {
  it('should store verification, consent, source, and expiry evidence', () => {
    for (const column of [
      'identity_verified_at',
      'consent_basis',
      'source_surface',
      'expires_at',
    ]) {
      expect(migration).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
  });

  it('should constrain consent and index active expiry processing', () => {
    expect(migration).toContain("'email_preferences.marketing_emails'");
    expect(migration).toContain('idx_revenue_recovery_intents_active_expiry');
    expect(migration).toContain("WHERE status = 'active'");
  });
});
