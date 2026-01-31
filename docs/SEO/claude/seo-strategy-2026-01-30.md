# SEO Strategy Summary - 2026-01-30

## Site Scores

| Site                             | Score | Grade | Status     |
| -------------------------------- | ----- | ----- | ---------- |
| **CBE** (convertbanktoexcel.com) | 66    | D     | Needs work |
| **MIU** (myimageupscaler.com)    | 51    | F     | Critical   |

---

## Common Issues (Both Sites)

### Structured Data (Critical)

Both sites have broken JSON-LD schema across all/most pages:

- Missing `@context`
- Missing required Product schema fields (price, availability, image)

**Fix:** Update the schema generation in both Next.js projects.

### E-E-A-T (Trust Signals)

Both sites missing:

- About page
- Contact page
- Privacy Policy links
- Author bylines
- Publish dates

**Fix:** Create these pages and add footer links.

### Content Quality

- Thin content on hub/landing pages
- Missing external links (articles need outbound references)
- Keyword stuffing detected

### Technical

- Missing favicon on tool pages
- No font preconnect for Google Fonts
- Large DOM sizes

---

## Site-Specific Priorities

### CBE (66 → Target 85+)

1. **Fix JSON-LD on /seo/ pages** - 90 pages affected
2. **Add H1 to /pricing**
3. **Fix 8 broken external links** (gov sites)
4. **Add privacy policy footer link**
5. **Add content to thin pages** (/pricing, /blog, /seo/solutions/\*)

### MIU (51 → Target 75+)

1. **Fix JSON-LD sitewide** - 100 pages affected
2. **Compress giant images** (1.9MB, 1.6MB on smart-ai page)
3. **Add H1 to homepage**
4. **Add form labels** to 44 tool pages
5. **Move meta tags from body→head** on /blog
6. **Add og:image** to 43 pages
7. **Shorten 75 page titles** to <60 chars
8. **Fix heading hierarchy** (H2→H4 skips)

---

## Quick Wins (Both Sites)

1. Add `<link rel="preconnect" href="https://fonts.gstatic.com">` to layout
2. Add favicon to all pages
3. Add privacy/terms links to footer
4. Create basic About and Contact pages

---

## Tracking

Next audit target: 2026-02-06 (1 week)

| Metric          | CBE Current | CBE Target | MIU Current | MIU Target |
| --------------- | ----------- | ---------- | ----------- | ---------- |
| Overall Score   | 66          | 80+        | 51          | 70+        |
| Structured Data | 0           | 90+        | 52          | 90+        |
| E-E-A-T         | 56          | 80+        | 54          | 80+        |
| Core SEO        | 91          | 95+        | 80          | 90+        |
| Content         | 87          | 90+        | 73          | 85+        |
