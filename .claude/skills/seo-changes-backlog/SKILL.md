---
name: seo-changes-backlog
description: Maintain docs/SEO/maintenance/seo-changes-backlog.md whenever SEO-facing code, content, metadata, sitemap, schema, canonical, hreflang, redirects, IndexNow, GSC, GA4 attribution, pSEO, or blog SEO changes are made.
---

# SEO Changes Backlog

Use this skill whenever a task touches SEO-facing behavior or assets.

## File

Primary backlog:

- `docs/SEO/maintenance/seo-changes-backlog.md`

Related operational backlog:

- `docs/SEO/maintenance/gsc-request-indexing-backlog.md`

## Workflow

1. Before editing SEO surfaces, skim the latest entries in `seo-changes-backlog.md`.
2. Make the requested change and run the relevant SEO tests.
3. Add a short dated entry to `seo-changes-backlog.md` with:
   - changed surface or URLs
   - why it changed
   - files, database records, or external actions touched
   - validation performed
   - follow-up or GSC/IndexNow actions
4. If request-indexing is needed after deploy, add or update `gsc-request-indexing-backlog.md`.
5. Insert the new entry at the TOP, under the newest date heading. Do not append at the end of the file: late-filed entries once piled up below the rollups and broke date order.
6. If the file passes ~80 KB, run the rollup recipe below.

## Entry Template

```markdown
## YYYY-MM-DD

### Short Title

Source: optional report/PRD/backlog link

Changes:

- ...

Validation:

- ...

Follow-up:

- ...
```

## Rollup Recipe

Keep the last ~3 weeks in full. Replace each older month with one `## <Month> 2026 Rollup` section, newest month first, placed after the detailed entries and before older rollups. Target 3–6 KB per month.

1. Record the last commit that holds the raw detail (`git log -1 --format=%h -- docs/SEO/maintenance/seo-changes-backlog.md`) in the file header, so `git show <hash>:<path>` recovers it.
2. Group by theme, not by day: edits and measured outcomes (WIN/FLAT/LOSS), technical changes, product-copy changes, then `Carried forward`.
3. Keep: URLs, dates, commit hashes, measured numbers, guard test names, lessons ("never repeat X"), and open follow-ups. Drop: backup file names, per-run validation counts, `yarn verify` output, repeated "no change" maintenance runs.
4. Fold the old `Open Follow-Ups` list into the `Carried forward` bullets. Mark any item you did not re-verify as such.
5. Move stray late-filed entries into their month, then check `grep -n '^## '` shows descending dates.

## Keep It Useful

- Prefer concise summaries over raw commit lists.
- Link reports and PRDs instead of duplicating long analysis.
- Mention external actions explicitly: IndexNow, GSC sitemap submission, URL inspection, request-indexing backlog, GA4 admin follow-up.
- Do not mark manual GSC work complete unless the user confirms it was done.
