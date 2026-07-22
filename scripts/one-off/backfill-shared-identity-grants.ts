import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

const INCIDENT_START = '2026-07-18T00:00:00.000Z';

export interface IGrantCandidate {
  userId: string;
  createdAt: string;
  regionTier: string | null;
  subscriptionTier: string | null;
  subscriptionBalance: number;
  purchasedBalance: number;
  grantedCredits: number;
}

export interface IBackfillManifestItem {
  userId: string;
  regionTier: string | null;
  expectedSubscriptionBalance: number;
  expectedPurchasedBalance: number;
  expectedGrantedCredits: number;
  targetCredits: number;
  delta: number;
}

interface IManifestOptions {
  includePaywalledFive?: boolean;
}

interface IRawGrantRow {
  user_id: string;
  granted_credits: number;
  created_at: string;
  profiles:
    | {
        region_tier: string | null;
        subscription_tier: string | null;
        subscription_credits_balance: number;
        purchased_credits_balance: number;
      }
    | Array<{
        region_tier: string | null;
        subscription_tier: string | null;
        subscription_credits_balance: number;
        purchased_credits_balance: number;
      }>;
}

function tierTargetCredits(regionTier: string | null, includePaywalledFive: boolean): number {
  if (regionTier === 'standard') return 5;
  if (regionTier === 'restricted') return 3;
  return includePaywalledFive ? 5 : 0;
}

export function buildBackfillManifest(
  candidates: IGrantCandidate[],
  options: IManifestOptions = {}
): IBackfillManifestItem[] {
  const includePaywalledFive = options.includePaywalledFive ?? false;

  return candidates
    .filter(
      candidate => candidate.subscriptionTier === null || candidate.subscriptionTier === 'free'
    )
    .map(candidate => {
      const targetCredits = tierTargetCredits(candidate.regionTier, includePaywalledFive);
      return {
        userId: candidate.userId,
        regionTier: candidate.regionTier,
        expectedSubscriptionBalance: candidate.subscriptionBalance,
        expectedPurchasedBalance: candidate.purchasedBalance,
        expectedGrantedCredits: candidate.grantedCredits,
        targetCredits,
        delta: targetCredits - candidate.grantedCredits,
      };
    })
    .filter(item => item.delta > 0)
    .sort((left, right) => left.userId.localeCompare(right.userId));
}

export function hashBackfillManifest(manifest: IBackfillManifestItem[]): string {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

async function fetchCandidates(): Promise<IGrantCandidate[]> {
  const { data, error } = await supabaseAdmin
    .from('free_credit_grants')
    .select(
      'user_id, granted_credits, created_at, profiles!inner(region_tier, subscription_tier, subscription_credits_balance, purchased_credits_balance)'
    )
    .gte('created_at', INCIDENT_START)
    .not('user_id', 'is', null);

  if (error) throw new Error(`Failed to load grant candidates: ${error.message}`);

  return ((data ?? []) as unknown as IRawGrantRow[]).map(row => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (!profile) throw new Error(`Missing profile join for grant ${row.user_id}`);

    return {
      userId: row.user_id,
      createdAt: row.created_at,
      regionTier: profile.region_tier,
      subscriptionTier: profile.subscription_tier,
      subscriptionBalance: profile.subscription_credits_balance,
      purchasedBalance: profile.purchased_credits_balance,
      grantedCredits: row.granted_credits,
    };
  });
}

function readManifestHash(args: string[]): string | null {
  const index = args.indexOf('--manifest-hash');
  return index >= 0 ? (args[index + 1] ?? null) : null;
}

async function applyManifest(
  manifest: IBackfillManifestItem[],
  manifestHash: string,
  includePaywalledFive: boolean
): Promise<void> {
  for (const item of manifest) {
    const { data, error } = await supabaseAdmin.rpc('repair_shared_identity_grant', {
      p_user_id: item.userId,
      p_expected_subscription_balance: item.expectedSubscriptionBalance,
      p_expected_purchased_balance: item.expectedPurchasedBalance,
      p_expected_granted_credits: item.expectedGrantedCredits,
      p_target_granted_credits: item.targetCredits,
      p_include_paywalled_five: includePaywalledFive,
      p_manifest_hash: manifestHash,
    });

    if (error) throw new Error(`Repair failed for ${item.userId}: ${error.message}`);

    const result = Array.isArray(data) ? data[0] : data;
    if (!result || !['applied', 'no_op'].includes(result.repair_status)) {
      throw new Error(`Repair precondition changed for ${item.userId}`);
    }

    console.log(`${item.userId}: ${result.repair_status} (+${result.applied_delta})`);
  }
}

export async function main(args: string[]): Promise<void> {
  const apply = args.includes('--apply');
  const includePaywalledFive = args.includes('--include-paywalled-five');
  const candidates = await fetchCandidates();
  const manifest = buildBackfillManifest(candidates, { includePaywalledFive });
  const manifestHash = hashBackfillManifest(manifest);
  const totalDelta = manifest.reduce((sum, item) => sum + item.delta, 0);

  console.log(JSON.stringify(manifest, null, 2));
  console.log(`Users: ${manifest.length}`);
  console.log(`Total credit delta: ${totalDelta}`);
  console.log(`Manifest SHA-256: ${manifestHash}`);

  if (!apply) {
    console.log('Dry run only. Re-run with --apply --manifest-hash <hash> after review.');
    return;
  }

  const approvedHash = readManifestHash(args);
  if (approvedHash !== manifestHash) {
    throw new Error('The supplied manifest hash does not match the current production cohort');
  }

  await applyManifest(manifest, manifestHash, includePaywalledFive);

  const remaining = buildBackfillManifest(await fetchCandidates(), { includePaywalledFive });
  if (remaining.length > 0) {
    throw new Error(`${remaining.length} eligible grant repairs remain after the apply run`);
  }

  console.log(`Backfill complete: ${manifest.length} users, ${totalDelta} credits applied.`);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
