import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260711060036_email_campaign_priority.sql'),
  'utf8'
);

describe('email campaign priority migration', () => {
  it('should preserve numeric ordering as sort_priority', () => {
    expect(migration).toContain('RENAME COLUMN priority TO sort_priority');
  });

  it('should constrain every typed priority value', () => {
    expect(migration).toContain(
      "CHECK (priority IN ('transactional', 'revenue_critical', 'lifecycle', 'education'))"
    );
  });

  it('should backfill transactional, education, revenue, and lifecycle campaigns', () => {
    expect(migration).toContain("WHEN email_type = 'transactional' THEN 'transactional'");
    expect(migration).toContain("WHEN category = 'blog_education' THEN 'education'");
    for (const key of [
      'low-credits',
      'zero-credits',
      'checkout-abandoned-24h',
      'credit-wall-dismissed-48h',
      'high-usage-free-user',
      'winback-former-buyer-45d',
    ]) {
      expect(migration).toContain(`'${key}'`);
    }
    expect(migration).toContain("ELSE 'lifecycle'");
  });

  it('should index campaign priority and globally order the due-queue RPC', () => {
    expect(migration).toContain('idx_email_lifecycle_campaigns_priority');
    expect(migration).toContain('get_due_email_lifecycle_queue');
    expect(migration).toMatch(
      /ORDER BY\s+CASE c\.priority[\s\S]+c\.sort_priority DESC,[\s\S]+q\.scheduled_for ASC/
    );
  });
});
