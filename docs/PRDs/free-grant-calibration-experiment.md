# PRD: Free Grant Calibration Experiment

**Date:** 2026-07-25
**Status:** **BLOCKED** — do not launch until §2 entry criteria are met
**Complexity:** 6 → MEDIUM mode
**Owner:** Monetization / Growth
**Source:** [Growth Diagnostic 2026-07-25](../reports/growth-diagnostic-2026-07-25.md) — priority #4 (impact 9 ÷ effort 4 = 2.25)
**Mandatory context:** [rollback-anti-abuse-payment-recovery](./rollback-anti-abuse-payment-recovery.md), [done/free-tier-abuse-prevention](./done/free-tier-abuse-prevention.md), [done/free-account-cumulative-usage-and-escalating-gate](./done/free-account-cumulative-usage-and-escalating-gate.md)

---

## 1. Context

**Hypothesis:** Free users receive 5 credits and the median consumes 1.25. Roughly 93% never approach the limit, so the paywall is structurally unreachable and conversion is capped at ~0.9% regardless of downstream checkout quality. A smaller grant should increase paywall encounters and therefore purchases.

**This PRD does not recommend shipping that change yet.** Investigation surfaced three findings that make an immediate launch unsound.

### 1.1 The prior is negative, not neutral

This site has direct, recent, causal evidence that reducing effective free credits reduces signups _and_ revenue. The 2026-07-17 anti-abuse deploy — which reduced effective free credits for a subset and added a non-dismissible gate — produced a **60-80% payment drop and a ~45% signup drop**, documented in `rollback-anti-abuse-payment-recovery.md`. It was rolled back on 2026-07-22.

Any PRD proposing to reduce free credits must engage with this rather than treat "smaller grant → more paywall hits → more revenue" as self-evident. The mechanism that fired last time was not the one the model predicted.

### 1.2 The baseline is contaminated and has not recovered

Daily signups, production:

| Window           | Organic sessions/day | Signups/day | Signups per session        |
| ---------------- | -------------------- | ----------- | -------------------------- |
| Jul 15-17 (pre)  | —                    | 258         | active/signup 0.637        |
| **Jul 18**       | —                    | 185         | **active/signup 0.205** 🔴 |
| Jul 19-25 (post) | —                    | 149         | active/signup 0.654 ✅     |

**Corrected 2026-07-25:** an earlier version of this section claimed an unresolved signup-conversion regression. That was wrong — an artifact of comparing against a window that straddled a one-day outage. Jul 18 was a single-day SEV-1 (the grant-RPC value mismatch, fixed same day by `99a73485`); active-users-per-signup recovered to baseline on Jul 19 and has held since. Every post-signup ratio is normal.

What remains is a **traffic decline** (GSC clicks −18%, impressions +5%, position improved 12.0 → 10.7 — no ranking penalty), not a funnel break.

**Residual impact on this PRD:** signup volume is ~149/day vs ~258/day pre-Jul-18, so absolute cohort sizes are smaller and arms will take proportionally longer to reach significance. The _funnel_ is sound, so the baseline is usable — but power calculations must assume ~40% fewer signups/day than the pre-Jul-18 rate.

### 1.3 The RPC hard-rejects any new arm value

`supabase/migrations/20260722193018_disable_shared_identity_reduction.sql:31-33`:

```sql
IF p_requested_credits NOT IN (0, 3, 5) THEN
  RAISE EXCEPTION 'Unsupported free credit amount: %', p_requested_credits;
END IF;
```

A 1- or 2-credit arm requires a new migration, **deployed before the app**. Deploying these out of order is exactly what caused the 2026-07-18 SEV-1: the live function accepted only `(0,10)` while the app sent 5/3, producing HTTP 500 on every signup.

Compounding this, `idx_credit_transactions_one_positive_welcome_grant` enforces one positive welcome grant per user forever. **There is no remediation path for a losing arm** — you cannot top users up through the same channel.

### 1.4 Files Analyzed

```
shared/config/credits.config.ts:30-32                    # DEFAULT/RESTRICTED/PAYWALLED free credits
shared/config/subscription.config.ts:46, 287-294         # freeUser block; copy interpolates the constant
lib/anti-freeloader/region-classifier.ts:166-182         # getRegionTier, getFreeCreditsForTier
app/api/users/setup/route.ts:52-81                       # THE injection point; free_credits_reduced telemetry
server/services/free-credit-grant.service.ts:39-56       # claimFreeCreditGrant(req, userId, tier)
supabase/migrations/20260722193018_*.sql                 # live RPC, the 0/3/5 constraint
supabase/migrations/20260718175546_*.sql:11-18           # decision_reason/policy_version + CHECK
lib/experiments/experiment-bandit.service.ts:149, 230    # assignExperimentArm, recordExperimentReward
server/services/revenue-feature-rollout.service.ts:12-19 # FNV-1a bucketing — the pattern to copy
```

---

## 2. Entry Criteria — all must hold before implementation starts

1. ~~Signup conversion recovered.~~ **Met as of 2026-07-25** — active-users-per-signup returned to baseline (0.654 vs 0.637) on Jul 19. Re-verify it still holds at launch; recompute arm sizing for the lower absolute signup volume (§1.2).
2. **The credit wall is instrumented.** [credit-wall-monetization-surface](./credit-wall-monetization-surface.md) Phase 1 shipped and ≥7 days of `credit_wall_shown` data exists. Today we cannot measure how often users hit the wall, so we cannot measure whether a smaller grant increases it.
3. **The full credits-consumed distribution is computed** (§3.1), not just the median.
4. **Lifecycle email is sending again** ([lifecycle-email-queue-eligibility-restoration](./lifecycle-email-queue-eligibility-restoration.md)) — otherwise the `low-credits` / `zero-credits` recovery arm is inert and the experiment measures a deliberately hobbled funnel.

Criteria 2 and 4 are also _cheaper wins in the same funnel_. Do those first regardless.

---

## 3. Pre-Work (do this before deciding arm sizes)

### 3.1 Distribution, not median

The median is 1.25 credits. **The mean and the tail decide this experiment.** If converting users are concentrated in the 3-5 credit range, a 2-credit grant decapitates exactly the cohort that pays.

Required analysis, split by `region_tier` and by whether the user later purchased:

```sql
-- Credits consumed per user, full distribution, post-incident cohort only
WITH u AS (
  SELECT p.id, p.region_tier,
    COALESCE(SUM(CASE WHEN ct.type='usage' THEN -ct.amount END),0) AS used,
    EXISTS (SELECT 1 FROM credit_transactions x
            WHERE x.user_id=p.id AND x.amount>0
              AND x.description ILIKE 'Credit pack purchase%') AS purchased
  FROM profiles p LEFT JOIN credit_transactions ct ON ct.user_id=p.id
  WHERE p.created_at >= '2026-07-18'   -- see §3.2
  GROUP BY 1,2
)
SELECT region_tier, purchased, used, count(*)
FROM u GROUP BY 1,2,3 ORDER BY 1,2,3;
```

**Decision rule:** if the p75 of _converting_ users exceeds the proposed arm size, do not run that arm.

### 3.2 Two data traps

- **`free_credit_grants` rows before 2026-07-18 are backfill with `granted_credits = 0` and do not mean the user received zero.** Those users were granted 5 by the old `handle_new_user` trigger. Every query must filter `created_at >= '2026-07-18'`.
- **The `ten_credit_unique_v1` rows are not a rollout.** All 83 `eligible_unique` rows were written in a 6-second burst on 2026-07-18 18:00 UTC — a cohort repair backfill. The 10-credit policy was live ~80 minutes and was formally revoked.

### 3.3 Model reachability confound

`MODEL_CREDIT_COSTS` means a single job costs 1 credit (real-esrgan) up to 16 (nano-banana-pro `both`). At 3 credits, clarity-upscaler (4) and every premium model become **unreachable at signup**. A smaller grant therefore silently downgrades the first-impression quality ceiling — a different treatment than "fewer uses." Segment activation by model tier or you will misattribute the result.

### 3.4 Copy is derived from the same constant

`subscription.config.ts:46` interpolates `` `${CREDIT_COSTS.DEFAULT_FREE_CREDITS} credits` `` into user-facing features, and `getFreeCreditsForTier` feeds landing-page display. If advertised credits vary by arm, the treatment begins _before_ signup and breaks post-assignment randomization; if held constant, treated users are shown a promise the product does not honor.

**Recommendation: hold copy at the control value and treat the mismatch as a known limitation**, scoped to a small treatment share. The 2026-07-18 incident PRD is explicit that copy promising more credits than granted is a defect.

---

## 4. Solution

### 4.1 Fixed split, not a bandit

Use a rollout table + FNV-1a bucketing (`server/services/revenue-feature-rollout.service.ts:12-19`), **not** Thompson Sampling.

Thompson Sampling converges and starves the control arm. The grant is one-shot and irreversible, so you cannot re-randomize a user, and a premature convergence is permanent for everyone assigned. A fixed 90/10 split ramping to 80/20 gives a clean read and bounds the blast radius.

Use `experiment_arms` / `experiment_assignments` for **bookkeeping only** — the `UNIQUE (experiment_key, context_key, assignment_key)` constraint provides the same one-shot guarantee the grant RPC has.

### 4.2 Server-side assignment only

Assign in `app/api/users/setup/route.ts` via `assignExperimentArm` with `assignmentKey = 'user:' + userId`. **Never** via `client/hooks/useExperimentArm.ts` — the grant is irreversible, must be assigned exactly once, and must not be client-influenceable.

### 4.3 Scope to `standard` region only

Use `context_key = 'standard'`. The `restricted` (3) and `paywalled` (0) tiers are settled anti-abuse decisions with their own conversion evidence; mixing them destroys the read and re-opens closed questions.

### 4.4 Arms

Control `5` vs a single treatment, sized by §3.1. Start with **one** treatment arm. Given §1.1, resist a 3-way split.

### 4.5 Stamp the arm at the source of truth

`free_credit_grants.decision_reason` / `policy_version` are dead columns purpose-built for this (`policy_version = 'grant_size_exp_v1'`, `decision_reason = 'arm_3_credits'`). Drop the `free_credit_grants_ten_credit_policy` CHECK first — it permits only 0/10 for that policy string.

### 4.6 Migration ordering (SEV-1 risk)

The migration relaxing `p_requested_credits NOT IN (0,3,5)` **must be deployed and verified before** any app code sends a new value. Add a deploy guard asserting the live function accepts the arm values the app will send, mirroring `scripts/deploy/verify-stripe-deployment-config.ts`.

---

## 5. Success Metrics & Guardrails

**Primary:** revenue per signup, by arm. Not conversion rate — a smaller grant could raise conversion while lowering revenue per signup if it suppresses signups.

**Secondary:** `credit_wall_shown` per signup (the mechanism), wall → `checkout_opened`, `purchase_confirmed` per signup.

**Guardrails — halt immediately if breached:**

| Guardrail                                 | Baseline                | Halt if                                  |
| ----------------------------------------- | ----------------------- | ---------------------------------------- |
| Active users per signup                   | 0.654 (Jul 19-25)       | treatment < control − 5%                 |
| Activation (≥1 `type='usage'` within 24h) | ~57%                    | treatment < control − 5%                 |
| `image_download` per signup               | 3,983 / 7,796 uploaders | treatment < control − 10%                |
| `processing_failed` / `error_occurred`    | 3,410 / 30d             | any rise (guards the 0/3/5 constraint)   |
| Revenue per signup                        | to be established       | treatment < control − 10% at n≥2,000/arm |

Wire `experiment_arms.guardrail_failures` — the column exists and is unused.

**Note:** the reward path is purchase-only (`recordExperimentReward` requires `purchaseId`). Activation is **not** rewardable through the current API; guardrails 2-4 must be computed from `credit_transactions` + `profiles` directly.

---

## 6. Do Not Relitigate

Settled by prior PRDs — vary the _number_, not the mechanism:

- **One-time, non-renewing grant, single ledger.** No cooldowns, no drip credits, no second ledger, no free-usage status endpoint. (`done/free-account-cumulative-usage-and-escalating-gate.md`)
- **Grant after region classification, never at trigger time.** (`anti-freeloader-v3-account-cycling-prevention.md`)
- **The allowance was never the abuse lever** — 85% of uploaders are casual (1-2 uploads) and _"not a problem, don't add friction for them"_. (`done/free-tier-abuse-prevention.md`)
- **No non-dismissible gate.** (`rollback-anti-abuse-payment-recovery.md`)

---

## 7. Tests That Will Break

Plan for these — they encode the current policy deliberately:

- `tests/unit/anti-freeloader/free-credit-grants-migration.unit.spec.ts` — string-asserts `p_requested_credits NOT IN (0, 3, 5)` (`:63`) and `not.toContain("'ten_credit_unique_v1'")` (`:67`)
- `tests/unit/anti-freeloader/free-credit-grant.service.unit.spec.ts:59` — asserts `p_requested_credits: 5`
- `tests/unit/anti-freeloader/region-classifier.unit.spec.ts:103-112` — asserts 0/3/5 per tier
- `tests/unit/anti-freeloader/users-setup.unit.spec.ts` — extend here for arm assignment

New coverage required: arm assigned exactly once per user; assignment survives setup retry (the 202-pending path); paid accounts never assigned; deploy guard rejects an app/RPC value mismatch.

---

## 8. Risks

| Risk                                           | Likelihood                  | Mitigation                                                                  |
| ---------------------------------------------- | --------------------------- | --------------------------------------------------------------------------- |
| Repeating the Jul-17 revenue collapse          | **Medium-high**             | Entry criteria; 10% treatment; guardrails halt automatically                |
| Migration/app ordering → SEV-1 on every signup | Medium                      | Migration first + deploy guard (§4.6)                                       |
| Losing arm is unremediable                     | **Certain by design**       | Small treatment share; the index makes top-up impossible — accept and bound |
| Measuring the unresolved incident              | **Certain if launched now** | Entry criterion 1                                                           |
| Copy/grant mismatch                            | High                        | §3.4 — hold copy, bound exposure, document                                  |
| Model-reachability confound                    | High                        | §3.3 — segment by model tier                                                |
