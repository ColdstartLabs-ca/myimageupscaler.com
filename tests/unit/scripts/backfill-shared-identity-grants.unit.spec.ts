import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildBackfillManifest,
  hashBackfillManifest,
  type IGrantCandidate,
} from '@/scripts/one-off/backfill-shared-identity-grants';

const baseCandidate: IGrantCandidate = {
  userId: '00000000-0000-0000-0000-000000000001',
  createdAt: '2026-07-18T12:00:00.000Z',
  regionTier: 'standard',
  subscriptionTier: null,
  subscriptionBalance: 0,
  purchasedBalance: 0,
  grantedCredits: 0,
};

describe('shared-identity grant backfill manifest', () => {
  it('should select free users below their region-tier credit amount', () => {
    const manifest = buildBackfillManifest([
      baseCandidate,
      { ...baseCandidate, userId: 'restricted', regionTier: 'restricted', grantedCredits: 0 },
      { ...baseCandidate, userId: 'already-full', grantedCredits: 5 },
      { ...baseCandidate, userId: 'paid', subscriptionTier: 'hobby' },
      { ...baseCandidate, userId: 'paywalled', regionTier: 'paywalled' },
    ]);

    expect(manifest).toEqual([
      expect.objectContaining({ userId: baseCandidate.userId, targetCredits: 5, delta: 5 }),
      expect.objectContaining({ userId: 'restricted', targetCredits: 3, delta: 3 }),
    ]);
  });

  it('should include paywalled users at five credits only when explicitly enabled', () => {
    const candidate = {
      ...baseCandidate,
      userId: 'paywalled',
      regionTier: 'paywalled',
      grantedCredits: 0,
    };

    expect(buildBackfillManifest([candidate])).toEqual([]);
    expect(buildBackfillManifest([candidate], { includePaywalledFive: true })).toEqual([
      expect.objectContaining({ userId: 'paywalled', targetCredits: 5, delta: 5 }),
    ]);
  });

  it('should produce a stable manifest hash independent of source row order', () => {
    const second = { ...baseCandidate, userId: '00000000-0000-0000-0000-000000000002' };

    const firstHash = hashBackfillManifest(buildBackfillManifest([baseCandidate, second]));
    const secondHash = hashBackfillManifest(buildBackfillManifest([second, baseCandidate]));

    expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
    expect(secondHash).toBe(firstHash);
  });
});

describe('shared-identity grant repair migration', () => {
  const migration = readFileSync(
    'supabase/migrations/20260722193411_create_shared_identity_repair_rpc.sql',
    'utf8'
  );

  it('should require an exact reviewed manifest and unchanged balances', () => {
    expect(migration).toContain("p_manifest_hash !~ '^[a-f0-9]{64}$'");
    expect(migration).toContain(
      'v_subscription_balance IS DISTINCT FROM p_expected_subscription_balance'
    );
    expect(migration).toContain('v_existing_grant IS DISTINCT FROM p_expected_granted_credits');
    expect(migration).toContain("v_subscription_tier <> 'free'");
  });

  it('should record an idempotent credit transaction and restrict execution', () => {
    expect(migration).toContain("'shared_identity_grant_repair_20260722:'");
    expect(migration).toContain("'no_op'::TEXT");
    expect(migration).toContain('FROM authenticated;');
    expect(migration).toContain('TO service_role;');
  });

  it('should remove the temporary repair entry point after the backfill', () => {
    const cleanup = readFileSync(
      'supabase/migrations/20260722193511_drop_shared_identity_repair_rpc.sql',
      'utf8'
    );

    expect(cleanup).toContain('DROP FUNCTION IF EXISTS public.repair_shared_identity_grant(');
  });
});
