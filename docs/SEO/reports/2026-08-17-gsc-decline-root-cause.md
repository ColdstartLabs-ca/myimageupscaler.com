# GSC Decline — Root Cause Investigation

**Date:** 2026-08-17
**Trigger:** "GSC clicks/impressions keep tanking — is it just SEO lag?"
**Verdict:** Not SEO. Deploy `229b6b87` (Jul 17 2026, 19:20 PDT, _"feat: prevent free tier credit abuse"_) halved signup conversion. The abuse it was built to stop does not exist in the data.

---

## 1. Headline

Two separable things happened. Only one is a defect.

| Effect                                                   | Verdict                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| Brand-query clicks fell back to their April/May baseline | **Expected.** A Jun–Jul spike ended. Position held at 1.0 throughout. |
| Non-brand organic clicks near all-time high              | **Healthy.** SEO is working.                                          |
| Signups per organic click fell 0.83 → 0.44               | **Defect.** Shipped Jul 17, never recovered.                          |

---

## 2. The decisive metric

Signups per GSC organic click, by week. Google counts the clicks; the database counts the `profiles` rows. Neither side can be distorted by our own instrumentation.

| Week            | Jun 20 | Jun 27 | Jul 04 | Jul 11 | **Jul 18** | Jul 25 | Aug 01 | Aug 08 |
| --------------- | ------ | ------ | ------ | ------ | ---------- | ------ | ------ | ------ |
| Signups / click | 0.83   | 0.79   | 0.74   | 0.63   | **0.48**   | 0.50   | 0.42   | 0.44   |

−47%, stepping at the deploy week, flat since. Against GA4 total sessions the same ratio falls 0.31 → 0.22 (−29%).

Absolute signups (`profiles.created_at`): **~258/day → ~103/day**.

## 3. The abuse never existed

Signups per distinct signup IP, computed weekly from `free_credit_grants` (including the migration's backfill of every account since Jan 21):

| Period                | Signups / IP | % of signups on an IP with 3+ accounts |
| --------------------- | ------------ | -------------------------------------- |
| Feb–Mar 2026          | 1.00 – 1.03  | 0.0 – 2.2%                             |
| Apr–May 2026          | 1.02 – 1.05  | 1.1 – 4.5%                             |
| Jun–Jul (the "surge") | **1.02**     | **0.7 – 1.0%**                         |
| Aug 2026              | 1.01 – 1.03  | 0.9 – 1.7%                             |

There is no week in 2026 where multi-accounting is visible. The surge weeks were _less_ IP-concentrated than April.

## 4. The blocking chain

`/api/users/setup` gained two hard-fail returns in `229b6b87`, where the pre-deploy path was best-effort and non-blocking:

```
app/api/users/setup/route.ts:57   return 404  'Profile not found'
app/api/users/setup/route.ts:90   return 500  'Failed to grant free credits'
```

The client gates authentication on a terminal setup decision:

```
client/utils/account-setup.ts        3 rapid retries, no backoff, then throws
app/[locale]/auth/callback/page.tsx:37  catch → setStatus('error')  → never redirects
app/[locale]/auth/confirm/page.tsx:24   same
client/store/auth/authOperations.ts:37,92  throws out of signIn / signUp
```

Net effect: a transient server-side failure leaves the user with a valid Supabase account, an error screen, and no way into the app.

The Jul 18 emergency migrations (`fix_claim_grant_column_ambiguity`, `free_grant_incident_repair_rpc`) confirm the grant RPC was throwing for everyone on day one. The Jul 22 rollback (`1c95953c`) removed the non-dismissible paywall gate but left both hard-fail returns in place — which is why it did not recover.

## 5. What the traffic actually did

Brand vs non-brand GSC clicks per week (queried day-by-day; see pitfall in §8):

| Week of | Brand clicks   | Non-brand clicks |
| ------- | -------------- | ---------------- |
| May 16  | 96             | 55               |
| Jun 20  | 465            | 490              |
| Jul 11  | **767 (peak)** | 822              |
| Jul 18  | 359            | 858              |
| Aug 08  | 189            | 610              |

Brand clicks per 28 days: Apr 20–May 16 = 1,197 → Jun 20–Jul 17 = 2,569 → Jul 18–Aug 14 = **1,099**. The "collapse" is a return to the pre-June baseline, at unchanged position 1.0, with a geographically diffuse distribution in every window (no single country or device vanished).

The spike produced no revenue: signups rose +112% (883 → 1,876/week) while weekly purchases stayed flat (~12–24/week all year).

## 6. Ruled out — with data

| Hypothesis                                                   | Refuted by                                                                                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Retention / churn collapse                                   | Returning active users are **flat**: ~21/day before → ~18/day now                                                                         |
| Ranking loss on brand terms                                  | Position 1.0 in every window                                                                                                              |
| CGNAT / shared-IP over-blocking in `claim_free_credit_grant` | Only 4.2% of post-deploy grants share a `network_hash` at all                                                                             |
| Migration backfill poisoning the 90-day match                | Only 0.6% of 0-credit grants match a backfilled row                                                                                       |
| Region-tier or credit-value change                           | The 45/30/25% split of 5/3/0 credits exactly tracks the unchanged standard/restricted/paywalled mix; `CREDIT_COSTS` (5/3/0) predates June |
| Shared-identity credit reduction                             | `free_credits_reduced` fired **1 time total** since Jul 18                                                                                |
| Paid advertising stopped                                     | GA4 has no paid channel                                                                                                                   |
| New signups fail to activate                                 | Activation is fine: 60% before → 66% now                                                                                                  |

## 7. Separate live defect (unrelated to July)

`processing_jobs` failures begin Aug 11 and spike to **92 on Aug 17**. Failure rate ~6.8% of jobs in the Aug 1–16 window.

| Error                            | Count |
| -------------------------------- | ----- |
| `edge_error`                     | 115   |
| `replicate_image_too_large`      | 109   |
| `batch_limit_exceeded`           | 16    |
| `insufficient_effective_credits` | 11    |

Not investigated further in this pass.

## 8. Measurement traps found

Anyone re-running this analysis will hit these:

1. **`account_created` was redefined** in `229b6b87` — now gated on `!alreadySetup && !grant?.existingGrant`. It undercounts real signups. Use `profiles.created_at` as ground truth.
2. **`image_uploaded` tracking was deleted** from `addFiles` in `useBatchQueue.ts` by the same commit (restored Jul 22). The apparent 82% upload collapse on Jul 18 is partly a tracking removal; `credit_transactions` confirms Jul 18 was still a real one-day outage.
3. **GSC `dimensions: ["date","query"]` with `rowLimit: 25000` silently truncates** across a 30-day pull — rows come back clicks-descending, so later dates lose their long tail and appear to collapse. Query day-by-day.
4. **Site-wide GSC average position and impressions are meaningless here.** One query, `how to fix pixelated photos`, contributes ~86k impressions for 3 clicks. Excluding it, impressions grew +4.8%, not +22%, and the position "decline" largely disappears.

## 9. Fix applied

`app/api/users/setup/route.ts` — both hard-fail returns are now non-blocking:

- Missing profile row → logged, returns terminal success with `creditGrantDeferred: true`. The next setup call (sign-in or auth state change) classifies the profile and grants credits.
- Grant failure → logged, setup continues. `claim_free_credit_grant` is idempotent per user, so the next setup call retries safely.

Tests added in `tests/unit/anti-freeloader/users-setup.unit.spec.ts` (verified red against the previous behavior, green after): profile-missing completes, grant-failure completes, and no false `creditGrantDeferred` on the success path.

## 10. Open items

1. **The 202 `setupStatus: 'pending'` path** (`route.ts:77-83`) is still a blocker of the same shape — the client retries 3× with no backoff, then throws, and the user never enters the app. Left in place deliberately; needs a product decision.
2. **`processing_jobs` failure spike** since Aug 11 (§7).
3. **Re-justify the abuse prevention.** Any future tightening should be checked against the signups-per-IP series in §3 first.
4. **Watch signups per organic click weekly.** Recovery toward 0.7–0.8 confirms the fix; no movement within two weeks means a second blocker remains.
