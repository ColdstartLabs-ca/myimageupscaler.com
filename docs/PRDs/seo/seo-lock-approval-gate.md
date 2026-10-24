# PRD-seo-lock-approval-gate — SEO lock with signed-commit approval

**Status:** PROPOSED
**Priority:** P1 — no gate exists today: any agent (Claude Code, Codex, Hermes cron) can change a page that earns traffic and update its test in the same commit (AC-1 to AC-6 open).
**Complexity:** 7 → HIGH; risk override: none (breakdown: 6 implementation files +2, new module +2, crosses the CI deploy boundary +2, GitHub API +1)
**Owner:** SEO dev agent; João owns the signing key and every lock value change.
**Depends on:** None. Followed by [PRD-seo-lock-monitoring](seo-lock-monitoring.md) and [PRD-pseo-split-testing](pseo-split-testing.md).

## Context
Principle (João, 2026-10-23): "let your winners run, cut your losses quickly." Pages that earn traffic must not change unless João approves. Each approved change is a small bet with a stop-loss (the stop-loss is in PRD-seo-lock-monitoring).

Facts checked on 2026-10-23:
- ❌ `master` has no branch protection (`gh api .../branches/master/protection` → 404).
- ❌ All agents commit as João. 49 of the last 50 commits are unsigned.
- ✅ The `gh` token scopes are `gist, read:org, repo, workflow`. They do not include `admin:ssh_signing_key`, so agents cannot register a new signing key.
- ✅ `.github/workflows/deploy.yml` deploys on push to `master` (job `deploy`, `npx next build --webpack` at line 92). `yarn deploy` (`scripts/deploy/deploy.sh`) can also deploy locally.
- ✅ Blog posts are in Supabase. Agents change them through `PATCH /api/blog/posts/[slug]` (`app/api/blog/posts/[slug]/route.ts:63`, `x-api-key` auth).
- ⚠️ `tests/unit/seo/` has 144 files. About 1,130 lines (13 files) are per-edit pins, one test per change (list in Phase 3). Each new edit adds a regex test, and an agent can change both the page and its pin.
- Precedent for a generated, committed SEO artifact: `content/seo-equity.json` (generator `scripts/seo/generate-seo-equity-snapshot.ts`).
- Industry practice (from memory, not verified today): pre-deploy crawl diff (Lumar Protect, Screaming Frog compare) and field-level edit permissions. This PRD covers both layers. The signed commit replaces the CMS role, because our editors are agents with João's credentials.

## Solution
Three parts. Each part sits at a choke point that every tool must go through.

1. **Lock.** `content/seo-lock.json` holds one entry for each URL with more than 20 GSC clicks in 28 days. The set includes locale URLs. Each entry stores normalized fields: `title`, `description`, `h1`, `introHash` (SHA-256 of the normalized first paragraph), `canonical`, `robots`, `hreflang` (sorted list), `jsonLdTypes` (sorted list), plus `source: "code" | "db"` and `clicks28d`. `yarn seo:lock:regen` makes it from GSC data (local key, read-only) and rendered HTML.
2. **Deploy gate.** `scripts/seo/seo-lock-gate.ts` runs after `next build` in the `deploy.yml` deploy job and in `deploy.sh`. It applies two rules:
   - **R1 render:** it starts the built app, fetches each locked path, extracts the fields with the same normalizer, and fails on any mismatch.
   - **R2 approval:** let S be the newest commit that touched the lock and has an SSH signature that verifies against João's GitHub SSH signing keys (public `GET /users/jonit-dev/ssh_signing_keys` → temp `allowed_signers` → `git verify-commit`). Every later commit that touches the lock must be additions-only: no entry removed and no existing value changed.
3. **Blog API gate.** `PATCH /api/blog/posts/[slug]` rejects a change to a locked field of a locked slug with 409, unless the new value equals the lock value in the deployed bundle.

The approved-change flow (for example, a January title change from "2026" to "2027"):

```mermaid
sequenceDiagram
  participant J as João
  participant G as Git / CI gate
  participant W as Worker (prod)
  participant DB as Supabase
  J->>G: edit lock values, git commit -S (passphrase)
  G->>G: R2 passes (signed). R1: code entry matches the new build. A db entry still has the old value, so R1 warns (pending apply).
  G->>W: deploy (bundle contains the new lock)
  J->>W: PATCH blog post with the new values
  W->>DB: allowed, because the values equal the bundled lock
```

Shared code: `lib/seo/seo-lock.ts` (types, `extractSeoFields(html)`, `normalize`, `diffLock`) is used by the regen script, the gate and the blog route. The blog route uses only the lock lookup, not HTML parsing (10ms CPU limit).

Signing setup (owner): a dedicated ed25519 key with a passphrase, registered on GitHub as a signing key only. The key stays out of `ssh-agent` and the desktop keyring. João signs lock commits with `git commit -S`. Normal commits stay unsigned (`commit.gpgsign=false`).

## Acceptance Criteria
- [ ] AC-1 [local]: `yarn seo:lock:regen` writes `content/seo-lock.json` with every URL that has more than 20 clicks in 28 days, and each entry has all 8 fields. proof: `yarn seo:lock:regen && yarn vitest run tests/unit/seo/seo-lock.unit.spec.ts` (schema + entry count equal to the GSC rows above the threshold) — Evidence: pending.
- [ ] AC-2 [local]: A candidate build that changes a locked title fails the gate, and the gate output shows the diff. The unchanged build passes. proof: `yarn vitest run tests/unit/seo/seo-lock-gate.unit.spec.ts` (fixture HTML) plus one real run of `npx tsx scripts/seo/seo-lock-gate.ts` against `next start` on the local build — Evidence: pending.
- [ ] AC-3 [local]: An unsigned commit that changes a lock value fails R2. A commit made through the GitHub contents API (web-flow GPG, `verified: true`) also fails R2. An unsigned additions-only commit passes R2. proof: `yarn vitest run tests/unit/seo/seo-lock-gate.unit.spec.ts` (temp git repo fixture with a test signing key) — Evidence: pending.
- [ ] AC-4 [local]: A blog PATCH that changes the title of a locked slug returns 409. The same PATCH with the lock value returns 200. A PATCH to a slug that is not locked works as before. proof: `yarn vitest run tests/unit/api/blog-posts-seo-lock.unit.spec.ts` (through the route handler) — Evidence: pending.
- [ ] AC-5 [shared]: The `deploy.yml` deploy job runs the gate after `next build`, and a gate failure stops the deploy step. proof: GitHub Actions run on the first push that contains the gate — Evidence: pending.
- [ ] AC-6 [local]: The per-edit pin tests in Phase 3 are deleted, and each deleted assertion is covered by a lock entry or moved to a general test. `yarn test:unit` passes. proof: `yarn vitest run tests/unit/seo` + `yarn verify` — Evidence: pending.

## Blocked on
- A dedicated SSH signing key with a passphrase, registered on GitHub as a signing key and kept out of `ssh-agent` — unblocked by João. ⚠️ Use a passphrase that is not in any chat transcript, because agents can read `~/.claude/projects`.
- The first signed baseline commit of `content/seo-lock.json` — unblocked by João (`git commit -S`).

## Integration Ledger
| Capability | Reachable consumer/trigger | Replaces / disposition | Evidence |
|---|---|---|---|
| Deploy blocks on locked-field drift | push to `master` → `.github/workflows/deploy.yml` job `deploy`, after the `next build` step (line 92) → `scripts/seo/seo-lock-gate.ts` | New gate. Per-edit pin tests are deleted in Phase 3 | AC-2, AC-5 |
| Local deploy blocks the same way | `yarn deploy` → `scripts/deploy/deploy.sh` → same gate script | New | AC-2 |
| Lock change needs João's signature | same gate, rule R2 | Replaces "edit the pin test" approval | AC-3 |
| Blog edits respect the lock | `PATCH /api/blog/posts/[slug]` (`app/api/blog/posts/[slug]/route.ts:63`) | Adds a check before `updateBlogPostSchema` writes | AC-4 |
| Auto-tweakers propose, not edit | `.claude/skills/three-kings-manager/SKILL.md`, `blog-opportunities-publisher` | EDIT_NOW on a locked URL becomes a proposal in the weekly digest (PRD-seo-lock-monitoring) | Doc change, enforced by AC-3 and AC-4 |

## Decisions
- 2026-10-23 (João): use a lock plus signed-commit approval, so the gate works for every tool (Claude Code, Codex, Hermes). Claude-only hooks are not enough.
- 2026-10-23 (João): approval proof = an SSH signing key with a passphrase, kept out of `ssh-agent`. The goal is to stop regressions, not to block João. The passphrase stays out of the repo, so agents cannot self-approve.
- 2026-10-23 (João): protected set = GSC clicks above 20 in 28 days.
- 2026-10-23 (João): locked fields = Three Kings plus technical fields (8 fields above).
- 2026-10-23 (João): per-edit pin tests are migrated into the lock, then deleted. General guards stay.
- 2026-10-23 (agent): R2 verifies the SSH signature locally against João's public signing keys. It does not trust GitHub's `verified` flag, because commits made through the API with João's token are also `verified` (GitHub web-flow signature).
- 2026-10-23 (agent): a db entry whose value changed in a signed commit inside the deploy range gives an R1 warning, not a failure. Without this rule, an approved blog edit deadlocks: the deploy waits for the DB, and the DB PATCH waits for the deploy.
- 2026-10-23 (agent): known limit: an agent can edit the gate script or the workflow with the `workflow` scope. That is deliberate sabotage, not an accidental tweak. The weekly drift check and the gate-file commit list in PRD-seo-lock-monitoring detect the result.

## Edge cases (handled in the phases)
1. **Dynamic values:** years, dates and counts in titles are locked as rendered. A year rollover is a planned, signed change.
2. **Experiments in flight** (for example, the TikTok PFP title): the lock entry gets `change: { date, sha, baselineClicks28d, readbackDate }`. PRD-seo-lock-monitoring judges it.
3. **Locale redirects and trailing slashes:** the gate fetches each path without following redirects. A 3xx on a locked path is a failure, unless the lock entry has the redirect as its value.
4. **A locked URL removed, redirected or noindexed:** that is a value change, so it needs a signature.
5. **GitHub API down during the gate:** R2 needs the API only when the lock changed in the range. In that case the gate fails closed and prints the reason.
6. **Auto-added entries** (table `seo_lock_auto_entries`, PRD-seo-lock-monitoring) are frozen by a DB trigger that rejects UPDATE and DELETE. R2 covers only the git lock.

## Execution Phases
#### Phase 1: Lock and render check
**Status:** NOT STARTED
**Files:** `lib/seo/seo-lock.ts` (new: types, extract, normalize, diff) · `scripts/seo/seo-lock-regen.ts` (new: reuses the GSC fetch from `.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs` and the key lookup with `GCP_KEY_FILE`) · `scripts/seo/seo-lock-gate.ts` (new: R1 only) · `content/seo-lock.json` (generated) · `package.json` (`seo:lock:regen`, `seo:lock:gate`)
**Implementation:** Regen pulls 28-day page rows, filters clicks above 20, normalizes URLs (reuse `normalizeSeoPath` from `lib/seo/seo-equity-scoring.ts`), fetches the rendered HTML and writes sorted, stable JSON. The gate starts `next start` on a free port, waits for health, fetches each path with `redirect: 'manual'`, diffs and exits non-zero with a table of URL, field, lock value and rendered value.
**Verification:** AC-1, AC-2. Red first: the fixture with the changed title must fail before the diff code exists.

#### Phase 2: Approval gate, blog API gate and CI wiring
**Status:** NOT STARTED
**Files:** `scripts/seo/seo-lock-gate.ts` (add R2) · `.github/workflows/deploy.yml` (gate step after build, `fetch-depth: 0`) · `scripts/deploy/deploy.sh` (gate step) · `app/api/blog/posts/[slug]/route.ts` (lock check) · `.claude/skills/three-kings-manager/SKILL.md` + `.claude/skills/blog-opportunities-publisher/SKILL.md` (locked URL → proposal)
**Implementation:** R2: `git log --format=%H -- content/seo-lock.json`. Find S with `git -c gpg.ssh.allowedSignersFile=<temp> verify-commit`. Then for each later commit, diff the JSON at the parent against the JSON at the commit: removal or change = fail, with the SHA and the key. The blog route imports `content/seo-lock.json`, looks up `/blog/<slug>` (and locale variants) and compares only the locked fields that are present in the body.
**Verification:** AC-3, AC-4, AC-5. A negative control for AC-3: a web-flow-signed fixture commit must fail.

#### Phase 3: Cleanup of per-edit pins
**Status:** NOT STARTED
**Files (delete when covered):** `tests/unit/seo/three-kings-2026-09-24.unit.spec.ts`, `three-kings-2026-10-05`, `three-kings-2026-10-12`, `three-kings-exposure-2026-10-15`, `three-kings-refresh-2026-09-03`, `three-kings-regression-repair`, `tiktok-pfp-title`, `topaz-free-trial-snippet`, `blog-ctr-fixes`, `remove-bg-demand-capture`, `trending-down-blog-recovery`, `interactive-tools-pr13-metadata`, `seo-next-steps-blog-refresh`. Then the one-off apply scripts that only those tests use (`scripts/seo/three-kings-*.cjs`, `scripts/seo/tiktok-pfp-title.cjs`), after a grep for other callers.
**Keep:** `free-offer-conversion-copy`, `no-test-forbids-free-offer`, `seo-safeguards`, `three-kings-manager`, `three-kings-sitemap-route`, all structural tests. `protected-pages.unit.spec.ts` keeps only its FAQ assertions, because the lock does not lock FAQ content. Update its reference in `CLAUDE.md` if the file name changes.
**Implementation:** For each file, list each assertion → lock field, general test, or "obsolete (window closed)". An assertion that has no lock field and is still valid moves into a general test. It is not dropped. Record the mapping in the PR body.
**Verification:** AC-6. Append one entry to `docs/SEO/maintenance/seo-changes-backlog.md`.
