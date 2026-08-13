# pSEO prune candidate review — 2026-08-13

Source: [PRD 03 — Index Bloat Pruning](../docs/PRDs/gsc-recovery-2026-08/03-index-bloat-pruning.md)

## Decision

Status: signed off for lane integration by the explicit lane-3 worker dispatch on 2026-08-13.

Policy: exclude only pages with zero impressions and zero clicks in the committed 90-day verdict, older than the 90-day grace period, and not pinned. Blog URLs remain submitted.

The committed snapshot contains 753 zero-impression locale/page verdicts and 358 positive baseline records. Exact locale records override the English fallback so a page with a locale-specific zero-impression verdict cannot be retained by a positive fallback record.

## Guardrails

- Click-producing pages remain eligible.
- Pages updated within the grace period remain eligible.
- Pinned commercial pages remain eligible.
- Dropped counts are logged per sitemap at generation time.
- This list is committed with the snapshot so the next build cannot change eligibility from a live API response.
