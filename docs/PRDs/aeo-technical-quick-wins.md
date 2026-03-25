# AEO Technical Quick Wins — ChatGPT Discoverability Gaps

`Complexity: 1 → LOW mode`

**Status:** Done
**Priority:** 🟡 Medium
**Created:** 2026-03-25
**Related PRD:** `docs/PRDs/chatgpt-traffic-optimization.md` (covers referral detection, hero personalization, llms.txt content, homepage schema)

---

## 1. Context

**Problem:** Three small technical gaps reduce ChatGPT/AI search discoverability — they're not in the existing ChatGPT PRD and can each be fixed in under 10 lines of code.

**Files Analyzed:**

- `app/robots.ts` — AI bot crawl rules
- `lib/middleware/securityHeaders.ts` — Response headers applied to all pages
- `app/[locale]/blog/[slug]/page.tsx` — BlogPosting schema with author field
- `tests/unit/seo/robots.unit.spec.ts` — Robots.txt test suite
- `content/blog-data.json` — Blog post data (author: "MyImageUpscaler Team" on all posts)

**Current Behavior:**

- `robots.ts` allows 6 AI bots (GPTBot, ChatGPT-User, Google-Extended, ClaudeBot, PerplexityBot, anthropic-ai) but **missing CCBot** — Common Crawl is used as training data by many AI models including open-source ones
- No `Link: <url>; rel="llms-txt"` HTTP header on page responses — AI agents that follow the llms.txt spec need this to discover the file programmatically without guessing the URL
- Blog post `author` schema uses `@type: "Person"` for `"MyImageUpscaler Team"` which is semantically wrong (a team is an Organization), and has no `url` or `sameAs` — weakens E-E-A-T signals

**What this PRD does NOT cover** (handled in `chatgpt-traffic-optimization.md`):

- Referral source detection and attribution
- ChatGPT social proof hero badge
- llms.txt content optimization
- Homepage FAQPage + HowTo schema

---

## 2. Solution

**Approach:**

1. Add `CCBot` rule to `robots.ts` (allows Common Crawl indexing)
2. Add `Link: </llms.txt>; rel="llms-txt"` header in `applySecurityHeaders()` (discoverable by AI agents following the spec)
3. Fix blog `author` schema: change `@type` from `"Person"` to `"Organization"`, add `url` pointing to `/about`

**Key Decisions:**

- `Link` header goes in `applySecurityHeaders()` — already called for all page responses, single source of truth for headers
- `@type: Organization` is correct for "MyImageUpscaler Team" — `Person` is for individual humans; Google and schema.org validators flag this mismatch
- No data file changes needed — the fix is entirely in how the schema object is constructed in `page.tsx`

---

## 4. Execution Phases

### Phase 1: robots.txt + blog author schema — 3 files, no user-visible change

**Files (3):**

- `app/robots.ts` — Add CCBot rule
- `app/[locale]/blog/[slug]/page.tsx` — Fix author `@type`, add `url`
- `tests/unit/seo/robots.unit.spec.ts` — Update rule count + add CCBot test

**Implementation:**

- [ ] In `app/robots.ts`, add to `rules` array after the existing AI bot rules:
  ```ts
  {
    userAgent: 'CCBot',
    allow: '/',
    disallow: ['/api/', '/dashboard/', '/admin/', '/private/'],
  },
  ```
- [ ] In `app/[locale]/blog/[slug]/page.tsx` at line ~200, change the `author` field in `articleJsonLd`:
  ```ts
  // Before
  author: {
    '@type': 'Person',
    name: post.author,
  },
  // After
  author: {
    '@type': 'Organization',
    name: post.author,
    url: `${clientEnv.BASE_URL}/about`,
  },
  ```
- [ ] In `tests/unit/seo/robots.unit.spec.ts`:
  - Update `should have exactly 7 rules` → expect `8` rules
  - Add a new test: `should have explicit CCBot allow rule` following the same pattern as the other AI bot tests

**Tests Required:**

| Test File                            | Test Name                                              | Assertion                                                             |
| ------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------- |
| `tests/unit/seo/robots.unit.spec.ts` | `should have explicit CCBot allow rule`                | `expect(ccBotRule).toMatchObject({ userAgent: 'CCBot', allow: '/' })` |
| same                                 | `should have exactly 8 rules (1 wildcard + 7 AI bots)` | `expect(result.rules).toHaveLength(8)`                                |

**User Verification:**

- Action: `curl https://myimageupscaler.com/robots.txt | grep CCBot`
- Expected: `User-agent: CCBot` + `Allow: /`
- Action: Inspect any blog post source, find the `application/ld+json` script with `BlogPosting`
- Expected: `"author":{"@type":"Organization","name":"MyImageUpscaler Team","url":"https://myimageupscaler.com/about"}`

---

### Phase 2: llms.txt discovery header — 1 file

**Files (1):**

- `lib/middleware/securityHeaders.ts` — Add `Link` header to `applySecurityHeaders()`

**Implementation:**

- [ ] Import `serverEnv` is already imported — use `serverEnv.BASE_URL` for the full URL
- [ ] In `applySecurityHeaders()`, after the existing `getSecurityHeaders()` loop, add:
  ```ts
  res.headers.set('Link', `<${serverEnv.BASE_URL}/llms.txt>; rel="llms-txt"`);
  ```
  This sets the header on all page responses. API routes get it too which is harmless.

**Tests Required:**

No new test file needed — this is a single-line header addition. The existing security header tests do not assert on the `Link` header, so no changes to existing tests required.

**User Verification:**

- Action: `curl -I https://myimageupscaler.com/ | grep -i link`
- Expected: `link: <https://myimageupscaler.com/llms.txt>; rel="llms-txt"`

---

## 5. Checkpoint Protocol

After Phase 1:

```
Spawn prd-work-reviewer agent:
- PRD path: docs/PRDs/aeo-technical-quick-wins.md
- Phase: 1
- Summary: Added CCBot to robots.txt, fixed blog author schema, updated rule count test
```

After Phase 2:

```
Spawn prd-work-reviewer agent:
- PRD path: docs/PRDs/aeo-technical-quick-wins.md
- Phase: 2
- Summary: Added Link: llms.txt header in applySecurityHeaders
```

---

## 6. Acceptance Criteria

- [ ] CCBot rule present in robots.txt output
- [ ] robots.txt test suite passes with 8 rules
- [ ] Blog post `author` schema uses `@type: "Organization"` with `url` field
- [ ] `Link: <url>; rel="llms-txt"` header present on page responses
- [ ] `yarn verify` passes
