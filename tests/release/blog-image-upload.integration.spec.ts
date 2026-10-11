import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  png,
  R2_ORIGIN,
  R2_PUBLIC_BUCKET,
  startAsyncUpscaleRuntime,
  type IAsyncUpscaleRuntime,
} from '../helpers/async-upscale-runtime';

// Matches the parent-provided fixture binding in tests/helpers/async-upscale-runtime.ts.
const BLOG_API_KEY = 'synthetic-blog-key';
const PRIVATE_BUCKET = 'miu-private';
const STAGED_PREFIX = 'dev/blog-transform/';
const R2_HOST = new URL(R2_ORIGIN).host;

let runtime: IAsyncUpscaleRuntime;
test.beforeAll(async () => {
  runtime = await startAsyncUpscaleRuntime({
    subject: 'candidate',
    providerDelayMs: 50,
    outputBytes: 128 * 1024,
  });
});
test.afterAll(async () => {
  await runtime?.close();
});

test('blog image upload persists a public R2 asset the blog page renders', async ({ page }) => {
  const source = png(640, 360, 64 * 1024);

  // 1. Real POST /api/blog/images/upload against the built Worker.
  const upload = await fetch(new URL('/api/blog/images/upload', runtime.browserOrigin), {
    method: 'POST',
    headers: { 'x-api-key': BLOG_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      imageData: `data:image/png;base64,${source.toString('base64')}`,
      filename: 'blog-fixture.png',
      alt_text: 'Fixture blog image',
      description: 'Synthetic fixture image for the R2 blog upload lane.',
      image_type: 'inline',
      tags: ['fixture'],
    }),
  });
  const uploadBody = await upload.text();
  expect(upload.status, uploadBody).toBe(201);
  const { data } = JSON.parse(uploadBody) as {
    data: { url: string; key: string; metadata_id?: string };
  };
  expect(data.url.startsWith('https://assets.myimageupscaler.com/')).toBe(true);
  expect(data.metadata_id).toBeTruthy();
  const publicKey = new URL(data.url).pathname.replace(/^\//, '');

  // 2. Metadata row points at the persisted public object with the WebP dimensions.
  const metadata = await runtime.database.pool.query(
    'SELECT url, storage_path, width, height FROM blog_images WHERE id = $1',
    [data.metadata_id]
  );
  expect(metadata.rows[0]).toEqual({
    url: data.url,
    storage_path: publicKey,
    width: 640,
    height: 360,
  });

  // 3. Exact transform output bytes persist in the public bucket.
  const stored = runtime.getObject(R2_PUBLIC_BUCKET, publicKey);
  expect(stored, 'public object was not written to R2').toBeDefined();
  expect(stored!.contentType).toBe('image/webp');
  expect(stored!.bytes.equals(runtime.transformOutputBytes)).toBe(true);
  expect(stored!.bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
  expect(stored!.bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');

  // 4. The staged private original is removed before the public write.
  const stagedPut = runtime.calls.find(
    call =>
      call.host === R2_HOST &&
      call.method === 'PUT' &&
      call.path.startsWith(`/${PRIVATE_BUCKET}/${STAGED_PREFIX}`)
  );
  expect(stagedPut, 'no staged private PUT was observed').toBeDefined();
  const stagedKey = stagedPut!.path.slice(`/${PRIVATE_BUCKET}/`.length);
  expect(runtime.getObject(PRIVATE_BUCKET, stagedKey)).toBeUndefined();
  expect(
    runtime.calls.some(
      call => call.host === R2_HOST && call.method === 'DELETE' && call.path === stagedPut!.path
    )
  ).toBe(true);
  const stagedDeleteIndex = runtime.calls.findIndex(
    call => call.host === R2_HOST && call.method === 'DELETE' && call.path === stagedPut!.path
  );
  const publicPutIndex = runtime.calls.findIndex(
    call =>
      call.host === R2_HOST &&
      call.method === 'PUT' &&
      call.path === `/${R2_PUBLIC_BUCKET}/${publicKey}`
  );
  expect(publicPutIndex).toBeGreaterThan(stagedDeleteIndex);

  // 5. Seed only the synthetic post the real page needs, then render it.
  const slug = `r2-blog-fixture-${randomUUID().slice(0, 8)}`;
  await runtime.database.pool.query(
    `INSERT INTO blog_posts (slug, title, description, content, category, tags, status, published_at, reading_time)
     VALUES ($1, $2, $3, $4, $5, $6, 'published', now(), '1 min read')`,
    [
      slug,
      'R2 Blog Fixture',
      'Synthetic integration fixture that renders an uploaded R2 blog image.',
      `## Fixture\n\n![Fixture blog image](${data.url})\n\nSynthetic body text for the R2 blog upload lane.`,
      'Testing',
      ['fixture'],
    ]
  );

  // Only the CDN image transport is intercepted, fulfilled from the stored public bytes.
  await page.route('**/cdn-cgi/image/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    const marker = '/cdn-cgi/image/';
    const afterOptions = pathname.slice(pathname.indexOf(marker) + marker.length);
    const sourceUrl = afterOptions.slice(afterOptions.indexOf('/https://') + 1);
    const object = runtime.getObject(
      R2_PUBLIC_BUCKET,
      new URL(sourceUrl).pathname.replace(/^\//, '')
    );
    if (!object) {
      await route.fulfill({ status: 404, body: 'missing fixture object' });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { 'content-type': object.contentType },
      body: object.bytes,
    });
  });

  const response = await page.goto(`${runtime.browserOrigin}/blog/${slug}`);
  expect(response?.status(), `blog page did not render (${response?.status()})`).toBe(200);

  // 6. The real Next Image consumer displays the uploaded asset.
  const image = page.locator(`img[src*="${publicKey}"]`);
  await expect(image).toHaveCount(1);
  await image.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => image.evaluate(el => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  expect(await image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(640);
});
