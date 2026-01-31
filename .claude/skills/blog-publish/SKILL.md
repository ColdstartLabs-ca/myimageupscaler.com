---
name: blog-publish
description: Create and publish SEO-optimized blog posts about image upscaling, AI enhancement, and photo editing. Use when asked to write blog posts, publish content, or create SEO content.
---

# Blog Publishing for MyImageUpscaler

Create SEO-optimized blog posts about image upscaling, AI photo enhancement, and related topics.

---

## Quick Reference

| Endpoint                              | Purpose               |
| ------------------------------------- | --------------------- |
| `POST /api/blog/posts`                | Create draft post     |
| `POST /api/blog/posts/[slug]/publish` | Publish post          |
| `POST /api/blog/images/upload`        | Upload featured image |
| `GET /api/blog/posts`                 | List posts            |

**Authentication**: Use `x-api-key` header with `BLOG_API_KEY` from `.env.api`

---

## Workflow

```
1. GENERATE IMAGES → Generate 1 featured + 2-3 inline images with AI
2. UPLOAD IMAGES   → POST /api/blog/images/upload (get Supabase URLs)
3. CREATE POST     → POST /api/blog/posts (include inline image URLs in markdown content)
4. UPDATE          → PATCH /api/blog/posts/[slug] (add featured image URL)
5. PUBLISH         → POST /api/blog/posts/[slug]/publish
6. VERIFY          → Check at /blog/[slug]
```

---

## Step 1: Generate All Images with AI

**CRITICAL**: Every blog post needs **1 featured image + 2-3 inline images** embedded in the markdown content.

```bash
# Load environment
source scripts/load-env.sh
API_KEY=$(grep BLOG_API_KEY .env.api | cut -d'=' -f2)

# Generate featured image (1200x630 - social sharing optimized)
yarn tsx .claude/skills/ai-image-generation/scripts/generate-ai-image.ts \
  "Modern laptop showing AI image upscaling interface, before and after comparison, professional setup, blue lighting, photorealistic" \
  ./featured.png \
  1200 630

# Generate inline image 1 (800x600 - content width)
yarn tsx .claude/skills/ai-image-generation/scripts/generate-ai-image.ts \
  "Split screen comparison: pixelated blurry photo on left, crystal clear enhanced photo on right, dramatic before after" \
  ./inline-1.png \
  800 600

# Generate inline image 2 (800x600)
yarn tsx .claude/skills/ai-image-generation/scripts/generate-ai-image.ts \
  "Step-by-step visual showing image upload to AI processing to enhanced output, clean infographic style" \
  ./inline-2.png \
  800 600

# Generate inline image 3 (800x600) - optional but recommended
yarn tsx .claude/skills/ai-image-generation/scripts/generate-ai-image.ts \
  "Photo printer producing sharp print from upscaled image, professional photography studio, warm lighting" \
  ./inline-3.png \
  800 600
```

See `/ai-image-generation` skill for prompt templates and best practices.

---

## Step 2: Upload All Images

Upload each image and save the URLs for use in the post.

```bash
# Upload featured image
FEATURED=$(curl -s -X POST http://localhost:3000/api/blog/images/upload \
  -H "x-api-key: $API_KEY" \
  -F "file=@./featured.png" \
  -F "alt_text=AI image upscaling before and after comparison")
FEATURED_URL=$(echo "$FEATURED" | jq -r '.data.url')

# Upload inline images
INLINE1=$(curl -s -X POST http://localhost:3000/api/blog/images/upload \
  -H "x-api-key: $API_KEY" \
  -F "file=@./inline-1.png" \
  -F "alt_text=Before and after image quality comparison")
INLINE1_URL=$(echo "$INLINE1" | jq -r '.data.url')

INLINE2=$(curl -s -X POST http://localhost:3000/api/blog/images/upload \
  -H "x-api-key: $API_KEY" \
  -F "file=@./inline-2.png" \
  -F "alt_text=AI upscaling process workflow diagram")
INLINE2_URL=$(echo "$INLINE2" | jq -r '.data.url')

INLINE3=$(curl -s -X POST http://localhost:3000/api/blog/images/upload \
  -H "x-api-key: $API_KEY" \
  -F "file=@./inline-3.png" \
  -F "alt_text=High quality print from upscaled image")
INLINE3_URL=$(echo "$INLINE3" | jq -r '.data.url')

echo "Featured: $FEATURED_URL"
echo "Inline 1: $INLINE1_URL"
echo "Inline 2: $INLINE2_URL"
echo "Inline 3: $INLINE3_URL"
```

**Response format:**

```json
{
  "success": true,
  "data": {
    "url": "https://xxx.supabase.co/storage/v1/object/public/blog-images/2026/01/timestamp-filename.webp",
    "key": "2026/01/timestamp-filename.webp",
    "filename": "2026/01/timestamp-filename.webp"
  }
}
```

---

## Step 3: Create Blog Post with Inline Images

Include the inline image URLs directly in the markdown content using standard markdown syntax.

```bash
# Create draft post with inline images in content
curl -s -X POST http://localhost:3000/api/blog/posts \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "how-to-upscale-images-4x",
    "title": "How to Upscale Images 4x: AI Photo Enhancement Guide [2026]",
    "description": "Learn how to upscale images 4x quality using AI. Free online tool for photos, graphics, and artwork. No quality loss, instant results.",
    "content": "# How to Upscale Images 4x\n\nLow-res photos hurt your credibility...\n\n## The Problem with Low Resolution\n\nPixelated images look unprofessional...\n\n![Before and after image quality comparison]('"$INLINE1_URL"')\n\n## How AI Upscaling Works\n\nUnlike simple resizing, AI upscaling adds real detail...\n\n![AI upscaling process workflow]('"$INLINE2_URL"')\n\n## Perfect for Printing\n\nUpscaled images are ideal for large prints...\n\n![High quality print result]('"$INLINE3_URL"')\n\n## Conclusion\n\n[Start upscaling your images now](https://myimageupscaler.com) - free, no signup required.",
    "author": "MyImageUpscaler Team",
    "category": "Guides",
    "tags": ["upscale", "AI", "tutorial"],
    "seo_title": "How to Upscale Images 4x Quality Free - AI Photo Enhancer",
    "seo_description": "Upscale images 4x quality instantly with AI. Free online photo enhancer for prints, social media, and more. No signup required."
  }' | jq .
```

### Inline Image Markdown Syntax

```markdown
![Alt text describing the image](https://your-supabase-url.../image.webp)
```

**Placement Guidelines:**

- Place images **after** the section they illustrate
- Space images evenly throughout content (every 2-3 sections)
- Always include descriptive alt text for SEO and accessibility

---

## Step 4: Update Post with Featured Image

```bash
curl -s -X PATCH http://localhost:3000/api/blog/posts/how-to-upscale-images-4x \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "featured_image_url": "'"$FEATURED_URL"'",
    "featured_image_alt": "AI image upscaling comparison showing original vs upscaled result"
  }' | jq .
```

---

## Step 5: Publish Post

```bash
curl -s -X POST http://localhost:3000/api/blog/posts/how-to-upscale-images-4x/publish \
  -H "x-api-key: $API_KEY" | jq .
```

---

## Step 6: Verify

```bash
# Check API
curl -s http://localhost:3000/api/blog/posts/how-to-upscale-images-4x \
  -H "x-api-key: $API_KEY" | jq '{title, status, published_at}'

# Check frontend
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/blog/how-to-upscale-images-4x
```

---

## SEO Requirements

### Minimum Thresholds

| Field          | Requirement                              |
| -------------- | ---------------------------------------- |
| Title          | 5-200 chars                              |
| Description    | 20-500 chars                             |
| Slug           | 3-100 chars, lowercase with hyphens only |
| Content        | Min 100 chars                            |
| Featured Image | Recommended for better engagement        |

### Optimal Ranges

| Field         | Optimal                                |
| ------------- | -------------------------------------- |
| Title         | 50-70 chars, has brackets `[2026]`     |
| Description   | 150-160 chars, ends with CTA           |
| Slug          | 3-5 words, contains main keyword       |
| Content       | 1000+ words, 4+ H2s                    |
| Featured img  | 1 AI-generated (1200x630)              |
| Inline images | 2-3 AI-generated (800x600) in markdown |

---

## CTA (Call-to-Action) Requirements

**CRITICAL**: Every blog post MUST have hyperlinked CTAs to drive users to the upscaler tool.

**Required CTA Placements:**

- [ ] **Primary CTA in conclusion** - Linked to https://myimageupscaler.com
- [ ] **1-2 contextual CTAs** within content body
- [ ] **Description CTA** - Meta description should end with action

**CTA Templates (must use markdown links):**

```markdown
<!-- Primary Conclusion CTA -->

[Start upscaling your images now](https://myimageupscaler.com) - free, no signup required.

<!-- Contextual CTA after explaining problem -->

[Try our AI upscaler](https://myimageupscaler.com) and see the difference instantly.

<!-- Benefit-focused CTA -->

[Upload your photo](https://myimageupscaler.com) - 4x enhancement in seconds.

<!-- Quality CTA -->

Professional quality results with our [free image upscaler](https://myimageupscaler.com).

<!-- Try it now CTA -->

[Get started now](https://myimageupscaler.com) - no credit card required.
```

**CTA Best Practices:**

- ✅ ALWAYS use markdown link syntax: `[text](https://myimageupscaler.com)`
- ✅ Place CTAs after explaining value/benefits
- ✅ Use action-oriented text: "Start upscaling", "Upload your photo"
- ✅ Emphasize it's free (reduces friction)
- ❌ NEVER use plain text without hyperlink
- ❌ NEVER use arrow alone: "Try it free →"

---

## Categories & Tags

**Available Categories:**

- `Guides` - How-to tutorials and step-by-step instructions
- `Tips` - Quick tips and tricks
- `Comparisons` - Tool comparisons, before/after
- `News` - Industry news and updates
- `Technical` - Deep technical explanations

**Available Tags:**

- `upscale`, `AI`, `tutorial`, `photo`, `image`, `enhancement`, `resolution`, `prints`, `social-media`, `graphics`, `artwork`, `logo`, `product-photos`, `ecommerce`, `restoration`, `batch`, `free`, `online`

---

## Content Guidelines

### Title Format

Use this pattern: `[Keyword]: [Benefit] [Year]`

Examples:

- "How to Upscale Images for Print: Complete Guide [2026]"
- "AI Photo Enhancer: 5 Ways to Improve Image Quality [2026]"
- "Image Upscaling vs Resizing: What's the Difference? [2026]"

### Content Structure

```markdown
# H1 Title (matches page title)

Engaging introduction paragraph (3-4 sentences). Mention the problem and promise solution.

## Understanding the Concept

Explain the core topic. Use examples.

![Inline image 1 - illustrates the concept](https://supabase-url/inline-1.webp)

## Why It Matters

Benefits and use cases. Real-world applications.

## Step-by-Step Guide

Numbered steps with clear instructions.

![Inline image 2 - shows the process](https://supabase-url/inline-2.webp)

## Tips for Best Results

Actionable tips and recommendations.

## Common Mistakes to Avoid

What not to do, with explanations.

![Inline image 3 - shows results](https://supabase-url/inline-3.webp)

## Conclusion

Summary + [Primary CTA link](https://myimageupscaler.com).
```

**Image Placement Rules:**

- Place images **after** the section they illustrate
- Space 2-3 images evenly throughout (every 2-3 H2 sections)
- Never place images in introduction or conclusion

---

## Humanizing Content

### AI Patterns to AVOID

| Category            | Words to Avoid                                      |
| ------------------- | --------------------------------------------------- |
| **Overused**        | delve, tapestry, nuanced, multifaceted, landscape   |
| **Corporate**       | leverage, facilitate, streamline, optimize, utilize |
| **Filler**          | "It's important to note", "worth noting"            |
| **Hype**            | groundbreaking, revolutionary, game-changing        |
| **Throat-clearing** | "In today's world", "Here's the thing"              |

### Human Writing Techniques

```markdown
❌ AI: "Image upscaling represents a significant advancement in AI technology."
✅ Human: "I've tried dozens of upscalers. Most make your photos look like plastic."

❌ AI: "This solution offers numerous benefits for users."
✅ Human: "Here's what makes this different: it actually preserves details."

❌ AI: "The process facilitates enhanced image quality."
✅ Human: "Your photos get sharper. Period."
```

**Writing Rules:**

- First sentence must deliver value immediately
- Use active voice: "The tool sharpens photos" not "Photos are sharpened"
- Keep paragraphs short (2-4 sentences max)
- Mix sentence lengths (some 5 words, some 20+ words)
- Use first-person occasionally: "I tested this...", "Our team found..."

---

## Image Guidelines

### Image Requirements

| Image Type | Dimensions | Purpose                          |
| ---------- | ---------- | -------------------------------- |
| Featured   | 1200x630   | Social sharing, post header      |
| Inline     | 800x600    | Content illustrations (2-3 each) |

**All images must be:**

- AI-generated using `/ai-image-generation` skill
- Uploaded to Supabase Storage
- Include descriptive alt text for SEO/accessibility

### Prompt Templates by Topic

**For "How to upscale images" posts:**

```
Featured: "Modern laptop screen showing AI photo upscaling interface, before and after comparison, professional setup, blue lighting, photorealistic"
Inline 1: "Split screen: pixelated blurry photo on left, crystal clear enhanced photo on right, dramatic comparison"
Inline 2: "Step-by-step visual: image upload to AI processing to enhanced output, clean infographic style"
Inline 3: "Person examining sharp enlarged photo on screen, professional workspace, satisfied expression"
```

**For "Image resolution" posts:**

```
Featured: "Computer monitor showing pixelated vs sharp image comparison, professional photo editing workspace"
Inline 1: "Magnified pixel grid next to smooth high-res detail, educational comparison"
Inline 2: "Digital image being transformed from blocky to smooth, visualization of upscaling process"
```

**For "Print preparation" posts:**

```
Featured: "Photo printer producing high-quality print, professional photography studio"
Inline 1: "Side by side: small low-res image next to large crisp printed poster"
Inline 2: "Hands holding sharp printed photo, professional quality result"
```

---

## Environment Configuration

The `BLOG_API_KEY` is stored in `.env.api`:

```bash
# Development
BLOG_API_KEY=test-blog-api-key-xxx

# Load with:
source scripts/load-env.sh
API_KEY=$(grep BLOG_API_KEY .env.api | cut -d'=' -f2)
```

---

## Troubleshooting

### "A post with this slug already exists" (409)

Either delete the existing post or use a different slug:

```bash
# Delete existing
curl -s -X DELETE http://localhost:3000/api/blog/posts/[slug] \
  -H "x-api-key: $API_KEY"
```

### Image not showing on blog page

1. Check the URL is accessible
2. Verify `featured_image_url` is set correctly
3. Check browser console for 403/CORS errors

### Post not appearing on blog page

Only **published** posts appear. Drafts are only accessible via direct slug URL.

---

## Example: Complete Post Creation

```bash
# 0. Load environment
source scripts/load-env.sh
API_KEY=$(grep BLOG_API_KEY .env.api | cut -d'=' -f2)

# 1. Generate all images
yarn tsx .claude/skills/ai-image-generation/scripts/generate-ai-image.ts \
  "Modern laptop showing AI photo upscaling, before after comparison, blue lighting" \
  ./featured.png 1200 630

yarn tsx .claude/skills/ai-image-generation/scripts/generate-ai-image.ts \
  "Split screen: pixelated photo left, crystal clear photo right, dramatic comparison" \
  ./inline-1.png 800 600

yarn tsx .claude/skills/ai-image-generation/scripts/generate-ai-image.ts \
  "AI neural network processing image, visualization of enhancement process" \
  ./inline-2.png 800 600

# 2. Upload all images
FEATURED_URL=$(curl -s -X POST http://localhost:3000/api/blog/images/upload \
  -H "x-api-key: $API_KEY" -F "file=@./featured.png" \
  -F "alt_text=AI upscaling comparison" | jq -r '.data.url')

INLINE1_URL=$(curl -s -X POST http://localhost:3000/api/blog/images/upload \
  -H "x-api-key: $API_KEY" -F "file=@./inline-1.png" \
  -F "alt_text=Before after comparison" | jq -r '.data.url')

INLINE2_URL=$(curl -s -X POST http://localhost:3000/api/blog/images/upload \
  -H "x-api-key: $API_KEY" -F "file=@./inline-2.png" \
  -F "alt_text=AI processing visualization" | jq -r '.data.url')

# 3. Create draft with inline images in content
curl -s -X POST http://localhost:3000/api/blog/posts \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "ai-image-upscaling-guide",
    "title": "AI Image Upscaling: Complete Guide to Better Photos [2026]",
    "description": "Learn how AI image upscaling works and can transform your low-res photos into print-quality images. Free online tool.",
    "content": "# AI Image Upscaling: The Complete Guide\n\nLow-resolution photos look unprofessional. AI upscaling changes that.\n\n## What Is AI Image Upscaling?\n\nTraditional upscaling just copies pixels. AI upscaling adds real detail.\n\n![Before and after comparison]('"$INLINE1_URL"')\n\n## How It Works\n\nNeural networks analyze patterns and generate new pixels.\n\n![AI processing visualization]('"$INLINE2_URL"')\n\n## Conclusion\n\n[Start upscaling your images now](https://myimageupscaler.com) - free, instant results.",
    "author": "MyImageUpscaler Team",
    "category": "Guides",
    "tags": ["upscale", "AI", "tutorial", "photo"],
    "seo_title": "AI Image Upscaling Guide - Free Photo Enhancer Tool",
    "seo_description": "Transform low-res photos into print-quality images with AI upscaling. Free online tool - instant results, no signup required."
  }' | jq .

# 4. Add featured image
curl -s -X PATCH http://localhost:3000/api/blog/posts/ai-image-upscaling-guide \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "featured_image_url": "'"$FEATURED_URL"'",
    "featured_image_alt": "AI image upscaling before and after comparison"
  }' | jq .

# 5. Publish
curl -s -X POST http://localhost:3000/api/blog/posts/ai-image-upscaling-guide/publish \
  -H "x-api-key: $API_KEY" | jq .

# 6. Verify
curl -s http://localhost:3000/blog/ai-image-upscaling-guide | grep -o "<title>.*</title>"
```

---

## Production Notes

- Posts are stored in Supabase `blog_posts` table
- Published posts are public, drafts are API-only
- Supabase Storage for featured images (auto-compressed to WebP)
- Reading time is auto-calculated from content
- `updated_at` is auto-updated on any change

## Image Storage Details

- **Bucket:** `blog-images` (Supabase Storage)
- **Max input size:** 10MB (before compression)
- **Output format:** WebP (auto-converted)
- **Max dimensions:** 1920x1080 (auto-resized)
- **Compression:** 80% quality
- **Cache:** 1 year CDN cache
- **Path format:** `YYYY/MM/timestamp-filename.webp`

---

## Related Skills

- `/ai-image-generation` - Generate featured and inline images with AI
- `/blog-edit` - Edit existing blog posts
