import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  png,
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
  // Redirect only external Supabase transport. App APIs remain the built Worker.
  await page.route('https://upscale-test.supabase.co/**', async route => {
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
  test(`recovers and downloads one charged job after reload at ${width}px`, async ({ page }) => {
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
    await expect(page.locator('[data-driver="download-button"]')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('queue-item')).toHaveCount(1);
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
  });
}

test('uploads through the workspace and delivers an image charged exactly once', async ({
  page,
}) => {
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
