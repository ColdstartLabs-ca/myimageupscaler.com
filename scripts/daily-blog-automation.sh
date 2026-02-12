#!/bin/bash
# Daily Blog Automation Script
# Runs via cron daily. Uses Claude Code CLI to:
# 1. Fetch GSC data to identify blog opportunities
# 2. Fetch existing posts to avoid duplicates
# 3. Generate and publish 1 SEO-optimized blog post via /blog-publish skill
#
# Usage: ./scripts/daily-blog-automation.sh [--dry-run]

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
PROJECT_DIR="/home/joao/projects/myimageupscaler.com"
LOG_DIR="$PROJECT_DIR/logs/blog-automation"
WORK_DIR="/tmp/blog-automation-miu-$(date +%Y%m%d-%H%M%S)"
GSC_SCRIPT="$HOME/.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs"
DOMAIN="myimageupscaler.com"
API_URL="https://myimageupscaler.com"
DRY_RUN=false

# Path setup for cron environment (cron has minimal PATH)
export HOME="/home/joao"
export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$HOME/.gcloud-sdk/google-cloud-sdk/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export NVM_DIR="$HOME/.nvm"

# ─── Parse args ───────────────────────────────────────────────────────────────
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
    esac
done

# ─── Setup ────────────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR" "$WORK_DIR"
LOG_FILE="$LOG_DIR/$(date +%Y-%m-%d).log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cleanup() {
    rm -rf "$WORK_DIR"
}
trap cleanup EXIT

cd "$PROJECT_DIR"

log "=== Daily Blog Automation Started ==="
log "Dry run: $DRY_RUN"

# ─── Step 1: Fetch GSC Data ──────────────────────────────────────────────────
log "Step 1: Fetching GSC data..."
GSC_OUTPUT="$WORK_DIR/gsc-data.json"

if ! node "$GSC_SCRIPT" --site="$DOMAIN" --days=28 --output="$GSC_OUTPUT" 2>>"$LOG_FILE"; then
    log "WARNING: GSC data fetch failed, continuing without it"
    echo '{"summary":{},"topQueries":[]}' > "$GSC_OUTPUT"
fi

log "GSC data saved ($(wc -c < "$GSC_OUTPUT") bytes)"

# ─── Step 2: Fetch Existing Blog Posts ────────────────────────────────────────
log "Step 2: Fetching existing blog posts..."
EXISTING_POSTS="$WORK_DIR/existing-posts.json"

# Extract existing blog post slugs from sitemap (no auth needed)
SITEMAP_XML=$(curl -sf "$API_URL/sitemap-blog.xml" 2>>"$LOG_FILE") || true

if [ -n "$SITEMAP_XML" ]; then
    # Extract slugs from <loc> tags, filter for /blog/ paths
    ALL_POSTS=$(echo "$SITEMAP_XML" | grep -oP '<loc>[^<]+/blog/[^<]+</loc>' | \
        sed 's|<loc>.*/blog/||;s|</loc>||' | \
        jq -R -s 'split("\n") | map(select(length > 0)) | map({slug: .})')
else
    ALL_POSTS="[]"
fi

echo "$ALL_POSTS" > "$EXISTING_POSTS"
TOTAL_EXISTING=$(echo "$ALL_POSTS" | jq 'length' 2>/dev/null || echo "0")
log "Found $TOTAL_EXISTING existing blog posts (from sitemap)"

# ─── Step 3: Build Claude Prompt ─────────────────────────────────────────────
log "Step 3: Preparing Claude CLI prompt..."

# Extract compact GSC insights
GSC_SUMMARY=$(jq '{
    summary: .summary,
    topQueries: [.topQueries[:20][] | {query, clicks, impressions, position}]
}' "$GSC_OUTPUT" 2>/dev/null || echo '{}')

EXISTING_LIST=$(jq '[.[] | .slug]' "$EXISTING_POSTS" 2>/dev/null || echo '[]')

# Write compact prompt to file (avoids shell arg length limits)
cat > "$WORK_DIR/prompt.txt" << PROMPT_EOF
Publish 1 SEO-optimized blog post for myimageupscaler.com using the /blog-publish skill.

Pick a high-value topic related to image upscaling, AI image enhancement, or photo editing based on the GSC keyword data below. The post should drive traffic to our AI image upscaler tool.

EXISTING POST SLUGS (do NOT duplicate any of these topics):
$EXISTING_LIST

GSC KEYWORDS (last 28 days):
$GSC_SUMMARY

Instructions:
1. Pick 1 keyword from GSC data that is NOT already covered by existing posts
2. If no GSC data, pick a topic related to: image upscaling, AI photo enhancement, image quality improvement, or photo editing tips
3. Use /blog-publish to create and publish the full post with AI-generated images
4. The post MUST include CTAs linking to the upscaler tool
5. If all keywords are already covered, publish 0 and explain why
PROMPT_EOF

PROMPT_SIZE=$(wc -c < "$WORK_DIR/prompt.txt")
log "Prompt size: $PROMPT_SIZE bytes"

if [ "$DRY_RUN" = true ]; then
    log "DRY RUN: Would send prompt to Claude CLI"
    cat "$WORK_DIR/prompt.txt" >> "$LOG_FILE"
    log "=== Dry Run Complete ==="
    exit 0
fi

# ─── Step 4: Run Claude CLI ──────────────────────────────────────────────────
log "Step 4: Running Claude CLI..."
CLAUDE_OUTPUT="$WORK_DIR/claude-output.txt"

if claude -p \
    --dangerously-skip-permissions \
    --no-session-persistence \
    "$(cat "$WORK_DIR/prompt.txt")" \
    > "$CLAUDE_OUTPUT" 2>>"$LOG_FILE"; then
    log "Claude CLI completed successfully"
else
    log "WARNING: Claude CLI exited with code $?"
fi

# ─── Step 5: Log Results ─────────────────────────────────────────────────────
log "Step 5: Recording results..."
cp "$CLAUDE_OUTPUT" "$LOG_DIR/claude-output-$(date +%Y-%m-%d).txt" 2>/dev/null || true

if [ -f "$CLAUDE_OUTPUT" ] && [ -s "$CLAUDE_OUTPUT" ]; then
    log "Claude output (last 80 lines):"
    tail -80 "$CLAUDE_OUTPUT" >> "$LOG_FILE"
else
    log "WARNING: Claude output is empty"
fi

log "=== Daily Blog Automation Complete ==="
