#!/bin/bash
# Blog Publishing Helper Script for MyImageUpscaler
# Usage: ./publish-blog.sh <json-file> [--prod]
#
# Example:
#   ./publish-blog.sh /tmp/blog-post.json
#
# JSON file format:
# {
#   "title": "Your Title [2026]",
#   "slug": "your-slug",
#   "description": "100-160 char description with CTA",
#   "category": "Guides",
#   "tags": ["upscale", "AI", "tutorial"],
#   "featured_image_url": "https://supabase-url/uploaded-image.webp",
#   "featured_image_alt": "Descriptive alt text",
#   "content": "# H1\n\nContent...\n\n## H2\n\nMore...",
#   "seo_title": "SEO Title (max 70 chars)",
#   "seo_description": "SEO description (max 160 chars)",
#   "auto_publish": true
# }

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
JSON_FILE="$1"
ENV="${2:---local}"

if [ -z "$JSON_FILE" ]; then
    echo -e "${RED}Usage: $0 <json-file> [--local|--prod]${NC}"
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
echo -e "${GREEN}API URL: ${API_URL}${NC}"

# Load API key
if [ -f "./.env.api" ]; then
    source scripts/load-env.sh
    API_KEY=$(grep BLOG_API_KEY .env.api | cut -d'=' -f2)
else
    echo -e "${RED}.env.api file not found${NC}"
    exit 1
fi

if [ -z "$API_KEY" ]; then
    echo -e "${RED}BLOG_API_KEY not found in .env.api${NC}"
    exit 1
fi

# Step 1: Health check
echo -e "\n${YELLOW}1. Checking API health...${NC}"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/health" || echo "000")
if [ "$HEALTH" != "200" ]; then
    echo -e "${RED}API not responding (HTTP $HEALTH). Is the dev server running?${NC}"
    exit 1
fi
echo -e "${GREEN}API is healthy${NC}"

# Step 2: Validate JSON
echo -e "\n${YELLOW}2. Validating JSON...${NC}"
SLUG=$(jq -r '.slug' "$JSON_FILE")
TITLE=$(jq -r '.title' "$JSON_FILE")
DESCRIPTION=$(jq -r '.description' "$JSON_FILE")

if [ -z "$SLUG" ] || [ "$SLUG" = "null" ]; then
    echo -e "${RED}Error: 'slug' is required in JSON${NC}"
    exit 1
fi

if [ -z "$TITLE" ] || [ "$TITLE" = "null" ]; then
    echo -e "${RED}Error: 'title' is required in JSON${NC}"
    exit 1
fi

if [ -z "$DESCRIPTION" ] || [ "$DESCRIPTION" = "null" ]; then
    echo -e "${RED}Error: 'description' is required in JSON${NC}"
    exit 1
fi

echo -e "${GREEN}JSON validated${NC}"
echo "Slug: $SLUG"
echo "Title: $TITLE"

# Step 3: Check if post already exists
echo -e "\n${YELLOW}3. Checking if post exists...${NC}"
EXISTS_CHECK=$(curl -s "$API_URL/api/blog/posts/$SLUG" \
    -H "x-api-key: $API_KEY" 2>/dev/null || echo '{"error": "not found"}')

if echo "$EXISTS_CHECK" | jq -e '.error' > /dev/null; then
    echo -e "${GREEN}Post does not exist yet, creating new...${NC}"
else
    echo -e "${YELLOW}Post already exists. Do you want to update it instead? (y/N)${NC}"
    read -r response
    if [ "$response" = "y" ] || [ "$response" = "Y" ]; then
        echo -e "${RED}Use edit-blog.sh to update existing posts${NC}"
        exit 1
    else
        echo -e "${RED}Cancelled${NC}"
        exit 1
    fi
fi

# Step 4: Create blog post
echo -e "\n${YELLOW}4. Creating blog post (draft)...${NC}"

# Build request JSON
POST_DATA=$(jq '{
    slug: .slug,
    title: .title,
    description: .description,
    content: (.content // "# Blog Post\n\nContent goes here..."),
    author: (.author // "MyImageUpscaler Team"),
    category: (.category // "Guides"),
    tags: (.tags // ["upscale", "AI"]),
    featured_image_url: .featured_image_url // null,
    featured_image_alt: .featured_image_alt // null,
    seo_title: .seo_title // null,
    seo_description: .seo_description // null
} | del(.auto_publish, .featuredImagePath)' "$JSON_FILE")

CREATE_RESULT=$(curl -s -X POST "$API_URL/api/blog/posts" \
    -H "x-api-key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$POST_DATA")

SUCCESS=$(echo "$CREATE_RESULT" | jq -r '.success // false')
ERROR=$(echo "$CREATE_RESULT" | jq -r '.error.message // empty' 2>/dev/null)

if [ "$SUCCESS" != "true" ]; then
    echo -e "${RED}Failed to create post${NC}"
    if [ -n "$ERROR" ]; then
        echo -e "${RED}Error: $ERROR${NC}"
    fi
    echo "$CREATE_RESULT" | jq '.'
    exit 1
fi

POST_ID=$(echo "$CREATE_RESULT" | jq -r '.data.id')
POST_STATUS=$(echo "$CREATE_RESULT" | jq -r '.data.status')

echo -e "${GREEN}Post created${NC}"
echo "ID: $POST_ID"
echo "Status: $POST_STATUS"

# Step 5: Publish if requested
echo -e "\n${YELLOW}5. Publishing post...${NC}"
AUTO_PUBLISH=$(jq -r '.auto_publish // false' "$JSON_FILE")

if [ "$AUTO_PUBLISH" = "true" ]; then
    PUBLISH_RESULT=$(curl -s -X POST "$API_URL/api/blog/posts/$SLUG/publish" \
        -H "x-api-key: $API_KEY")

    PUBLISH_SUCCESS=$(echo "$PUBLISH_RESULT" | jq -r '.success // false')

    if [ "$PUBLISH_SUCCESS" = "true" ]; then
        echo -e "${GREEN}Post published successfully${NC}"
    else
        echo -e "${YELLOW}Auto-publish failed, post remains as draft${NC}"
    fi
else
    echo -e "${YELLOW}Post saved as draft (set auto_publish: true to publish automatically)${NC}"
fi

# Step 6: Verify
echo -e "\n${YELLOW}6. Verifying post...${NC}"

# API check
API_CHECK=$(curl -s "$API_URL/api/blog/posts/$SLUG" \
    -H "x-api-key: $API_KEY" | jq -r '.data.id // empty')

if [ -n "$API_CHECK" ] && [ "$API_CHECK" != "null" ]; then
    echo -e "${GREEN}API: Post accessible${NC}"
else
    echo -e "${RED}API: Post not found${NC}"
fi

# Frontend check
FRONTEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/blog/$SLUG")
if [ "$FRONTEND_CODE" = "200" ]; then
    echo -e "${GREEN}Frontend: HTTP 200 OK${NC}"
elif [ "$FRONTEND_CODE" = "404" ]; then
    echo -e "${YELLOW}Frontend: HTTP 404 (post is draft, not published)${NC}"
else
    echo -e "${YELLOW}Frontend: HTTP $FRONTEND_CODE${NC}"
fi

# Summary
echo -e "\n${GREEN}=== SUCCESS ===${NC}"
echo -e "Post ID: $POST_ID"
echo -e "Slug: $SLUG"
echo -e "Status: $(echo "$CREATE_RESULT" | jq -r '.data.status')"
echo -e "API URL: $API_URL/api/blog/posts/$SLUG"
echo -e "Blog URL: $API_URL/blog/$SLUG"
