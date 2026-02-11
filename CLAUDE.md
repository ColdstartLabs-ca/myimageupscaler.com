# MyImageUpscaler - Claude Instructions

## Before Starting

Check `.claude/skills/` for relevant patterns.

## Critical Constraints

- **Cloudflare Workers**: 10ms CPU limit. No heavy computation. Prefer streaming. Delegate to browser when safe.
- **Colors**: Never hardcode - use Tailwind config tokens only.
- **Docs**: No auto-generated .md files unless explicitly requested.
- **Environment Variables**: NEVER use `process.env` directly. Use `clientEnv` or `serverEnv` from `@shared/config/env`.

## Before Starting

- If something is unclear or vague, ask AskUserQuestion before implementing.

## Before Finishing

- Write tests for your changes
- Run `yarn test` on affected areas
- Run `yarn verify` (required before completing any task)
- **SEO changes MUST have tests**: Any change to sitemaps, metadata, hreflang, structured data, canonical URLs, robots directives, or SEO-related routes must be covered by unit tests in `tests/unit/seo/`. SEO regressions are silent and costly — tests are the only safety net.

## After Finishing

- Whenever you feel you learned a new "skill" for this codebase, feel free to add it to `.claude/skills/`.

## Conventions

- Principles: SOLID, SRP, KISS, DRY, YAGNI
- Interfaces: Prefix with `I` (e.g., `IUser`)
- Dates: dayjs
- Logging: `server/monitoring/logger.ts` | `client/utils/logger.ts`

## Key Paths

- PRDs: `docs/PRDs/` → move to `done/` when complete
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
