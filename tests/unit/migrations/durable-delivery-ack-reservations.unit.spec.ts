import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260826143000_durable_delivery_ack_reservations.sql'
);

const sql = () => readFileSync(migrationPath, 'utf8');

describe('durable delivery acknowledgement reservation migration', () => {
  it('adds delivery token hash and output staging columns without editing the applied reservation migration', () => {
    const migration = sql();
    expect(migration).toContain('ALTER TABLE public.processing_credit_reservations');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS delivery_token_hash TEXT');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS output_staged_at TIMESTAMPTZ');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS delivery_attempted_at TIMESTAMPTZ');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ');
  });

  it('stages provider output while leaving the reservation processing', () => {
    const migration = sql();
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.record_processing_credit_reservation_output'
    );
    expect(migration).toContain("AND status = 'processing'");
    expect(migration).toContain("status = 'processing'");
    expect(migration).not.toContain(
      "record_processing_credit_reservation_output%SET status = 'completed'"
    );
  });

  it('retrieves exact staged output for processing or completed matching capabilities and touches delivery attempts', () => {
    const migration = sql();
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.retrieve_processing_credit_reservation_output'
    );
    expect(migration).toContain("r.status IN ('processing', 'completed')");
    expect(migration).toContain('delivery_attempted_at = now()');
    expect(migration).toContain('r.delivery_token_hash IS NOT DISTINCT FROM p_delivery_token_hash');
  });

  it('acknowledges only exact user, job, output, and token hash matches idempotently', () => {
    const migration = sql();
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.acknowledge_processing_credit_reservation'
    );
    expect(migration).toContain('delivery_token_hash IS NOT DISTINCT FROM p_delivery_token_hash');
    expect(migration).toContain('p_delivery_token_hash IS NULL');
    expect(migration).toContain('v_reservation.delivery_token_hash IS NULL');
    expect(migration).toContain('delivery_token_hash IS DISTINCT FROM p_delivery_token_hash');
    expect(migration).toContain('output_expires_at IS NOT DISTINCT FROM p_output_expires_at');
    expect(migration).toContain("IF v_reservation.status = 'completed' THEN");
    expect(migration).toContain('RETURN TRUE');
    expect(migration).toContain("IF v_reservation.status <> 'processing' THEN");
    expect(migration).toContain('RETURN FALSE');
  });

  it('revokes obsolete pre-response completion bypass and grants only service role RPCs', () => {
    const migration = sql();
    expect(migration).toContain(
      'DROP FUNCTION IF EXISTS public.complete_processing_credit_reservation'
    );
    for (const fn of [
      'record_processing_credit_reservation_output(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT)',
      'retrieve_processing_credit_reservation_output(UUID, UUID, TEXT)',
      'acknowledge_processing_credit_reservation(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT)',
      'reconcile_stale_credit_reservations(TIMESTAMPTZ, INTEGER)',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM anon`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM authenticated`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role`);
    }
  });
});
