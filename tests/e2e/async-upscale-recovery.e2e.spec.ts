import { expect, test } from '../test-fixtures';
import { setupAuthenticatedStateWithSupabase } from '../helpers/auth-helpers';

const JOB_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = 'async-recovery-user';
const STORAGE_KEY = `myimageupscaler:async-upscale-jobs:${USER_ID}`;
const OUTPUT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

async function mockDurableJob(page: import('@playwright/test').Page): Promise<{
  admissionPosts: string[];
  outputPosts: string[];
}> {
  const admissionPosts: string[] = [];
  const outputPosts: string[] = [];
  await page.route('**/api/upscale**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.searchParams.get('active') === '1') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          jobs: [
            {
              jobId: JOB_ID,
              status: 'processing',
              createdAt: Date.now() - 1000,
              executionDeadline: Date.now() + 900000,
              statusUrl: `/api/upscale?jobId=${JOB_ID}`,
            },
          ],
        }),
      });
      return;
    }
    if (request.method() === 'GET' && url.searchParams.get('jobId') === JOB_ID) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          jobId: JOB_ID,
          status: 'ready',
          mimeType: 'image/png',
          processing: {
            reservationJobId: JOB_ID,
            deliveryToken: 'delivery-token-for-e2e-test',
            creditsUsed: 1,
            creditsRemaining: 9,
          },
        }),
      });
      return;
    }
    if (request.method() === 'POST' && url.pathname === '/api/upscale') {
      admissionPosts.push(request.url());
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unexpected second admission' }),
      });
      return;
    }
    if (request.method() === 'POST' && url.pathname === '/api/upscale/output') {
      outputPosts.push(request.url());
      await route.fulfill({ status: 200, contentType: 'image/png', body: OUTPUT_PNG });
      return;
    }
    await route.continue();
  });
  return { admissionPosts, outputPosts };
}

async function preparePage(page: import('@playwright/test').Page): Promise<void> {
  await setupAuthenticatedStateWithSupabase(page, {
    id: USER_ID,
    email: 'async-recovery@example.test',
    profile: {
      id: USER_ID,
      email: 'async-recovery@example.test',
      role: 'user',
      subscription_credits_balance: 10,
      purchased_credits_balance: 0,
      subscription_tier: 'pro',
    },
  });
  await page.addInitScript(
    ({ key, jobId }) => {
      localStorage.setItem(
        key,
        JSON.stringify([{ jobId, fileName: 'source.png', createdAt: Date.now() }])
      );
    },
    { key: STORAGE_KEY, jobId: JOB_ID }
  );
}

test.describe('Async upscale recovery', () => {
  test('restores the same result after the POST response is lost and the page reloads', async ({
    page,
  }) => {
    await preparePage(page);
    const calls = await mockDurableJob(page);

    await page.goto('/workspace');
    await expect(page.locator('[data-testid="queue-item"]')).toHaveCount(1);
    await expect(page.locator('[data-driver="download-button"]')).toBeVisible();

    await page.reload();
    await expect(page.locator('[data-testid="queue-item"]')).toHaveCount(1);
    await expect(page.locator('[data-driver="download-button"]')).toBeVisible();
    expect(calls.admissionPosts).toHaveLength(0);
  });

  test('downloads the original result after a mobile reconnect', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await preparePage(page);
    const calls = await mockDurableJob(page);

    await page.goto('/workspace');
    await expect(page.locator('[data-testid="queue-item"]')).toHaveCount(1);
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.locator('[data-testid="queue-item"]')).toHaveCount(1);
    calls.outputPosts.length = 0;

    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.reload();
    await expect(page.locator('[data-testid="queue-item"]')).toHaveCount(1);
    const download = page.waitForEvent('download');
    await page.locator('[data-driver="download-button"]').click();
    await expect(await download).toBeTruthy();
    expect(calls.admissionPosts).toHaveLength(0);
    expect(calls.outputPosts).toHaveLength(1);
  });
});
