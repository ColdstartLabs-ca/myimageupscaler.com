## Critical Rules

- Don't trust, verify. Always run related tests to your file changes, `yarn verify` command to make sure everything is working as expected.
- Prefix interfaces with `I`: eg. `IBlogPost`, `IBlogPostMeta`
- Update `docs/management/ROADMAP.md` when adding new features or changes to the system.
- Refer to specific system docs when adding new features or changes to the system: `docs/technical/systems/`
- When debugging, inspect yarn dev logs (we use concurrently)

## Environment Variables

This project uses a split environment variable structure:

### `.env` - Public variables only

- Contains only `NEXT_PUBLIC_*` prefixed variables
- Safe to commit (though `.env` itself is gitignored)
- Exposed to browser/client-side code
- Example: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_BASELIME_KEY`

### `.env.prod` - Server-side secrets only

c

- Contains sensitive keys with NO prefix
- NEVER commit this file
- Only accessible on server-side
- Example: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `BASELIME_API_KEY`

### When adding new environment variables:

1. **Public/client-side vars** (`NEXT_PUBLIC_*`) → Add to `.env` and `.env.example`
2. **Server-side secrets** (no prefix) → Add to `.env.prod` and `.env.prod.example`

## Documentation

### General Documentation

- Setup guides are in `docs/guides/`
- PRDs are in `docs/PRDs/`
- Technical docs are in `docs/technical/`
- Systems documentation is in `docs/technical/systems/`
- Roadmap is at `docs/management/ROADMAP.md`

## Tech Stack

- Next.js 15 (App Router)
- Supabase (Auth + Database)
- Stripe (Payments)
- Cloudflare Pages (Deployment)
- Baselime (Error Monitoring)

## Coding Standards

- **Functional**: Prefer functional patterns; avoid classes unless necessary.
- **Types**: Use strict TypeScript; no `any`.
- **Styling**: Tailwind CSS for all styling.
- **Components**: Composition over inheritance; keep components small and focused.
- **State**: Server state via React Query/SWR; global client state via Zustand (minimal usage).
- **Async**: `async/await` over `.then()`.

## System Documentation

- Check `docs/technical/systems/` for system documentation.

## Tool Usage

- **Supabase**: Use `supabase` MCP tool for all database interactions (migrations, queries).
- **UI Testing**: Use `playwright` MCP tool for running and writing UI tests.
- **Docs**: Use `context7` to pull documentation if needed.
- **Search**: Use `exa-search` MCP tool for searching.
