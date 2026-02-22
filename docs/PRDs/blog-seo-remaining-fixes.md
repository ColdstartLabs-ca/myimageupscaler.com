# PRD: Blog SEO — Remaining Fixes

**Complexity: 2 → LOW mode**

---

## 1. Context

After fixing the critical blog sitemap issue (all 34 published posts now in sitemap), three lower-priority SEO issues remain in the blog:

1. **Hreflang on blog listing declares 7 locales** — blog is English-only content, so declaring `/es/blog`, `/de/blog`, etc. as language alternates tells Google these pages have localized content when they don't. Technically misleading, but those routes do exist and serve the same English posts.

2. **17 static posts blocked from sitemap** — `BLOCKED_BLOG_SLUGS` in `app/sitemap-blog.xml/route.ts` was added when those posts "returned 404". But the current blog post route uses `getPublishedPostBySlug()` which reads from static JSON first — so those posts likely render fine now. Needs verification.

3. **`dateModified` equals `datePublished`** — the BlogPosting schema always sets `dateModified = datePublished`. If a post is updated, Google won't know. Requires adding an `updated_at` field to the database.

---

## 2. Fixes

### Fix 1: Blog listing hreflang — English-only

**Problem:** `generateHreflangAlternates('/blog')` returns alternates for all 7 locales (en, es, pt, de, fr, it, ja). Blog content is English-only. The localized routes (`/es/blog`, etc.) exist but serve the same English posts with translated UI chrome.

**Decision options:**
- **A) Remove hreflang entirely from blog** — correct for English-only content. No hreflang = Google treats it as English. Simplest.
- **B) Keep hreflang but mark as x-default only** — blog listing stays at `/blog` with `x-default`, no locale alternates.
- **Recommended: A)** Blog is English content. No hreflang needed. Locale routes (`/es/blog`) are fine to exist but shouldn't be declared as language alternates.

**Files:**
- `app/[locale]/blog/page.tsx` — remove `generateHreflangAlternates` call, remove `languages` from alternates
- `app/sitemap-blog.xml/route.ts` — remove `generateSitemapHreflangLinks` call, remove hreflang XML from `/blog` listing entry

**Note:** Individual blog post pages already have no hreflang — this only affects the listing page.

---

### Fix 2: Unblock the 17 static posts

**Problem:** `BLOCKED_BLOG_SLUGS` was originally added because those posts "returned 404". Investigation shows the routes now read from `blog-data.json` via `getPublishedPostBySlug()` — so all 18 static posts should render with a 200.

**Verification required:**
- Manually visit `/blog/anime-upscaling-4k-art-guide` in dev — does it render?
- If yes, clear the blocklist and let all 18 static posts into the sitemap

**Files:**
- `app/sitemap-blog.xml/route.ts` — remove `BLOCKED_BLOG_SLUGS` constant and filter if posts are confirmed working
- If some posts have thin/bad content, delete them from `content/blog-data.json` instead

**Estimated gain:** +17 posts in sitemap (total: ~52 posts vs current 35)

---

### Fix 3: dateModified tracking

**Problem:** `dateModified` in the BlogPosting JSON-LD always equals `datePublished`. If a post is edited, Google won't know content was refreshed (which matters for freshness ranking).

**Solution:** Add `updated_at` column to the `blog_posts` Supabase table. Map it to `dateModified` in the schema.

**Files:**
- Supabase migration — add `updated_at` column with `DEFAULT now()`, auto-update on row change
- `server/services/blog.service.ts` — include `updated_at` in SELECT and map to returned post
- `shared/validation/blog.schema.ts` — add `updated_at` to schema
- `app/[locale]/blog/[slug]/page.tsx` — use `post.updated_at || postDate` for `dateModified`

**Note:** Static JSON posts have no `updated_at` — they will continue using `datePublished` as `dateModified`.

---

## 3. Phases

### Phase 1: Fix hreflang on blog listing (LOW risk, quick)

**Files:**
- `app/[locale]/blog/page.tsx`
- `app/sitemap-blog.xml/route.ts`
- `tests/unit/seo/blog-sitemap.unit.spec.ts` — update/add tests
- `tests/unit/seo/seo-safeguards.unit.spec.ts` — update blog guards

### Phase 2: Unblock static posts (needs manual verification first)

**Pre-condition:** Developer manually verifies that `/blog/anime-upscaling-4k-art-guide` returns 200 in production or dev before implementing.

**Files:**
- `app/sitemap-blog.xml/route.ts`
- `content/blog-data.json` — remove any posts with truly bad/thin content

### Phase 3: dateModified tracking (LOW priority)

**Files:**
- Supabase migration (new file)
- `server/services/blog.service.ts`
- `shared/validation/blog.schema.ts`
- `app/[locale]/blog/[slug]/page.tsx`

---

## 4. Acceptance Criteria

- [ ] Blog listing page has no hreflang `<link rel="alternate">` tags for non-English locales
- [ ] Blog sitemap `/blog` entry has no `<xhtml:link>` hreflang elements
- [ ] All 18 static blog posts appear in sitemap (if verified working) OR bad posts are deleted from blog-data.json
- [ ] BlogPosting schema shows different `dateModified` when post is updated
- [ ] `yarn verify` passes

---

## 5. Out of Scope

- Blog post internal linking from tool pages (separate SEO task)
- Adding more blog posts (content strategy)
- Blog post translation (English-only is the correct strategy)
