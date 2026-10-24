# PRD: 3-Kings Strategy Sitemap for Outrank.so

> **Complexity: 6 -> MEDIUM mode**

## 1. Context

**Problem:** Outrank.so currently consumes the full `sitemap.xml`, so internal links are distributed across every sitemap-backed URL. That spreads link equity too broadly. Pages with near-term ranking upside, especially blog posts already sitting around positions 5-20 in Google Search Console, get the same weight as pages that are already winning, irrelevant, redirected, or intentionally excluded from blog SEO work.

**Files analyzed:**

- `app/sitemap.xml/route.ts` - sitemap index
- `app/sitemap-blog.xml/route.ts` - current blog sitemap implementation and blocked slug list
- `lib/seo/sitemap-generator.ts` - sitemap XML helpers and conventions
- `workers/cron/index.ts` + `workers/cron/wrangler.toml` - Cloudflare cron router
- `app/api/cron/reconcile/route.ts` - cron auth and `sync_runs` pattern
- `server/services/subscription-sync.service.ts` - shared `createSyncRun()` / `completeSyncRun()` helpers
- `shared/config/env.ts` + `.env.api.example` - server env loading pattern
- `.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs` - current GSC auth, pagination, site URL, and date-range logic
- `.claude/skills/seo-content-3-kings-technique/SKILL.md` - existing manual 3-kings workflow

**Current behavior:**

- Outrank.so consumes the broad sitemap index rather than a curated "priority pages" feed.
- GSC data is only available through a local script; there is no server-side GSC integration.
- The current GSC script uses `sc-domain:*` site URLs, paginates Search Analytics rows, and applies a 3-day lag for stable data. The draft implementation did not preserve those details.
- The current blog sitemap owns the canonical blocked slug list inline; reusing that list from a new scorer would currently require duplication.
- Existing cron observability uses `sync_runs`, but the draft job name did not match the existing helper's typed job names.
- The draft refresh flow deleted all rows before inserting new ones, which would temporarily or permanently empty the curated sitemap on a failed refresh.

## 2. Solution

**Approach:**

- Build a server-side GSC client that authenticates with a service account using Web Crypto APIs compatible with Cloudflare Pages.
- Store credentials in env vars and store the exact GSC property identifier separately as `GSC_SITE_URL` (example: `sc-domain:myimageupscaler.com`).
- Reuse the current GSC data contract from `.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs`:
  - `type: "web"`
  - `dataState: "final"`
  - `days = 28`
  - `lagDays = 3`
  - `rowLimit = 25000`
  - paginated Search Analytics fetches
- Score only blog post URLs, filter blocked slugs via a shared constant, and keep the top 50 opportunities.
- Cache results in Supabase using refresh batches keyed by `refresh_run_id`.
- Serve `/3-kings-strategy-sitemap.xml` from the latest completed refresh recorded in `sync_runs`, so failed refreshes never wipe the last known-good batch.

**Architecture diagram:**

```mermaid
flowchart LR
    CRON[CF Cron Worker\ndaily 30 4 * * *] -->|POST /api/cron/refresh-3kings-sitemap| API[API Route]
    API -->|JWT Auth| GSC[Google Search Console API]
    GSC -->|page + query/page rows| API
    API -->|score + rank| SCORER[3-Kings Scoring]
    SCORER -->|insert refresh batch| DB[(Supabase\nthree_kings_sitemap_entries)]
    API -->|complete sync run\nmetadata.refreshRunId| SYNC[(sync_runs)]
    OUTRANK[outrank.so] -->|GET| SITEMAP[/3-kings-strategy-sitemap.xml]
    SITEMAP -->|latest completed refresh id| SYNC
    SITEMAP -->|read active batch| DB
```

**Key decisions:**

- **Use `GSC_SITE_URL` explicitly** rather than inferring the property ID at runtime. The current script uses `sc-domain:myimageupscaler.com`, and that exact API identifier matters.
- **Preserve pagination and lagged date windows** from the existing GSC script. Without pagination, the API can silently truncate data and bias scoring.
- **Normalize PEM keys from env** by converting escaped `\\n` to real newlines before `crypto.subtle.importKey(...)`.
- **Use refresh batches, not delete-then-insert**. The sitemap route should always serve the latest completed batch, even if the newest refresh fails midway.
- **Reuse `sync_runs` as the source of truth for the active batch**. This avoids adding a second state table and handles zero-entry successful refreshes cleanly.
- **Promote blocked blog slugs into a shared constant** so the new scorer and existing blog sitemap stay aligned.
- **Extend the existing sync helper job type union** with `three_kings_sitemap_refresh` instead of introducing a one-off string like `3kings-sitemap`.
- **No security config change is required**. `/api/cron/*` is already covered by `PUBLIC_API_ROUTES` in `shared/config/security.ts`.

## 3. Data Changes

### New table: `three_kings_sitemap_entries`

```sql
CREATE TABLE three_kings_sitemap_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refresh_run_id UUID NOT NULL,
  url TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT,
  -- GSC metrics
  position REAL NOT NULL,
  impressions INTEGER NOT NULL,
  clicks INTEGER NOT NULL,
  ctr REAL NOT NULL,
  -- Scoring
  opportunity_score REAL NOT NULL,
  position_score REAL NOT NULL,
  impression_score REAL NOT NULL,
  ctr_gap_score REAL NOT NULL,
  query_intent_score REAL NOT NULL,
  -- Metadata
  top_query TEXT,
  source_property TEXT NOT NULL,
  source_range_start DATE NOT NULL,
  source_range_end DATE NOT NULL,
  source_lag_days INTEGER NOT NULL DEFAULT 3,
  last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_3kings_refresh_run
  ON three_kings_sitemap_entries (refresh_run_id);

CREATE INDEX idx_3kings_opportunity
  ON three_kings_sitemap_entries (refresh_run_id, opportunity_score DESC);

CREATE INDEX idx_3kings_refreshed
  ON three_kings_sitemap_entries (last_refreshed_at DESC);

ALTER TABLE three_kings_sitemap_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage three_kings_sitemap_entries"
  ON three_kings_sitemap_entries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON three_kings_sitemap_entries
  TO service_role;
```

### New server env vars

| Variable                    | Type       | Description                                                                    |
| --------------------------- | ---------- | ------------------------------------------------------------------------------ |
| `GSC_SERVICE_ACCOUNT_EMAIL` | secret     | Service account email for GSC API                                              |
| `GSC_PRIVATE_KEY`           | secret     | PEM private key for JWT signing                                                |
| `GSC_SITE_URL`              | server env | Exact Search Console property identifier, e.g. `sc-domain:myimageupscaler.com` |

## 4. Sequence Flow

```mermaid
sequenceDiagram
    participant CRON as CF Cron Worker
    participant API as /api/cron/refresh-3kings-sitemap
    participant GSC as Google Search Console API
    participant SCORE as 3-Kings Scorer
    participant DB as three_kings_sitemap_entries
    participant SYNC as sync_runs

    CRON->>API: POST (x-cron-secret)
    API->>API: Verify cron secret
    API->>SYNC: createSyncRun('three_kings_sitemap_refresh')
    API->>API: Build stable 28-day range with 3-day lag
    API->>GSC: Get OAuth2 token (JWT assertion)
    API->>GSC: Optional sites.list preflight for GSC_SITE_URL
    API->>GSC: searchAnalytics.query pages (paginated, /blog/ filter)
    API->>GSC: searchAnalytics.query query+page (paginated, /blog/ filter)
    API->>SCORE: scoreBlogPages(pageRows, queryPageRows)
    SCORE-->>API: ranked entries (top 50)
    API->>DB: INSERT new batch with refresh_run_id
    API->>SYNC: completeSyncRun(metadata.refreshRunId, metadata.entryCount)
    API->>DB: DELETE older batches after successful completion
    API-->>CRON: 200 { processed, entryCount, refreshRunId, refreshedAt }
```

**Failure behavior:**

- If auth fails, GSC access is missing, or insertion fails, the cron route marks the sync run as failed and returns a warning/error response.
- The sitemap route continues to serve the latest completed batch from `sync_runs`.
- If there has never been a successful refresh, the sitemap route returns a valid empty `<urlset>`.

## 5. Execution Phases

### Phase 1: Environment + Database Setup

**User-visible outcome:** GSC credentials and property ID are configurable, and the database can store versioned sitemap batches safely.

**Files (4):**

- `shared/config/env.ts` - add `GSC_SERVICE_ACCOUNT_EMAIL`, `GSC_PRIVATE_KEY`, `GSC_SITE_URL`
- `.env.api.example` - document the new env vars
- `supabase/migrations/YYYYMMDD_add_three_kings_sitemap_entries.sql` - new migration
- `tests/unit/config/gsc-env.unit.spec.ts` - new env loading tests

**Implementation:**

- [ ] Add `GSC_SERVICE_ACCOUNT_EMAIL: z.string().default('')` to `serverEnvSchema`
- [ ] Add `GSC_PRIVATE_KEY: z.string().default('')` to `serverEnvSchema`
- [ ] Add `GSC_SITE_URL: z.string().default('sc-domain:myimageupscaler.com')` to `serverEnvSchema`
- [ ] Add corresponding entries to `loadServerEnv()`
- [ ] Document these values in `.env.api.example`
- [ ] Create the migration with `refresh_run_id`, `query_intent_score`, indexes, and RLS
- [ ] Apply locally via the standard Supabase workflow (`supabase db push`)

**Tests required:**

| Test File                                | Test Name                                       | Assertion                                                                                                                  |
| ---------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/config/gsc-env.unit.spec.ts` | `loads GSC env vars from process.env`           | `serverEnv.GSC_SERVICE_ACCOUNT_EMAIL`, `serverEnv.GSC_PRIVATE_KEY`, and `serverEnv.GSC_SITE_URL` match the injected values |
| `tests/unit/config/gsc-env.unit.spec.ts` | `falls back to default GSC_SITE_URL when unset` | `serverEnv.GSC_SITE_URL === 'sc-domain:myimageupscaler.com'`                                                               |

**Verification plan:**

1. Run `npx vitest run tests/unit/config/gsc-env.unit.spec.ts`
2. Apply the migration locally with `supabase db push`
3. Run `yarn verify`

---

### Phase 2: GSC Service (Auth + Fetch)

**User-visible outcome:** A server-side service can authenticate with GSC and fetch complete blog performance data, not truncated partial result sets.

**Files (3):**

- `server/services/gsc.service.ts` - new GSC API client
- `server/services/gsc.types.ts` - new GSC response/request types
- `tests/unit/server/services/gsc.service.unit.spec.ts` - GSC service unit tests

**Implementation:**

- [ ] Create interfaces for page rows, query/page rows, OAuth token responses, and Search Analytics responses
- [ ] Implement `normalizePemPrivateKey()` to convert escaped `\\n` into real newlines before key import
- [ ] Implement `createGscAccessToken(email, privateKey)` using Web Crypto:
  - Parse PEM -> `ArrayBuffer`
  - `crypto.subtle.importKey('pkcs8', ...)`
  - Build JWT claims with `scope = https://www.googleapis.com/auth/webmasters.readonly`
  - Sign with `RSASSA-PKCS1-v1_5`
  - Exchange assertion at `https://oauth2.googleapis.com/token`
- [ ] Implement `listVerifiedSites(accessToken)` or equivalent preflight check so bad `GSC_SITE_URL` configuration fails fast
- [ ] Implement `buildGscDateRange(days = 28, lagDays = 3)` so the job only uses stable complete days
- [ ] Implement `queryAllSearchAnalyticsRows(...)` with pagination using `rowLimit = 25000` and `startRow`
- [ ] Implement `fetchBlogPagePerformance(accessToken, siteUrl, range)`:
  - `dimensions: ['page']`
  - `aggregationType: 'byPage'`
  - `type: 'web'`
  - `dataState: 'final'`
  - page filter containing `/blog/`
- [ ] Implement `fetchBlogQueryPagePerformance(accessToken, siteUrl, range)`:
  - `dimensions: ['query', 'page']`
  - `type: 'web'`
  - `dataState: 'final'`
  - same `/blog/` filter

**Tests required:**

| Test File                                             | Test Name                                                              | Assertion                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `tests/unit/server/services/gsc.service.unit.spec.ts` | `normalizes PEM keys loaded from env`                                  | Escaped `\\n` is converted before import                                          |
| `tests/unit/server/services/gsc.service.unit.spec.ts` | `createGscAccessToken builds a valid JWT structure`                    | Header, claims, and signature are encoded correctly                               |
| `tests/unit/server/services/gsc.service.unit.spec.ts` | `fetchBlogPagePerformance paginates until all rows are fetched`        | Multiple `startRow` calls are made when row counts hit the limit                  |
| `tests/unit/server/services/gsc.service.unit.spec.ts` | `fetchBlogPagePerformance sends the expected Search Analytics request` | Request body includes `type`, `dataState`, `aggregationType`, and `/blog/` filter |
| `tests/unit/server/services/gsc.service.unit.spec.ts` | `throws a useful error when GSC responds with an error payload`        | Error message contains API details                                                |

**Verification plan:**

1. Run `npx vitest run tests/unit/server/services/gsc.service.unit.spec.ts`
2. Confirm the service uses `GSC_SITE_URL`, not a derived hardcoded value

---

### Phase 3: 3-Kings Scoring + Shared Blog Slug Rules

**User-visible outcome:** Scoring is deterministic, aligned with the existing blog sitemap exclusions, and only returns valid blog pages.

**Files (4):**

- `server/services/three-kings-scoring.service.ts` - new scoring algorithm
- `shared/constants/blocked-blog-slugs.ts` - new shared blocked slug constant
- `app/sitemap-blog.xml/route.ts` - import blocked slugs from the shared constant
- `tests/unit/server/services/three-kings-scoring.service.unit.spec.ts` - scoring tests

**Implementation:**

- [ ] Move `BLOCKED_BLOG_SLUGS` out of `app/sitemap-blog.xml/route.ts` into `shared/constants/blocked-blog-slugs.ts`
- [ ] Update `app/sitemap-blog.xml/route.ts` to import the shared constant with no behavior change
- [ ] Implement `scoreBlogPages(pageRows, queryPageRows)` returning `IThreeKingsEntry[]`
- [ ] Score dimensions:
  - **Position Score** (weight `0.35`): peak in positions `5-15`
  - **Impression Score** (weight `0.30`): more impressions = more upside
  - **CTR Gap Score** (weight `0.20`): bigger gap from expected CTR = more opportunity
  - **Query Intent Score** (weight `0.15`): boost queries aligned with product intent (`upscale`, `enhance`, `ai`, `tool`, `free`, `how to`, `best`)
- [ ] Map the strongest query per page from `queryPageRows`
- [ ] Extract slug from `/blog/<slug>`
- [ ] Filter blocked slugs using the shared constant
- [ ] Sort by `opportunity_score DESC`
- [ ] Return the top 50 entries only

**Tests required:**

| Test File                                                             | Test Name                                           | Assertion                          |
| --------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------- |
| `tests/unit/server/services/three-kings-scoring.service.unit.spec.ts` | `scores a position 8 page above a position 25 page` | Position weighting works           |
| `tests/unit/server/services/three-kings-scoring.service.unit.spec.ts` | `ranks a high-impression position 10 page first`    | Combined score ordering is correct |
| `tests/unit/server/services/three-kings-scoring.service.unit.spec.ts` | `caps results at 50 entries`                        | `result.length <= 50`              |
| `tests/unit/server/services/three-kings-scoring.service.unit.spec.ts` | `filters blocked blog slugs via shared constant`    | Blocked slugs never appear         |
| `tests/unit/server/services/three-kings-scoring.service.unit.spec.ts` | `extracts a blog slug from a blog URL`              | `/blog/my-post` -> `my-post`       |
| `tests/unit/server/services/three-kings-scoring.service.unit.spec.ts` | `assigns topQuery from queryPageRows`               | Top query is attached to the entry |

**Verification plan:**

1. Run `npx vitest run tests/unit/server/services/three-kings-scoring.service.unit.spec.ts`
2. Run `npx vitest run tests/unit/seo/blog-sitemap.unit.spec.ts`

---

### Phase 4: Cron API Route + Sitemap Route

**User-visible outcome:** The site exposes a stable curated sitemap feed, and refresh failures do not wipe the last working result set.

**Files (5):**

- `app/api/cron/refresh-3kings-sitemap/route.ts` - new cron endpoint
- `app/3-kings-strategy-sitemap.xml/route.ts` - new sitemap route
- `server/services/subscription-sync.service.ts` - extend sync job type union with `three_kings_sitemap_refresh`
- `tests/unit/api/cron-refresh-3kings-sitemap.unit.spec.ts` - cron route tests
- `tests/unit/seo/three-kings-sitemap-route.unit.spec.ts` - sitemap route tests

**Implementation:**

- [ ] Extend `createSyncRun()` type support to include `'three_kings_sitemap_refresh'`
- [ ] **Cron Route** (`POST /api/cron/refresh-3kings-sitemap`):
  - Verify `x-cron-secret`
  - Create a sync run for `three_kings_sitemap_refresh`
  - If GSC creds are missing, mark the sync run failed and return `200` with `{ skipped: true, reason: 'missing_gsc_credentials' }`
  - Build the stable date range (`28` days, `3` lag days)
  - Create access token, verify site access, fetch page + query/page rows
  - Score entries
  - Generate `refreshRunId = crypto.randomUUID()`
  - Insert the new batch with that `refresh_run_id`
  - Complete the sync run with metadata:
    - `refreshRunId`
    - `entryCount`
    - `sourceProperty`
    - `sourceRangeStart`
    - `sourceRangeEnd`
  - Delete rows from older refresh batches after the new batch is committed and the sync run is completed
  - Return `{ processed, entryCount, refreshRunId, refreshedAt }`
- [ ] **Sitemap Route** (`GET /3-kings-strategy-sitemap.xml`):
  - Query `sync_runs` for the latest completed `three_kings_sitemap_refresh`
  - Read `metadata.refreshRunId`
  - Query `three_kings_sitemap_entries` for that batch ordered by `opportunity_score DESC`
  - Generate valid sitemap XML
  - Map `opportunity_score` to sitemap `priority`
  - Use `last_refreshed_at` for `<lastmod>`
  - Return an empty valid sitemap if there is no completed refresh or if the latest completed refresh had `entryCount = 0`
  - Set `Cache-Control: public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400`

**Tests required:**

| Test File                                                 | Test Name                                                          | Assertion                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `tests/unit/api/cron-refresh-3kings-sitemap.unit.spec.ts` | `rejects requests without the cron secret`                         | `401` response                                                      |
| `tests/unit/api/cron-refresh-3kings-sitemap.unit.spec.ts` | `returns skipped=true when GSC creds are missing`                  | Response is `200` and sync run is marked failed/skipped in metadata |
| `tests/unit/api/cron-refresh-3kings-sitemap.unit.spec.ts` | `completes a successful refresh with metadata.refreshRunId`        | Sync run metadata contains the active batch id                      |
| `tests/unit/api/cron-refresh-3kings-sitemap.unit.spec.ts` | `does not delete older batches before a new batch is inserted`     | Protects against accidental wipe                                    |
| `tests/unit/seo/three-kings-sitemap-route.unit.spec.ts`   | `returns valid XML for the latest completed refresh batch`         | Contains `<urlset>`, `<url>`, `<loc>`                               |
| `tests/unit/seo/three-kings-sitemap-route.unit.spec.ts`   | `returns an empty sitemap when no refresh has completed`           | Valid XML with zero URLs                                            |
| `tests/unit/seo/three-kings-sitemap-route.unit.spec.ts`   | `ignores failed refreshes and serves the previous completed batch` | Stability across refresh failures                                   |
| `tests/unit/seo/three-kings-sitemap-route.unit.spec.ts`   | `sets the expected cache headers`                                  | `Cache-Control` matches expected                                    |

**Verification plan:**

1. Run `npx vitest run tests/unit/api/cron-refresh-3kings-sitemap.unit.spec.ts tests/unit/seo/three-kings-sitemap-route.unit.spec.ts`
2. Local curl check:
   ```bash
   curl -s http://localhost:3000/3-kings-strategy-sitemap.xml | head -5
   ```
3. Run `yarn verify`

---

### Phase 5: Cloudflare Cron Wiring

**User-visible outcome:** The refresh runs daily without manual intervention.

**Files (3):**

- `workers/cron/index.ts` - add new cron pattern -> endpoint mapping
- `workers/cron/wrangler.toml` - add daily cron trigger
- `tests/unit/workers/cron-router.unit.spec.ts` - worker routing tests

**Implementation:**

- [ ] Add cron pattern `30 4 * * *` (daily at 4:30 AM UTC) to `wrangler.toml`
- [ ] Add worker routing:
  ```ts
  } else if (cronPattern === '30 4 * * *') {
    endpoint = '/api/cron/refresh-3kings-sitemap';
    jobName = '3-Kings Sitemap Refresh';
  }
  ```

**Tests required:**

| Test File                                     | Test Name                                         | Assertion                                       |
| --------------------------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| `tests/unit/workers/cron-router.unit.spec.ts` | `maps 30 4 * * * to the 3-kings sitemap endpoint` | Worker calls `/api/cron/refresh-3kings-sitemap` |

**Verification plan:**

1. Run `npx vitest run tests/unit/workers/cron-router.unit.spec.ts`
2. Manual worker trigger:
   ```bash
   curl -X POST "http://localhost:8787/trigger?pattern=30%204%20%2A%20%2A%20%2A"
   ```
3. Confirm worker logs show the new endpoint

## 6. Credential Setup (Manual Steps)

After implementation and before production validation:

1. **Search Console access:** Add the service account email as a user on the `myimageupscaler.com` Search Console property with sufficient permissions.

2. **Local dev:** Add to `.env.api`:

   ```bash
   GSC_SERVICE_ACCOUNT_EMAIL=cloudstartlabs-service-acc@coldstartlabs-auth.iam.gserviceaccount.com
   GSC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   GSC_SITE_URL=sc-domain:myimageupscaler.com
   ```

3. **Production:** Deploy `GSC_SERVICE_ACCOUNT_EMAIL`, `GSC_PRIVATE_KEY`, and `GSC_SITE_URL` through the existing server env pipeline.

4. **Cloudflare Worker:** No extra GSC secrets are needed there; it only calls the Next.js cron endpoint with `CRON_SECRET`.

5. **Outrank.so:** Point the linking configuration to `https://myimageupscaler.com/3-kings-strategy-sitemap.xml`.

## 7. Acceptance Criteria

- [ ] Env loading, migration, and RLS are implemented
- [ ] The GSC client uses the exact configured `GSC_SITE_URL`
- [ ] The GSC fetch layer paginates Search Analytics results and uses a 28-day / 3-day-lag stable window
- [ ] Blocked blog slugs are shared from one source of truth
- [ ] `createSyncRun()` supports `three_kings_sitemap_refresh`
- [ ] Failed refreshes do not wipe the last completed sitemap batch
- [ ] The sitemap route returns valid XML at `/3-kings-strategy-sitemap.xml`
- [ ] The cron worker triggers `/api/cron/refresh-3kings-sitemap` daily
- [ ] Targeted unit tests pass
- [ ] `yarn verify` passes
- [ ] Manual validation with real GSC creds confirms rows are fetched and scored
