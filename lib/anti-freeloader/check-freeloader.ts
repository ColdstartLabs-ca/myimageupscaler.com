/**
 * Check if a user should be blocked from credit-consuming operations.
 *
 * A user is blocked if ALL of these are true:
 * 1. Flagged as a freeloader (is_flagged_freeloader = true)
 * 2. On the free subscription tier (no active subscription)
 * 3. Have not purchased any credits (purchased credits = legitimate paid usage)
 *
 * Paid subscribers and credit purchasers are never blocked.
 */
export function isFreeleaderBlocked(
  profile: {
    is_flagged_freeloader?: boolean | null;
    subscription_tier?: string | null;
    purchased_credits_balance?: number | null;
  } | null
): boolean {
  if (!profile?.is_flagged_freeloader) return false;
  if (profile.subscription_tier !== 'free') return false;
  if ((profile.purchased_credits_balance ?? 0) > 0) return false;
  return true;
}
