# IndexNow Integration Guide

## Overview

IndexNow is a protocol that allows websites to easily notify search engines about changes to their content. This integration enables faster indexing of new and updated pages.

**Participating Search Engines:**

- Bing (Microsoft)
- Google
- Yandex
- Naver
- Seznam.cz
- Yep

**Documentation:** https://www.indexnow.org/documentation.html

## Setup Instructions

### 1. Generate an IndexNow Key

Run the key generation script:

```bash
tsx scripts/create-indexnow-keyfile.ts --generate
```

Or manually generate a key:

```bash
openssl rand -hex 16
```

### 2. Configure Environment Variable

Add the generated key to your `.env.api` file:

```bash
INDEXNOW_KEY=your-generated-key-here
```

**Example:**

```bash
INDEXNOW_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

### 3. Verify Key File Creation

The key file should have been automatically created at `public/{key}.txt`.

Verify it exists:

```bash
ls -la public/*.txt
```

The file should be accessible at:

```
https://myimageupscaler.com/{key}.txt
```

### 4. Test the Setup

Check IndexNow status:

```bash
tsx scripts/submit-indexnow.ts --status
```

Expected output:

```
IndexNow Status:
  Enabled: Yes
  Total Submitted: 0
  Key Location: https://myimageupscaler.com/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6.txt
  Last Submission: Never
```

## Usage

### Submit Single URL

```bash
tsx scripts/submit-indexnow.ts --single https://myimageupscaler.com/blog/new-post
```

### Submit Batch from CSV File

```bash
# Default CSV file
tsx scripts/submit-indexnow.ts

# Custom CSV file
tsx scripts/submit-indexnow.ts --csv ./my-urls.csv
```

CSV format (one URL per line):

```csv
https://myimageupscaler.com/blog/post-1
https://myimageupscaler.com/blog/post-2
https://myimageupscaler.com/blog/post-3
```

### Submit via API

**Check Status:**

```bash
curl https://myimageupscaler.com/api/seo/indexnow
```

**Submit Single URL:**

```bash
curl -X POST https://myimageupscaler.com/api/seo/indexnow \
  -H "Content-Type: application/json" \
  -d '{"url":"https://myimageupscaler.com/blog/new-post"}'
```

**Submit Batch:**

```bash
curl -X POST https://myimageupscaler.com/api/seo/indexnow \
  -H "Content-Type: application/json" \
  -d '{"urls":["https://myimageupscaler.com/page1","https://myimageupscaler.com/page2"]}'
```

## Programmatic Usage

### Import Functions

```typescript
import {
  submitUrl,
  submitBatch,
  submitFromCSV,
  getSubmissionStatus,
  generateIndexNowKey,
  validateIndexNowKey,
  getKeyFileContent,
} from '@lib/seo/indexnow';
```

### Submit Single URL

```typescript
const result = await submitUrl('https://myimageupscaler.com/blog/new-post');

if (result.success) {
  console.log(`Submitted ${result.urlCount} URL(s)`);
} else {
  console.error(`Failed: ${result.message}`);
}
```

### Submit Batch

```typescript
const urls = [
  'https://myimageupscaler.com/blog/post-1',
  'https://myimageupscaler.com/blog/post-2',
  'https://myimageupscaler.com/blog/post-3',
];

const result = await submitBatch(urls, {
  batchSize: 100, // URLs per batch (max: 10000)
  delayMs: 1000, // Delay between batches
});

console.log(`Submitted ${result.urlCount} URLs`);
```

### Submit from CSV Content

```typescript
const csvContent = `
  https://myimageupscaler.com/blog/post-1
  https://myimageupscaler.com/blog/post-2
`;

const result = await submitFromCSV(csvContent);
```

### Check Status

```typescript
const status = await getSubmissionStatus();

console.log({
  enabled: status.isEnabled,
  keyLocation: status.keyLocation,
  totalSubmitted: status.totalSubmitted,
});
```

## Automation

### Auto-Submit New Content

Add to your content creation workflow:

```typescript
// After creating/updating a blog post
import { submitUrl } from '@lib/seo/indexnow';

async function onPostCreated(postUrl: string) {
  // Submit to IndexNow for immediate indexing
  await submitUrl(postUrl);
}
```

### Cron Job for Batch Submissions

Create a cron endpoint in `app/api/cron/indexnow/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { submitBatch } from '@lib/seo/indexnow';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret !== serverEnv.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get URLs from database or file
  const urls = await getUrlsToSubmit();

  const result = await submitBatch(urls, {
    batchSize: 1000,
    delayMs: 1000,
  });

  return NextResponse.json(result);
}
```

Add to Cloudflare Pages cron trigger:

```toml
[triggers]
crons = ["0 0 * * *"]  # Daily at midnight
```

## Best Practices

1. **Submit Immediately**: Notify IndexNow as soon as content is published or updated
2. **Batch Efficiently**: Group submissions into batches of up to 10,000 URLs
3. **Respect Rate Limits**: Add delays between batches (recommended: 1 second)
4. **Monitor Status**: Track submission success rates and errors
5. **Key Security**: Never expose your IndexNow key in client-side code

## Limits and Quotas

- **Single URL Submission**: No explicit limit
- **Batch Submission**: Up to 10,000 URLs per request
- **Recommended Batch Size**: 1,000 URLs
- **Recommended Delay**: 1 second between batches

## Troubleshooting

### Key Validation Error

**Error:** "Invalid key length: must be between 8 and 128 characters"

**Solution:** Generate a new key using the script:

```bash
tsx scripts/create-indexnow-keyfile.ts --generate
```

### Key File Not Found

**Error:** Search engines can't verify the key file

**Solution:**

1. Verify the file exists in `public/{key}.txt`
2. Check it's accessible: `curl https://myimageupscaler.com/{key}.txt`
3. Ensure the file contains only the key (no extra whitespace)

### Submission Returns 429

**Error:** "Rate limited"

**Solution:**

1. Add longer delays between batches
2. Reduce batch size
3. Wait before retrying

### HTTP 200 but Not Indexed

**Issue:** Submission succeeds but pages aren't indexed

**Explanation:** HTTP 200 only confirms receipt, not indexing

**Solution:**

1. Wait 24-48 hours for indexing
2. Verify key file is accessible
3. Check robots.txt doesn't block search engines
4. Ensure page returns 200 status

## Files Created

- `/lib/seo/indexnow.ts` - Core IndexNow integration
- `/app/api/seo/indexnow/route.ts` - API endpoints
- `/scripts/submit-indexnow.ts` - CLI submission tool
- `/scripts/create-indexnow-keyfile.ts` - Key file generator
- `/tests/seo/indexnow.test.ts` - Unit tests
- `/public/{key}.txt` - Key verification file

## Related Documentation

- [IndexNow Official Documentation](https://www.indexnow.org/documentation.html)
- [Bing Webmaster Tools](https://www.bing.com/webmasters/)
- [Google Search Console](https://search.google.com/search-console)

## Task Reference

**SEO Audit Task 26:** Implement IndexNow submission for 1,757 pages

Source file: `/tmp/seo-audit/Notice-Pages_to_submit_to_IndexNow.csv`

Purpose: Faster indexing for new/updated content
