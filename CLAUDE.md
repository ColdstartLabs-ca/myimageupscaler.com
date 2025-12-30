# MyImageUpscaler - Claude Instructions

## Critical Rules

- **Principles**: Always have these principles when planning or writing code: SOLID, SRP, KISS, DRY, YAGNI.
- **Check skills**: Before starting any task, check for existing .claude/skills that can help with your context.
- **Cloudflare Workers**: Code runs on CF Workers free plan (10ms CPU limit). Avoid heavy computation, prefer streaming, use efficient algorithms. Delegate to browser whatever can safely run client-side; if security concerns exist, report and suggest alternatives.
- **Minimum changes**: Only add minimum necessary changes to make your feature work reliably and bug free.
- **Verify changes**: Run `yarn verify` after modifications. If it's a significant UI change, use `playwright-mcp` to validate it!
- **Interface naming**: Prefix with `I` (e.g., `IBlogPost`)
- **Update roadmap**: Modify `docs/management/ROADMAP.md` for new features
- **Debug**: Check `yarn dev` logs (uses concurrently)
- **Dayjs**: For date handling.
- **Testing**: Make sure to only test relevant behavior.
- **Docs**: Use mermaid if diagrams/flows are needed.
  - Do not create any new .md files, documentation, summaries, plans, readmes, guides, or explanatory documents unless explicitly requested by the user.
  - Focus solely on code changes, edits, or implementations. Avoid generating any ancillary files.
  - If documentation is needed, ask for confirmation first instead of auto-generating it.
- **PRDs**: Once finishing, please move them to `docs/PRDs/done` folder.
- **Theming**: DO NOT HARDCODE COLORS. Use tailwind config tokens (tailwind.config.js)

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
- **playwright**: UI testing, validating things
- **context7**: Documentation lookup
- **exa-search**: Web search
