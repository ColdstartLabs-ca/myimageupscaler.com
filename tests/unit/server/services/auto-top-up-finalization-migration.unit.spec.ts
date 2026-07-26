import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('auto top-up finalization migration', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260711101033_finalize_auto_top_up_attempt.sql'),
    'utf8'
  );

  it('locks the attempt and makes duplicate success a no-op', () => {
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain("IF v_attempt.status = 'succeeded'");
    expect(sql).toContain("IF v_attempt.status <> 'payment_pending'");
  });

  it('atomically grants credits, records the transaction, and releases the matching lease', () => {
    expect(sql).toContain('purchased_credits_balance = purchased_credits_balance + p_credits');
    expect(sql).toContain("'auto_top_up:' || p_payment_intent_id");
    expect(sql).toContain("status = 'succeeded'");
    expect(sql).toContain('charge_claim_id = p_attempt_id');
  });

  it('is restricted to the service role', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION');
  });
});
