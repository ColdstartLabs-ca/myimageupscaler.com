# MyImageUpscaler - Claude Instructions

## Before Starting

Check `.claude/skills/` for relevant patterns.

For SEO-facing tasks, use `.claude/skills/seo-changes-backlog/` and skim `docs/SEO/maintenance/seo-changes-backlog.md` before making changes.

## Critical Constraints

- **Cloudflare Workers**: 10ms CPU limit. No heavy computation. Prefer streaming. Delegate to browser when safe.
- **Colors**: Never hardcode - use Tailwind config tokens only.
- **Docs**: No auto-generated .md files unless explicitly requested.
- **Environment Variables**: NEVER use `process.env` directly. Use `clientEnv` or `serverEnv` from `@shared/config/env`.
- **Production Data Gathering**: Use the `gcloud-secrets` skill read-only whenever production credentials are needed to gather data. Fetch only the credentials required for the query; never print secret values, create secret versions, or mutate production data unless the user explicitly requests it.
- **Production Database Safety**: Before any potentially destructive production database action (including schema changes, migrations, data updates/deletes, restores, or bulk operations), create and verify a fresh backup. Run `yarn db:backup` yourself; it fetches credentials from GCloud Secret Manager, exports schema and data, and test-verifies the compressed archives. Confirm the new schema and data archives with `yarn db:backups` and `gzip -t`, then record their paths before proceeding. If the command fails, stop and ask the user before changing the database.

## Before Starting

- If something is unclear or vague, ask AskUserQuestion before implementing.
- Use green/red TDD. Prove changes actually work and don't break existing functionality.

## Before Finishing

- Write tests for your changes
- Run `yarn test` on affected areas
- Run `yarn verify` (required before completing any task)
- **SEO changes MUST have tests**: Any change to sitemaps, metadata, hreflang, structured data, canonical URLs, robots directives, or SEO-related routes must be covered by unit tests in `tests/unit/seo/`. SEO regressions are silent and costly — tests are the only safety net.
- **SEO changes MUST update the backlog**: Append a concise entry to [SEO changes backlog](docs/SEO/maintenance/seo-changes-backlog.md). If the file gets large, summarize older entries into monthly rollups rather than letting it become a raw changelog dump.

## After Finishing

- Whenever you feel you learned a new "skill" for this codebase, feel free to add it to `.claude/skills/`.

## After Deploy

- Check [GSC request indexing backlog](docs/SEO/maintenance/gsc-request-indexing-backlog.md). If it has unchecked URLs, remind the user to manually request indexing in Google Search Console and then clean up the backlog file.
- Check [SEO changes backlog](docs/SEO/maintenance/seo-changes-backlog.md) for post-deploy SEO follow-ups, especially GSC, IndexNow, sitemap, and GA4 attribution checks.

## Coding Discipline

- **Think first**: State assumptions explicitly. If multiple interpretations exist, present them — don't pick silently. If unclear, ask before implementing.
- **Simplicity**: Minimum code that solves the problem. No features beyond what was asked. If you write 200 lines and it could be 50, rewrite it.
- **Surgical**: Touch only what you must. Don't "improve" adjacent code, comments, or formatting. Remove only imports/vars YOUR changes orphaned — not pre-existing dead code.
- **Verifiable goals**: Transform tasks into success criteria — "Fix the bug" → "Write a test reproducing it, then make it pass". Multi-step tasks get a brief plan with verify steps.

## Conventions

- Principles: SOLID, SRP, KISS, DRY, YAGNI
- Interfaces: Prefix with `I` (e.g., `IUser`)
- Dates: dayjs
- Logging: `server/monitoring/logger.ts` | `client/utils/logger.ts`

## Key Paths

- PRDs: Keep active PRDs in `docs/PRDs/`; once implementation and verification are complete, move the PRD to `docs/PRDs/done/`.
- Roadmap: `docs/management/ROADMAP.md`
- Env: `.env.client` (public) | `.env.api` (secrets)

## pSEO Categories

When adding a new pSEO category:

1. **Middleware**: Add the path to `isPSEOPath` in `middleware.ts` (~line 337). Without this, the middleware applies locale routing to the new path, causing 404s because there's no `app/[locale]/{category}/` route.
2. **Localization config**: Add to `ENGLISH_ONLY_CATEGORIES` or `LOCALIZED_CATEGORIES` in `lib/seo/localization-config.ts`
3. **Sitemap**: Create `app/sitemap-{category}.xml/route.ts` and register in `app/sitemap.xml/route.ts`
4. **Schema**: Pass the actual category name (not `'article'`) to `generatePSEOSchema(page, 'category-name')`

## Stack

Next.js 15 (App Router), Supabase, Stripe, Cloudflare Pages, Baselime, Zod, Zustand

## API Routes

### Public API Routes

Add public routes to `PUBLIC_API_ROUTES` in `shared/config/security.ts`:

```typescript
export const PUBLIC_API_ROUTES = [
  '/api/health', // Health checks
  '/api/webhooks/*', // External services with own auth
  '/api/support/*', // Public forms (validated + rate limited)
] as const;
```

**Public routes** don't require authentication but still get:

- Security headers
- CORS handling
- Rate limiting (public tier)

**Optional auth**: Public routes can still access authenticated user info via `X-User-Id` header if the client sends an Authorization header. Useful for things like support forms where you want to know who's submitting when available.
