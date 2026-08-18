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

## 7. Separate live defect (unrelated to July) — diagnosed and fixed 2026-08-18

`processing_jobs` failures appeared to begin Aug 11, but that is when the edge-failure observation route was added (`a4fc9ab0`, Aug 10), not when the failures began. Two independent causes:

### 7a. Worker out of memory → non-JSON 503 → `edge_error`

Cloudflare Workers analytics shows the `myimageupscaler` Worker hitting `exceededMemory` **~300 times every day**, not just since Aug 11:

| Date   | exceededMemory | successful requests |
| ------ | -------------- | ------------------- |
| Aug 13 | 339            | 21,391              |
| Aug 14 | 295            | 22,853              |
| Aug 15 | 259            | 21,243              |
| Aug 16 | 317            | 21,841              |
| Aug 17 | 298            | 22,434              |

Every `edge_error` row is HTTP **503**, non-JSON, spread across many colos (EZE, BOS, YUL, GRU) — Cloudflare's own error page, not an application response. The DB captured only ~50/day of the ~300 because the client-side reporter is best-effort with a 2s timeout and requires an access token, so **the real damage was ~6x what `processing_jobs` showed**.

Cause: the upscale payload is base64 inside a JSON body, and every validation helper called `imageData.split(',')[1]`, allocating a full copy of a multi-megabyte string. JS strings are UTF-16, so each copy costs ~2 bytes per character. For a 25MB paid-tier image (33.3M base64 chars = 66.6MB per copy) against a 128MB isolate:

| Allocation                                  | Cost    |
| ------------------------------------------- | ------- |
| `req.json()` raw text                       | 66.6 MB |
| parsed JSON string                          | 66.6 MB |
| Zod `.refine()` `split(',')`                | 66.6 MB |
| `route.ts` base64 check `split(',')`        | 66.6 MB |
| `getBase64Size` `split(',')` + `/=/g` match | 66.6 MB |
| `validateMagicBytes` `split(',')`           | 66.6 MB |
| `decodeImageDimensions` `split(',')`        | 66.6 MB |

The size check ran _after_ most of these, so it could never reject anything in time.

Fixed: reject the body from `Content-Length` before `req.json()`; read the payload by offset (`getBase64PayloadOffset` / `getBase64PayloadLength` / `readBase64Prefix`) everywhere else; count base64 padding from the tail. The 413 releases the batch slot, or a user retrying with a smaller image is locked out of their own quota.

**Open architectural limit:** the advertised 25MB paid tier is not achievable with base64-in-JSON on a 128MB Worker — the raw text plus parsed string alone are ~4 bytes per body byte. The body cap is 24MB (~18MB image). Raising it needs direct-to-storage upload, not a bigger constant.

### 7b. `replicate_image_too_large` — already fixed

`70022404` and `f5f0eac5` (Aug 17) diagnosed this as CUDA OOM from GPU contention being mislabelled as an oversized image, plus oversized Quick 2x requests being rerouted to a 14x more expensive model. Shipped in the Aug 17 deploy: **33 failures on Aug 17 → 2 on Aug 18**.

## 7c. Second blocking auth path — fixed 2026-08-18

`route.ts` returned 202 `setupStatus: 'pending'` when a free profile could not be classified. `completeAccountSetup` retried three times with no backoff and then threw, and every auth call site treats a throw as fatal — the same blocking shape as the 404/500. Pending is now retried with backoff (150ms, 400ms) and returned rather than thrown; the upscale route already models a pending profile via `isAccountSetupPending`.

## 7d. Sweep of everything else from `229b6b87` — clean

Audited and cleared: `PurchaseModal` is dismissible three ways and `hardGate` is gone from the codebase; `upgrade-prompt-dismissals` feeds an analytics property only and gates nothing; `useBatchQueue` handles `FreeLimitExceededError` and `BatchLimitError` as item-level errors with a dismissible toast; the `credit-manager` change is additive error metadata; `isAccountSetupPending` self-clears once any grant row exists, so it cannot latch.

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

1. **Uploads must move off base64-in-JSON.** The 25MB paid tier cannot work on a 128MB Worker (§7a). Until direct-to-storage upload exists, the effective ceiling is ~18MB and larger images get a clean 413 instead of a silent 503. This is the only known unresolved product gap from this investigation.
2. **Re-justify the abuse prevention.** Any future tightening should be checked against the signups-per-IP series in §3 first.
3. **Watch signups per organic click weekly.** Recovery toward 0.7–0.8 confirms the fix; no movement within two weeks means a further blocker remains.
4. **Watch `exceededMemory` in Cloudflare Workers analytics.** It should fall from ~300/day toward zero. It is the honest counter — `processing_jobs` only ever captured ~1 in 6.

## 11. Closed in this investigation

| Item                                               | Commit                 |
| -------------------------------------------------- | ---------------------- |
| `/api/users/setup` 404/500 hard-fails              | `6d3a1946`             |
| Worker OOM on image upload (`edge_error` 503s)     | `0e9c7140`             |
| 202 `pending` blocking the auth gate               | `0e9c7140`             |
| `replicate_image_too_large` (CUDA OOM mislabelled) | `70022404`, `f5f0eac5` |
| Sweep of all other `229b6b87` surfaces             | clean, §7d             |
