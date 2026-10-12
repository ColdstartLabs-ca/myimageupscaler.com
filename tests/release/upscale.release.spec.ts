import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  png,
  R2_ORIGIN,
  startAsyncUpscaleRuntime,
  type IAsyncUpscaleRuntime,
} from '../helpers/async-upscale-runtime';

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

async function prepareBrowser(page: Page, user: { id: string; accessToken: string }) {
  // Redirect external storage transport. App APIs remain the built Worker.
  await page.route(url => url.origin === 'https://upscale-test.supabase.co' || url.origin === R2_ORIGIN, async route => {
    const request = route.request();
    const response = await runtime.externalRequest(request.url(), {
      method: request.method(),
      headers: request.headers(),
      body: request.postDataBuffer() ?? undefined,
    });
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  await page.addInitScript(({ id, accessToken }) => {
    const session = {
      access_token: accessToken,
      refresh_token: 'local-only',
      token_type: 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      user: {
        id,
        aud: 'authenticated',
        role: 'authenticated',
        email: `fixture-${id}@example.test`,
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: new Date(0).toISOString(),
      },
    };
    localStorage.setItem('sb-upscale-test-auth-token', JSON.stringify(session));
    document.cookie = `sb-upscale-test-auth-token=base64-${btoa(JSON.stringify(session)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}; path=/; SameSite=Lax`;
  }, user);
}

for (const width of [1280, 390]) {
  test(`recovers a pending job but leaves received results cleared after reload at ${width}px`, async ({ page }) => {
    runtime.setProviderDelayMs(15_000);
    await page.setViewportSize({ width, height: 844 });
    const user = await runtime.createUser({
      tier: 'pro',
      subscriptionCredits: 10,
      purchasedCredits: 5,
    });
    const jobId = randomUUID();
    const storagePath = runtime.putInput({
      userId: user.id,
      jobId,
      width: 450,
      height: 389,
      bytes: 128 * 1024,
    });
    const admission = await runtime.request(user, '/api/upscale', {
      jobId,
      storagePath,
      mimeType: 'image/png',
      config: { qualityTier: 'quick', scale: 2 },
    });
    expect(admission.status, await admission.text()).toBe(202);

    await prepareBrowser(page, user);
    await page.goto(`${runtime.browserOrigin}/workspace`);
    await expect(page.getByTestId('queue-item')).toHaveCount(1);
    await expect(page.locator('[data-driver="download-button"]')).toBeHidden();
    const storageKey = `myimageupscaler:async-upscale-jobs:${user.id}`;
    await expect
      .poll(() => page.evaluate(key => localStorage.getItem(key), storageKey))
      .toContain(jobId);
    await page.reload();
    await expect(page.getByTestId('queue-item')).toHaveCount(1);
    await expect(page.locator('[data-driver="download-button"]')).toBeVisible();
    const downloadEvent = page.waitForEvent('download');
    await page.locator('[data-driver="download-button"]').click();
    const download = await downloadEvent;
    expect(await download.failure()).toBeNull();
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const dimensions = await page.evaluate(async base64 => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, bytes.toString('base64'));
    expect(dimensions).toEqual({ width: 900, height: 778 });
    const ledger = await runtime.database.pool.query(
      `SELECT count(*)::int AS count, sum(amount)::int AS amount FROM credit_transactions WHERE reference_id = $1 AND type = 'usage'`,
      [jobId]
    );
    expect(ledger.rows[0]).toEqual({ count: 1, amount: -1 });
    const reservation = await runtime.database.pool.query(
      'SELECT status, acknowledged_at FROM processing_credit_reservations WHERE job_id = $1',
      [jobId]
    );
    expect(reservation.rows[0]).toMatchObject({
      status: 'completed',
      acknowledged_at: expect.any(String),
    });
    expect(Number.isFinite(Date.parse(reservation.rows[0].acknowledged_at))).toBe(true);
    expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBeNull();

    const discoveryEvent = page.waitForResponse(
      response => new URL(response.url()).searchParams.get('active') === '1'
    );
    await page.reload();
    const discovery = await discoveryEvent;
    expect(discovery.status()).toBe(200);
    expect((await discovery.json()).jobs).toEqual(
      expect.arrayContaining([expect.objectContaining({ jobId, status: 'completed' })])
    );
    await expect(page.getByTestId('queue-item')).toHaveCount(0);
    await expect(page.locator('[data-driver="download-button"]')).toBeHidden();
  });
}

test('uploads through the workspace and delivers an image charged exactly once', async ({
  page,
}) => {
  runtime.setProviderDelayMs(50);
  const user = await runtime.createUser({
    tier: 'pro',
    subscriptionCredits: 10,
    purchasedCredits: 5,
  });
  await prepareBrowser(page, user);
  await page.goto(`${runtime.browserOrigin}/workspace`);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: 'source.png',
      mimeType: 'image/png',
      buffer: png(450, 389, 128 * 1024),
    });
  await expect(page.getByTestId('queue-item')).toHaveCount(1);
  await expect(page.getByText('15 credits', { exact: true }).first()).toBeVisible();
  const admissionEvent = page.waitForResponse(
    response =>
      new URL(response.url()).pathname === '/api/upscale' && response.request().method() === 'POST'
  );
  await page
    .getByRole('button', { name: /Process/ })
    .filter({ visible: true })
    .first()
    .click();
  const admission = await admissionEvent;
  expect(admission.status(), await admission.text()).toBe(202);
  const jobId = (await admission.json()).jobId;
  await expect(page.locator('[data-driver="download-button"]')).toBeVisible();
  const result = await runtime.database.pool.query(
    'SELECT status, amount, acknowledged_at FROM processing_credit_reservations WHERE job_id=$1 AND user_id=$2',
    [jobId, user.id]
  );
  expect(result.rows[0]).toMatchObject({
    status: 'completed',
    amount: 1,
    acknowledged_at: expect.any(String),
  });
});

test('saves lists protects thumbnails and deletes its own R2 gallery image', async () => {
  const owner = await runtime.createUser({
    tier: 'pro',
    subscriptionCredits: 10,
    purchasedCredits: 5,
  });
  const stranger = await runtime.createUser({
    tier: 'pro',
    subscriptionCredits: 10,
    purchasedCredits: 5,
  });
  // The runtime helper does not export its private bucket name.
  const privateBucket = 'miu-private';
  const bytes = png(450, 389, 128 * 1024);
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'source.png');
  form.set('filename', 'source.png');
  form.set('width', '450');
  form.set('height', '389');
  form.set('modelUsed', 'synthetic-fixture');
  form.set('processingMode', 'upscale');

  // The runtime helper sends JSON only, so multipart save calls the built Worker origin directly.
  const saved = await fetch(new URL('/api/gallery', runtime.browserOrigin), {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner.accessToken}` },
    body: form,
  });
  const savedBody = await saved.text();
  expect(saved.status, savedBody).toBe(201);
  const { data: image } = JSON.parse(savedBody) as {
    data: { id: string; storage_path: string };
  };

  const row = await runtime.database.pool.query(
    'SELECT user_id, storage_path, storage_backend FROM saved_images WHERE id = $1',
    [image.id]
  );
  expect(row.rows[0]).toEqual({
    user_id: owner.id,
    storage_path: image.storage_path,
    storage_backend: 'r2',
  });
  const stored = await runtime.externalRequest(
    `${R2_ORIGIN}/${privateBucket}/saved/${image.storage_path}`
  );
  expect(stored.status).toBe(200);
  expect(Buffer.from(await stored.arrayBuffer()).equals(bytes)).toBe(true);

  const list = await runtime.request(owner, '/api/gallery?sort_order=created_at_desc');
  expect(list.status).toBe(200);
  const listed = (await list.json()) as {
    data: { images: Array<{ id: string; thumbnail_signed_url: string }> };
    usage: { current_count: number };
  };
  expect(listed.data.images).toEqual([
    expect.objectContaining({
      id: image.id,
      thumbnail_signed_url: `/api/gallery/thumb/${image.id}`,
    }),
  ]);
  expect(listed.usage.current_count).toBe(1);

  // Transport simulation only: the fixture returns the stored bytes, so this does not prove resizing.
  const thumb = await runtime.request(owner, `/api/gallery/thumb/${image.id}`);
  expect(thumb.status, JSON.stringify({ body: thumb.status === 200 ? undefined : await thumb.text(), calls: runtime.calls.slice(-8) })).toBe(200);
  expect(thumb.headers.get('content-type')).toBe('image/png');
  expect(thumb.headers.get('cache-control')).toBe('private, no-store');
  expect(Buffer.from(await thumb.arrayBuffer()).subarray(0, 8).toString('hex')).toBe(
    '89504e470d0a1a0a'
  );
  const denied = await runtime.request(stranger, `/api/gallery/thumb/${image.id}`);
  expect(denied.status).toBe(403);

  // The runtime helper cannot send DELETE, so this calls the same built Worker origin directly.
  const deleted = await fetch(new URL(`/api/gallery/${image.id}`, runtime.browserOrigin), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${owner.accessToken}` },
  });
  const deletedBody = await deleted.text();
  expect(deleted.status, deletedBody).toBe(200);
  expect(JSON.parse(deletedBody).data).toEqual({ deleted_id: image.id });
  const remaining = await runtime.database.pool.query(
    'SELECT count(*)::int AS count FROM saved_images WHERE id = $1',
    [image.id]
  );
  expect(remaining.rows[0]).toEqual({ count: 0 });
  const removed = await runtime.externalRequest(
    `${R2_ORIGIN}/${privateBucket}/saved/${image.storage_path}`,
    { method: 'HEAD' }
  );
  expect(removed.status).toBe(404);
});
