from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

VALIDATOR = Path(__file__).with_name("verify_action_sheet.py")
BLOG_URL = "https://myimageupscaler.com/blog/poster-size-dimensions-pixels"
GSC_RANGE = "2026-06-20 to 2026-07-17"
GSC_QUERY = "poster size in pixels"


def build_sheet(
    no_link: int = 9,
    linked: int = 1,
    *,
    duplicate_last: bool = False,
    partial_sentence: bool = False,
    target_url: str = BLOG_URL,
    reply_url: str | None = None,
    include_gsc_evidence: bool = True,
    include_relevance_evidence: bool = True,
    linked_title: str = "Poster resolution question",
    reported_impressions: int = 293,
    reported_clicks: int = 0,
    reported_position: float = 8.41,
) -> str:
    total = no_link + linked
    reply_url = target_url if reply_url is None else reply_url
    lines = [
        "/tmp/reddit-seo-response-myimageupscaler-com-2026-07-20-rerun-test.md",
        "",
        "## 9:1 Strategy",
        "",
        f"- **{no_link}** no-link helpful replies",
        f"- **{linked}** transparent link-share candidate",
        f"- **{total}** total opportunities",
        f"- **Selected link-share:** r/Printing — {linked_title}",
        "",
    ]
    if partial_sentence:
        lines.extend([f"Only {total} fresh qualified threads found — not backfilled with old/archived posts.", ""])
    for index in range(1, total + 1):
        post_id = 1 if duplicate_last and index == total else index
        is_link = index > no_link
        title = linked_title if is_link else f"Thread {index}"
        lines.extend(
            [
                f"## {index}. High priority — r/Printing — {title}",
                "",
                f"- **URL:** https://www.reddit.com/r/Printing/comments/test{post_id}/thread_{post_id}/",
                "- **Date/age:** July 20, 2026 (today)",
                "- **Confidence/status:** Post-ready",
                f"- **Link decision:** {'Transparent link-share candidate' if is_link else 'No link'}",
                f"- **Target page:** {target_url if is_link else 'none'}",
            ]
        )
        if is_link and include_gsc_evidence:
            lines.append(
                f'- **GSC evidence:** {GSC_RANGE}; query="{GSC_QUERY}"; '
                f"query impressions={reported_impressions}; query clicks={reported_clicks}; "
                f"query position={reported_position:.2f}"
            )
        if is_link and include_relevance_evidence:
            lines.append(
                f'- **Relevance evidence:** The Reddit question asks about poster resolution; the exact GSC query "{GSC_QUERY}" and target guide answer poster pixel sizing.'
            )
        lines.extend(
            [
                "",
                "```text",
                (
                    "I work on MyImageUpscaler, so obvious bias, but this poster sizing guide matches the question: "
                    f"{reply_url}. Check the final pixel dimensions against the intended print size before ordering."
                    if is_link
                    else "Start with the original file rather than a screenshot, then compare the result at full size. Faces, text, and repeated textures are where upscalers tend to invent detail, so test one image before processing the full batch."
                ),
                "```",
                "",
            ]
        )
    return "\n".join(lines)


def write_gsc(
    tmp_path: Path,
    *,
    query_impressions: int = 293,
    query_clicks: int = 0,
    query_position: float = 8.41,
) -> Path:
    path = tmp_path / "gsc.json"
    path.write_text(
        json.dumps(
            {
                "meta": {"dateRanges": {"current": {"start": "2026-06-20", "end": "2026-07-17"}}},
                "searchTypes": {
                    "web": {
                        "pages": [
                            {
                                "page": BLOG_URL,
                                "clicks": 41,
                                "impressions": 17965,
                                "position": 6.66,
                                "topQueries": [
                                    {
                                        "query": GSC_QUERY,
                                        "clicks": query_clicks,
                                        "impressions": query_impressions,
                                        "position": query_position,
                                    }
                                ],
                            },
                            {
                                "page": BLOG_URL + "#poster-table",
                                "clicks": 0,
                                "impressions": 1333,
                                "position": 7.46,
                                "topQueries": [
                                    {
                                        "query": "dpi for 24x36 poster",
                                        "clicks": 0,
                                        "impressions": 58,
                                        "position": 7.48,
                                    }
                                ],
                            },
                        ]
                    }
                },
            }
        ),
        encoding="utf-8",
    )
    return path


def run_validator(
    tmp_path: Path,
    text: str,
    *,
    include_gsc: bool = True,
    query_impressions: int = 293,
    query_clicks: int = 0,
    query_position: float = 8.41,
) -> subprocess.CompletedProcess[str]:
    artifact = tmp_path / "sheet.md"
    artifact.write_text(text, encoding="utf-8")
    command = [sys.executable, str(VALIDATOR), str(artifact)]
    if include_gsc:
        command.extend(
            [
                "--gsc",
                str(
                    write_gsc(
                        tmp_path,
                        query_impressions=query_impressions,
                        query_clicks=query_clicks,
                        query_position=query_position,
                    )
                ),
            ]
        )
    return subprocess.run(command, text=True, capture_output=True)


def test_accepts_exact_gsc_backed_bump_worthy_9_plus_1_sheet(tmp_path: Path) -> None:
    result = run_validator(tmp_path, build_sheet())
    assert result.returncode == 0, result.stdout + result.stderr
    assert "'valid': True" in result.stdout


def test_rejects_partial_sheet_with_actionable_feedback(tmp_path: Path) -> None:
    result = run_validator(tmp_path, build_sheet(no_link=2, linked=0, partial_sentence=True))
    assert result.returncode == 1
    assert "full 9:1 batch required" in result.stdout
    assert "partial-run output is forbidden" in result.stdout


def test_rejects_duplicate_thread_urls(tmp_path: Path) -> None:
    result = run_validator(tmp_path, build_sheet(duplicate_last=True))
    assert result.returncode == 1
    assert "duplicates thread URL" in result.stdout


def test_rejects_homepage_link(tmp_path: Path) -> None:
    result = run_validator(tmp_path, build_sheet(target_url="https://myimageupscaler.com"))
    assert result.returncode == 1
    assert "homepage/tool links are forbidden" in result.stdout
    assert "absent from the fresh GSC" in result.stdout


def test_rejects_reply_url_that_differs_from_target(tmp_path: Path) -> None:
    result = run_validator(tmp_path, build_sheet(reply_url="https://myimageupscaler.com/blog/other-post"))
    assert result.returncode == 1
    assert "does not exactly match" in result.stdout


def test_rejects_missing_gsc_and_relevance_evidence(tmp_path: Path) -> None:
    result = run_validator(
        tmp_path,
        build_sheet(include_gsc_evidence=False, include_relevance_evidence=False),
    )
    assert result.returncode == 1
    assert "lacks GSC evidence metadata" in result.stdout
    assert "lacks Relevance evidence metadata" in result.stdout


def test_rejects_missing_gsc_export(tmp_path: Path) -> None:
    result = run_validator(tmp_path, build_sheet(), include_gsc=False)
    assert result.returncode == 1
    assert "GSC evidence file is required" in result.stdout


def test_rejects_query_with_too_little_demand(tmp_path: Path) -> None:
    result = run_validator(
        tmp_path,
        build_sheet(reported_impressions=20),
        query_impressions=20,
    )
    assert result.returncode == 1
    assert "not worth a bump" in result.stdout


def test_rejects_query_outside_striking_distance(tmp_path: Path) -> None:
    result = run_validator(
        tmp_path,
        build_sheet(reported_position=28.0),
        query_position=28.0,
    )
    assert result.returncode == 1
    assert "outside the striking-distance position band" in result.stdout


def test_rejects_query_that_already_has_strong_ctr(tmp_path: Path) -> None:
    result = run_validator(
        tmp_path,
        build_sheet(reported_clicks=20),
        query_clicks=20,
    )
    assert result.returncode == 1
    assert "does not need a Reddit capture bump" in result.stdout


def test_rejects_semantically_unrelated_reddit_question(tmp_path: Path) -> None:
    result = run_validator(tmp_path, build_sheet(linked_title="Preserving identity in portrait restoration"))
    assert result.returncode == 1
    assert "lack a concrete shared problem term" in result.stdout
