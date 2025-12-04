# PixelPerfect - Claude Instructions

## Critical Rules

- **Verify changes**: Run `yarn verify` after modifications
- **Interface naming**: Prefix with `I` (e.g., `IBlogPost`)
- **Update roadmap**: Modify `docs/management/ROADMAP.md` for new features
- **Debug**: Check `yarn dev` logs (uses concurrently)
- **Dayjs**: For date handling.
- **Testing**: Make sure to only test relevant behavior.
- **Docs**: Use mermaid if diagrams/flows are needed.

## Agents

- `e2e-test-writer` for end-to-end test creation
- `bug-hunter` for debugging issues
- `code-refactorer` for improving existing code
- `codebase-explorer` for understanding project structure

## Environment Variables

Split structure: `.env.client` (public `NEXT_PUBLIC_*`) and `.env.api` (server secrets).
See `docs/PRDs/env-system-refactor.md` for full details.

## Documentation

| Type            | Location                     |
| --------------- | ---------------------------- |
| Setup guides    | `docs/guides/`               |
| Technical specs | `docs/technical/`            |
| System docs     | `docs/technical/systems/`    |
| PRDs            | `docs/PRDs/`                 |
| Roadmap         | `docs/management/ROADMAP.md` |

## Tech Stack

Next.js 15 (App Router), Supabase, Stripe, Cloudflare Pages, Baselime

## MCP Tools

- **supabase**: Database migrations and queries
- **playwright**: UI testing
- **context7**: Documentation lookup
- **exa-search**: Web search
