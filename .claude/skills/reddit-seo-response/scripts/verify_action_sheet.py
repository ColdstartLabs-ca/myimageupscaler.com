#!/usr/bin/env python3
"""Validate the canonical MIU Reddit 9:1 action-sheet contract."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

MIU_URL_RE = re.compile(r"https?://(?:www\.)?myimageupscaler\.com[^\s)>\]}\"']*", re.I)
DISCLOSURE_RE = re.compile(
    r"\b(?:full disclosure|I (?:built|run|work on|made)|my (?:site|tool|product))\b",
    re.I,
)


def _count(pattern: str, text: str, label: str, errors: list[str]) -> int:
    match = re.search(pattern, text, re.I | re.M)
    if not match:
        errors.append(f"missing {label}")
        return 0
    return int(match.group(1))


def _normalize_url(raw: str) -> str:
    raw = raw.strip().rstrip("/.,)")
    parts = urlsplit(raw)
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, "", ""))


def _load_gsc_pages(path: Path | None, errors: list[str]) -> tuple[dict[str, dict], str]:
    if path is None:
        errors.append("GSC evidence file is required; rerun validator with --gsc <fresh-gsc-json>")
        return {}, ""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        pages = data["searchTypes"]["web"]["pages"]
        date_range = data.get("meta", {}).get("dateRanges", {}).get("current", {})
        date_label = f"{date_range.get('start', '')} to {date_range.get('end', '')}".strip()
        indexed: dict[str, dict] = {}
        for row in pages:
            key = _normalize_url(row["page"])
            previous = indexed.get(key)
            if previous is None:
                indexed[key] = dict(row)
                continue
            # GSC may emit the same canonical page with anchor fragments. Keep the
            # strongest canonical row but merge query evidence so a later fragment
            # cannot silently erase the base page's top queries.
            strongest = dict(row) if row.get("impressions", 0) > previous.get("impressions", 0) else dict(previous)
            merged_queries: dict[str, dict] = {}
            for query_row in [*previous.get("topQueries", []), *row.get("topQueries", [])]:
                query = str(query_row.get("query", "")).casefold()
                if query and query not in merged_queries:
                    merged_queries[query] = query_row
            strongest["topQueries"] = list(merged_queries.values())
            indexed[key] = strongest
        return indexed, date_label
    except (OSError, ValueError, KeyError, TypeError) as exc:
        errors.append(f"cannot read GSC evidence file {path}: {exc}")
        return {}, ""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    parser.add_argument("--gsc", type=Path, help="Fresh MIU GSC export produced by gsc-fetch.cjs")
    args = parser.parse_args()

    text = args.path.read_text(encoding="utf-8").strip()
    if "## Response\n\n" in text:
        text = text.split("## Response\n\n", 1)[1].strip()

    errors: list[str] = []
    gsc_pages, gsc_date_range = _load_gsc_pages(args.gsc, errors)
    first_line = next((line.strip() for line in text.splitlines() if line.strip()), "")
    if not re.fullmatch(r"/tmp/reddit-seo-response-myimageupscaler-com-\d{4}-\d{2}-\d{2}(?:-[\w-]+)?\.md", first_line):
        errors.append("first line must be the generated /tmp MIU action-sheet path")
    if "## 9:1 Strategy" not in text[:1200]:
        errors.append("missing canonical '## 9:1 Strategy' section near the top")

    no_link = _count(r"-\s*\*\*(\d+)\*\*\s+no-link helpful repl", text, "no-link count", errors)
    linked = _count(r"-\s*\*\*(\d+)\*\*\s+transparent link-share candidate", text, "link-share count", errors)
    total = _count(r"-\s*\*\*(\d+)\*\*\s+total opportunities", text, "total count", errors)

    if no_link + linked != total:
        errors.append(f"strategy counts do not add up: {no_link}+{linked}!={total}")
    if total != 10:
        errors.append(f"full 9:1 batch required: declared total {total}, expected 10")
    if (no_link, linked) != (9, 1):
        errors.append(f"full 9:1 batch required: declared {no_link} no-link + {linked} linked, expected 9+1")
    if re.search(r"Only \d+ fresh qualified threads found", text):
        errors.append("partial-run output is forbidden for this cron; retry discovery instead")
    selected_match = re.search(r"Selected link-share:\*\*\s*(.+)", text[:1200], re.I)
    if not selected_match:
        errors.append("missing selected link-share summary")
    elif selected_match.group(1).strip().lower().startswith("none"):
        errors.append("selected link-share cannot be none in a required 9:1 batch")
    if re.search(r"https?://\S*1umj09p", text):
        errors.append("permanently blocked thread 1umj09p was included")

    items = re.split(r"(?m)(?=^## \d+\. )", text)
    items = [item for item in items if re.match(r"^## \d+\. ", item)]
    blocks = re.findall(r"```text\n(.*?)\n```", text, re.S)
    if len(items) != total:
        errors.append(f"item section count {len(items)} != declared total {total}")
    if len(blocks) != total:
        errors.append(f"reply block count {len(blocks)} != declared total {total}")
    if text.count("```") != len(blocks) * 2:
        errors.append("unbalanced or non-text code fences")

    actual_no_link = 0
    actual_linked = 0
    seen_urls: set[str] = set()
    for index, item in enumerate(items, 1):
        for label in ("URL", "Date/age", "Confidence/status", "Link decision", "Target page"):
            if not re.search(rf"-\s*\*\*{re.escape(label)}:\*\*", item):
                errors.append(f"item {index} missing {label} metadata")
        url_match = re.search(r"-\s*\*\*URL:\*\*\s*(https://www\.reddit\.com/r/[^\s]+/comments/[^\s]+)", item, re.I)
        if not url_match:
            errors.append(f"item {index} lacks a canonical full Reddit thread URL")
        else:
            canonical_url = url_match.group(1).rstrip("/.,)") + "/"
            if canonical_url in seen_urls:
                errors.append(f"item {index} duplicates thread URL {canonical_url}")
            seen_urls.add(canonical_url)
        block_match = re.search(r"```text\n(.*?)\n```", item, re.S)
        if not block_match:
            errors.append(f"item {index} missing fenced reply")
            continue
        reply = block_match.group(1).strip()
        if len(reply) < 80:
            errors.append(f"item {index} reply is too short to be useful ({len(reply)} chars)")
        decision = re.search(r"-\s*\*\*Link decision:\*\*\s*(.+)", item, re.I)
        decision_text = decision.group(1).strip().lower() if decision else ""
        target_match = re.search(r"-\s*\*\*Target page:\*\*\s*(.+)", item, re.I)
        target_text = target_match.group(1).strip() if target_match else ""
        if decision_text.startswith("no link"):
            actual_no_link += 1
            if target_text.lower() != "none":
                errors.append(f"item {index} is no-link but Target page is not none")
            if "http://" in reply or "https://" in reply:
                errors.append(f"item {index} is no-link but its public reply contains a URL")
            if MIU_URL_RE.search(reply):
                errors.append(f"item {index} leaks an MIU link into a no-link reply")
        elif "transparent" in decision_text and "link" in decision_text:
            actual_linked += 1
            target_urls = MIU_URL_RE.findall(target_text)
            reply_urls = MIU_URL_RE.findall(reply)
            if len(target_urls) != 1:
                errors.append(f"item {index} link-share must declare exactly one MIU Target page")
                target_url = ""
            else:
                target_url = _normalize_url(target_urls[0])
                target_path = urlsplit(target_url).path
                if not target_path.startswith("/blog/"):
                    errors.append(f"item {index} linked Target page must be a relevant /blog/ URL; homepage/tool links are forbidden")
                gsc_row = gsc_pages.get(target_url)
                if not gsc_row or gsc_row.get("impressions", 0) <= 0:
                    errors.append(f"item {index} linked blog target is absent from the fresh GSC web page export: {target_url}")
                evidence_match = re.search(r"-\s*\*\*GSC evidence:\*\*\s*(.+)", item, re.I)
                if not evidence_match:
                    errors.append(f"item {index} linked candidate lacks GSC evidence metadata")
                elif gsc_row:
                    evidence = evidence_match.group(1)
                    query_match = re.search(r"query\s*[=:]\s*[\"']?([^;|·]+)", evidence, re.I)
                    if not query_match:
                        errors.append(f"item {index} GSC evidence must name the target query")
                    else:
                        evidence_query = query_match.group(1).strip(" \"'").casefold()
                        gsc_queries = {str(q.get("query", "")).casefold() for q in gsc_row.get("topQueries", [])}
                        if evidence_query not in gsc_queries:
                            errors.append(f"item {index} GSC evidence query is not a top query for {target_url}: {evidence_query}")
                    if gsc_date_range and gsc_date_range not in evidence:
                        errors.append(f"item {index} GSC evidence must include fresh range {gsc_date_range}")
            normalized_reply_urls = [_normalize_url(url) for url in reply_urls]
            if len(normalized_reply_urls) != 1:
                errors.append(f"item {index} link-share reply must contain exactly one MIU URL")
            elif target_url and normalized_reply_urls[0] != target_url:
                errors.append(f"item {index} reply URL does not exactly match its GSC-backed Target page")
            if not DISCLOSURE_RE.search(reply):
                errors.append(f"item {index} link-share reply lacks transparent disclosure")
        else:
            errors.append(f"item {index} has an unrecognized link decision: {decision_text!r}")

    if actual_no_link != no_link:
        errors.append(f"actual no-link items {actual_no_link} != declared {no_link}")
    if actual_linked != linked:
        errors.append(f"actual linked items {actual_linked} != declared {linked}")

    summary = {
        "characters": len(text),
        "declared_total": total,
        "items": len(items),
        "reply_blocks": len(blocks),
        "no_link": actual_no_link,
        "transparent_link": actual_linked,
        "gsc_pages": len(gsc_pages),
        "valid": not errors,
    }
    print(summary)
    for error in errors:
        print(f"ERROR: {error}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
