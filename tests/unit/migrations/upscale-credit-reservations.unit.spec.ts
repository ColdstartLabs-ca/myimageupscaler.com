import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260826120000_upscale_input_storage_and_credit_reservations.sql'
);

describe('upscale input storage and durable credit reservations migration', () => {
  const sql = () => readFileSync(migrationPath, 'utf8');

  it('creates a private temporary input bucket', () => {
    expect(sql()).toContain("'upscale-inputs'");
    expect(sql()).toContain('public = false');
  });

  it('atomically links each debit to a durable reservation', () => {
    const migration = sql();
    expect(migration).toContain('CREATE TABLE public.processing_credit_reservations');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.consume_credits_v3');
    expect(migration).toContain('usage_transaction_id UUID NOT NULL UNIQUE');
    expect(migration).toContain('INSERT INTO public.processing_credit_reservations');
    expect(migration).toContain(
      'IF EXISTS (SELECT 1 FROM public.processing_credit_reservations WHERE job_id = p_job_id)'
    );
    expect(migration).toContain("RAISE EXCEPTION 'Reservation already exists: %', p_job_id");
  });

  it('makes completion and refund one-way idempotent transitions', () => {
    const migration = sql();
    expect(migration).toContain("status = 'processing'");
    expect(migration).toContain('complete_processing_credit_reservation');
    expect(migration).toContain('refund_processing_credit_reservation');
    expect(migration).toContain("SET status = 'completed'");
    expect(migration).toContain("SET status = 'refunded'");
  });

  it('claims stale reservations with row locking and preserves source pools', () => {
    const migration = sql();
    expect(migration).toContain('reconcile_stale_credit_reservations');
    expect(migration).toContain('FOR UPDATE SKIP LOCKED');
    expect(migration).toContain('consumed_subscription');
    expect(migration).toContain('consumed_purchased');
  });

  it('revokes all reservation mutation access from public client roles', () => {
    const migration = sql();
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(migration).toContain(`FROM ${role}`);
    }
    expect(migration).toContain('TO service_role');
  });
});
