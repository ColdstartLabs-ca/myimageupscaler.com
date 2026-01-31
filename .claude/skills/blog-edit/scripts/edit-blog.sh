#!/bin/bash
# Blog Edit Helper Script for MyImageUpscaler
# Usage: ./edit-blog.sh <slug> <json-file> [--prod]
#
# Example:
#   ./edit-blog.sh how-to-upscale-images /tmp/updates.json
#
# JSON file format (all fields optional):
# {
#   "title": "New Title",
#   "description": "New description",
#   "content": "# New content...",
#   "category": "Guides",
#   "tags": ["upscale", "AI"],
#   "featured_image_url": "https://supabase-url/uploaded-image.webp",
#   "featured_image_alt": "New alt text"
# }

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SLUG="$1"
JSON_FILE="$2"
ENV="${3:---local}"

if [ -z "$SLUG" ] || [ -z "$JSON_FILE" ]; then
    echo -e "${RED}Usage: $0 <slug> <json-file> [--local|--prod]${NC}"
    exit 1
fi

if [ ! -f "$JSON_FILE" ]; then
    echo -e "${RED}File not found: $JSON_FILE${NC}"
    exit 1
fi

# Set environment
if [ "$ENV" = "--prod" ]; then
    API_URL="https://myimageupscaler.com"
else
    API_URL="http://localhost:3000"
fi

echo -e "${GREEN}Environment: ${ENV}${NC}"

# Load API key
if [ -f "./.env.api" ]; then
    source scripts/load-env.sh
    API_KEY=$(grep BLOG_API_KEY .env.api | cut -d'=' -f2)
else
    echo -e "${RED}.env.api file not found${NC}"
    exit 1
fi

# Fetch existing post
echo -e "\n${YELLOW}1. Fetching existing post...${NC}"
POST_DATA=$(curl -s "$API_URL/api/blog/posts/$SLUG" \
    -H "x-api-key: $API_KEY")

SUCCESS=$(echo "$POST_DATA" | jq -r '.success // false')

if [ "$SUCCESS" != "true" ]; then
    echo -e "${RED}Post not found: $SLUG${NC}"
    echo "Use publish-blog.sh to create a new post"
    exit 1
fi

CURRENT_TITLE=$(echo "$POST_DATA" | jq -r '.data.title')
CURRENT_STATUS=$(echo "$POST_DATA" | jq -r '.data.status')
echo -e "${GREEN}Found: $CURRENT_TITLE${NC}"
echo "Status: $CURRENT_STATUS"

# Show what will be updated
echo -e "\n${YELLOW}2. Updates to apply:${NC}"
jq '.' "$JSON_FILE"

# Check for empty JSON (no updates)
if [ "$(jq 'keys | length' "$JSON_FILE")" = "0" ]; then
    echo -e "${RED}No updates specified in JSON${NC}"
    exit 1
fi

# Build update JSON (only include fields that are present)
UPDATE_DATA=$(jq '{
    title: .title // null,
    description: .description // null,
    content: .content // null,
    author: .author // null,
    category: .category // null,
    tags: .tags // null,
    featured_image_url: .featured_image_url // null,
    featured_image_alt: .featured_image_alt // null,
    seo_title: .seo_title // null,
    seo_description: .seo_description // null
} | with_entries(select(.value != null))' "$JSON_FILE")

# Update post
echo -e "\n${YELLOW}3. Updating post...${NC}"
UPDATE_RESULT=$(curl -s -X PATCH "$API_URL/api/blog/posts/$SLUG" \
    -H "x-api-key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$UPDATE_DATA")

SUCCESS=$(echo "$UPDATE_RESULT" | jq -r '.success // false')
ERROR=$(echo "$UPDATE_RESULT" | jq -r '.error.message // empty')

if [ "$SUCCESS" != "true" ]; then
    echo -e "${RED}Update failed${NC}"
    if [ -n "$ERROR" ]; then
        echo -e "${RED}Error: $ERROR${NC}"
    fi
    echo "$UPDATE_RESULT" | jq '.'
    exit 1
fi

NEW_TITLE=$(echo "$UPDATE_RESULT" | jq -r '.data.title')
NEW_STATUS=$(echo "$UPDATE_RESULT" | jq -r '.data.status')
UPDATED_AT=$(echo "$UPDATE_RESULT" | jq -r '.data.updated_at')

echo -e "${GREEN}Updated successfully${NC}"
echo "Title: $NEW_TITLE"
echo "Updated at: $UPDATED_AT"

# Publish/Unpublish commands if requested
PUBLISH=$(jq -r '.publish // empty' "$JSON_FILE")
UNPUBLISH=$(jq -r '.unpublish // empty' "$JSON_FILE")

if [ "$PUBLISH" = "true" ]; then
    echo -e "\n${YELLOW}4. Publishing post...${NC}"
    PUBLISH_RESULT=$(curl -s -X POST "$API_URL/api/blog/posts/$SLUG/publish" \
        -H "x-api-key: $API_KEY")

    if [ "$(echo "$PUBLISH_RESULT" | jq -r '.success')" = "true" ]; then
        echo -e "${GREEN}Post published${NC}"
    fi
elif [ "$UNPUBLISH" = "true" ]; then
    echo -e "\n${YELLOW}4. Unpublishing post...${NC}"
    UNPUBLISH_RESULT=$(curl -s -X POST "$API_URL/api/blog/posts/$SLUG/unpublish" \
        -H "x-api-key: $API_KEY")

    if [ "$(echo "$UNPUBLISH_RESULT" | jq -r '.success')" = "true" ]; then
        echo -e "${GREEN}Post unpublished (now draft)${NC}"
    fi
fi

# Verify
echo -e "\n${YELLOW}5. Verifying...${NC}"
VERIFY=$(curl -s "$API_URL/api/blog/posts/$SLUG" \
    -H "x-api-key: $API_KEY")

VERIFY_TITLE=$(echo "$VERIFY" | jq -r '.data.title')
VERIFY_STATUS=$(echo "$VERIFY" | jq -r '.data.status')

if [ "$VERIFY_TITLE" = "$NEW_TITLE" ]; then
    echo -e "${GREEN}Verification passed${NC}"
else
    echo -e "${YELLOW}Title may not have updated as expected${NC}"
fi

echo "Current status: $VERIFY_STATUS"

# Frontend check
FRONTEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/blog/$SLUG")
if [ "$FRONTEND_CODE" = "200" ]; then
    echo -e "${GREEN}Frontend: HTTP 200 OK (published)${NC}"
elif [ "$FRONTEND_CODE" = "404" ]; then
    echo -e "${YELLOW}Frontend: HTTP 404 (draft status - not publicly visible)${NC}"
else
    echo -e "${YELLOW}Frontend: HTTP $FRONTEND_CODE${NC}"
fi

# Summary
echo -e "\n${GREEN}=== SUCCESS ===${NC}"
echo -e "Slug: $SLUG"
echo -e "Title: $NEW_TITLE"
echo -e "Status: $VERIFY_STATUS"
echo -e "View: $API_URL/blog/$SLUG"
