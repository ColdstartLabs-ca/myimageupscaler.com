import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import sharp from 'sharp';
import {
  startUpscaleBrowserHarness,
  type IUpscaleBrowserHarness,
} from '../helpers/upscale-browser-harness';
import type { IUpscaleTestUser } from '../helpers/upscale-test-backend';

let harness: IUpscaleBrowserHarness;
let source: Buffer;
let output: Buffer;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  harness = await startUpscaleBrowserHarness({ port: 3477 });
  source = await sharp('tests/fixtures/sample.jpg').resize(512, 512).png().toBuffer();
  output = await sharp(source).resize(1024, 1024).png().toBuffer();
});

test.afterAll(async () => {
  await harness?.close();
});
test.beforeEach(async ({ page }) => {
  await harness.backend.db.query('SELECT public.record_upscale_executor_health($1,true)', [
    `sha256:${'1'.repeat(64)}`,
  ]);
  page.on('pageerror', error => console.error('[upscale browser]', error.message));
});

async function signIn(context: BrowserContext, user: IUpscaleTestUser): Promise<void> {
  // Only external Supabase Auth/Storage transport is redirected. Every app
  // admission, status, capability and output request runs its actual handler.
  await context.route(`${harness.backend.publicOrigin}/**`, async route => {
    const original = new URL(route.request().url());
    const response = await route.fetch({
      url: `${harness.backend.url}${original.pathname}${original.search}`,
    });
    await route.fulfill({ response });
  });
  await context.addCookies([
    {
      name: 'sb-upscale-test-auth-token',
      value: `base64-${Buffer.from(JSON.stringify(user.session)).toString('base64url')}`,
      url: harness.url,
    },
  ]);
  await context.addInitScript(() => {
    localStorage.setItem('miu_first_upload_completed', '1');
    localStorage.setItem('miu_onboarding_tour_phase1_done', 'true');
    localStorage.setItem('miu_onboarding_tour_completed', 'true');
  });
}

async function openWorkspace(page: Page, user: IUpscaleTestUser): Promise<void> {
  await page.goto(`${harness.url}/dashboard`);
  await expect(page.getByTestId('fixture-account')).toHaveAttribute('data-account', user.id);
  await expect(page.getByTestId('fixture-balance')).toHaveText('20');
}

async function admittedJob(
  user: IUpscaleTestUser
): Promise<{ job_id: string; credits_reserved: number }> {
  await expect
    .poll(
      async () =>
        (
          await harness.backend.db.query(
            'SELECT COUNT(*)::integer AS count FROM public.upscale_executions WHERE user_id=$1',
            [user.id]
          )
        ).rows[0].count
    )
    .toBe(1);
  const {
    rows: [job],
  } = await harness.backend.db.query(
    'SELECT job_id, credits_reserved FROM public.upscale_executions WHERE user_id=$1',
    [user.id]
  );
  return job;
}

async function startImage(
  page: Page,
  user: IUpscaleTestUser
): Promise<{ job_id: string; credits_reserved: number }> {
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: 'original.png', mimeType: 'image/png', buffer: source });
  const mobile = (page.viewportSize()?.width ?? 1280) < 768;
  await page
    .locator(`[data-driver="${mobile ? 'mobile-process-button' : 'process-button'}"]`)
    .click();
  return admittedJob(user);
}

async function showPreview(page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
  }
}

async function originalResult(
  page: Page,
  user: IUpscaleTestUser,
  jobId: string,
  info: TestInfo
): Promise<void> {
  await showPreview(page);
  const result = page.getByRole('img', { name: 'Enhanced image result' });
  await expect(result).toBeVisible({ timeout: 20_000 });
  await expect(result).toHaveJSProperty('naturalWidth', 1024);
  const download = page.waitForEvent('download');
  await page.locator('[data-driver="download-button"]').click();
  const downloaded = await download;
  const downloadPath = info.outputPath('original-job-result.png');
  await downloaded.saveAs(downloadPath);
  const bytes = await readFile(downloadPath);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    createHash('sha256').update(output).digest('hex')
  );
  await expect
    .poll(
      async () =>
        (
          await harness.backend.db.query(
            'SELECT stage FROM public.upscale_executions WHERE job_id=$1',
            [jobId]
          )
        ).rows[0].stage
    )
    .toBe('completed');
  const {
    rows: [ledger],
  } = await harness.backend.db.query(
    `
    SELECT (SELECT COUNT(*)::integer FROM public.upscale_executions WHERE user_id=$1) AS jobs,
      (SELECT COUNT(*)::integer FROM public.credit_transactions WHERE user_id=$1 AND amount<0) AS debits,
      (SELECT COUNT(*)::integer FROM public.processing_credit_reservations WHERE user_id=$1) AS reservations`,
    [user.id]
  );
  expect(ledger).toEqual({ jobs: 1, debits: 1, reservations: 1 });
  await page.screenshot({ path: info.outputPath('workspace-result.png'), fullPage: true });
}

test('should display the original result when the page reloads after acceptance', async ({
  page,
  context,
}, info) => {
  const user = await harness.backend.createUser();
  await signIn(context, user);
  await openWorkspace(page, user);
  let dropped = false;
  await page.route(
    '**/api/upscale',
    async route => {
      const response = await route.fetch();
      expect(response.status()).toBe(202);
      dropped = true;
      await route.abort('connectionreset');
    },
    { times: 1 }
  );
  const job = await startImage(page, user);
  await expect.poll(() => dropped).toBe(true);
  // Losing local display metadata must not lose the paid job identity.
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage))
      if (key.startsWith('myimageupscaler:durable-jobs:')) localStorage.removeItem(key);
  });
  await page.reload();
  await expect(page.getByTestId('fixture-account')).toHaveAttribute('data-account', user.id);
  await expect(page.locator('[data-driver="process-button"]')).toBeDisabled();
  await harness.backend.stageReady(job.job_id, output);
  await originalResult(page, user, job.job_id, info);
  await expect(page.getByTestId('fixture-balance')).toHaveText(String(20 - job.credits_reserved));
  expect(
    harness.requests.filter(
      request => request.path === '/api/upscale' && request.jobId === job.job_id
    )
  ).toHaveLength(1);
});

test('should keep processing when polling temporarily returns 503', async ({
  page,
  context,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const user = await harness.backend.createUser();
  await signIn(context, user);
  await openWorkspace(page, user);
  let unavailable = true;
  let failedPolls = 0;
  await page.route('**/api/upscale/jobs?jobId=*', async route => {
    if (!unavailable) {
      await route.continue();
      return;
    }
    // The held execution still exists; only the response transport is faulty.
    await route.fetch();
    failedPolls += 1;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'temporary database transport failure' }),
    });
  });
  const job = await startImage(page, user);
  await showPreview(page);
  await expect.poll(() => failedPolls).toBeGreaterThan(0);
  await expect(page.getByText('Reconnecting… Your image is still processing.')).toBeVisible();
  await page.screenshot({ path: info.outputPath('mobile-reconnecting.png'), fullPage: true });
  await context.setOffline(true);
  await expect(page.locator('[data-driver="mobile-process-button"]')).toBeDisabled();
  await harness.backend.stageReady(job.job_id, output);
  unavailable = false;
  await context.setOffline(false);
  await originalResult(page, user, job.job_id, info);
  await expect(page.getByTestId('fixture-balance')).toHaveText(String(20 - job.credits_reserved));
});

test('should refresh credits when execution is refunded', async ({ page, context }) => {
  const user = await harness.backend.createUser();
  await signIn(context, user);
  await openWorkspace(page, user);
  const job = await startImage(page, user);
  await expect(page.getByTestId('fixture-balance')).toHaveText(String(20 - job.credits_reserved));
  await harness.backend.refund(job.job_id);
  await expect(
    page.getByText('Processing could not finish. Your credits were refunded.')
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('fixture-balance')).toHaveText('20');
  await expect(page.getByRole('button', { name: 'Try Again', exact: true })).toBeEnabled();
  const {
    rows: [ledger],
  } = await harness.backend.db.query(
    `
    SELECT stage, refunded_at, (SELECT COUNT(*)::integer FROM public.credit_transactions WHERE user_id=$2 AND type='refund') AS refunds
    FROM public.upscale_executions WHERE job_id=$1`,
    [job.job_id, user.id]
  );
  expect(ledger.stage).toBe('failed');
  expect(ledger.refunded_at).not.toBeNull();
  expect(ledger.refunds).toBe(1);
  expect(
    harness.requests.filter(
      request => request.path === '/api/upscale' && request.jobId === job.job_id
    )
  ).toHaveLength(1);
  const newAdmission = page.waitForResponse(
    response => new URL(response.url()).pathname === '/api/upscale'
  );
  await page.getByRole('button', { name: 'Try Again', exact: true }).click();
  const response = await newAdmission;
  expect(response.status()).toBe(202);
  expect((await response.json()).jobId).not.toBe(job.job_id);
  await expect(page.getByTestId('fixture-balance')).toHaveText(String(20 - job.credits_reserved));
});

test('should share one admitted job across two tabs without another debit', async ({
  page,
  context,
}, info) => {
  const user = await harness.backend.createUser();
  await signIn(context, user);
  await openWorkspace(page, user);
  const job = await startImage(page, user);
  const secondTab = await context.newPage();
  await secondTab.goto(`${harness.url}/dashboard`);
  await expect(secondTab.getByTestId('fixture-account')).toHaveAttribute('data-account', user.id);
  await expect(secondTab.locator('[data-driver="process-button"]')).toBeDisabled();
  await harness.backend.stageReady(job.job_id, output);
  await originalResult(secondTab, user, job.job_id, info);
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await originalResult(page, user, job.job_id, info);
  expect(
    harness.requests.filter(
      request => request.path === '/api/upscale' && request.jobId === job.job_id
    )
  ).toHaveLength(1);
});

test('should isolate an in-flight output when the signed-in account changes', async ({
  page,
  context,
}, info) => {
  const owner = await harness.backend.createUser();
  const other = await harness.backend.createUser();
  await signIn(context, owner);
  await openWorkspace(page, owner);
  const job = await startImage(page, owner);
  const outputPath = await harness.backend.stageReady(job.job_id, output);
  harness.backend.putObject(outputPath, output, 'image/png', { chunkBytes: 512, delayMs: 500 });
  await expect
    .poll(
      async () =>
        (
          await harness.backend.db.query(
            'SELECT delivery_lease_expires_at IS NOT NULL AS leased FROM public.upscale_executions WHERE job_id=$1',
            [job.job_id]
          )
        ).rows[0].leased
    )
    .toBe(true);
  await page.evaluate(async session => {
    await (
      window as unknown as { __upscaleFixtureSetSession(session: unknown): Promise<unknown> }
    ).__upscaleFixtureSetSession(session);
  }, other.session);
  await expect(page.getByTestId('fixture-account')).toHaveAttribute('data-account', other.id);
  await expect(page.getByTestId('fixture-balance')).toHaveText('20');
  await expect(page.locator('[data-driver="download-button"]')).toHaveCount(0);
  await expect(page.getByText('original.png', { exact: true })).toHaveCount(0);
  const denied = await fetch(`${harness.url}/api/upscale/jobs?jobId=${job.job_id}`, {
    headers: { Authorization: `Bearer ${other.accessToken}` },
  });
  expect(denied.status).toBe(404);
  await expect
    .poll(
      async () =>
        (
          await harness.backend.db.query(
            "SELECT delivery_lease_expires_at IS NULL AND stage='ready' AS released FROM public.upscale_executions WHERE job_id=$1",
            [job.job_id]
          )
        ).rows[0].released
    )
    .toBe(true);
  harness.backend.putObject(outputPath, output);
  await page.evaluate(async session => {
    await (
      window as unknown as { __upscaleFixtureSetSession(session: unknown): Promise<unknown> }
    ).__upscaleFixtureSetSession(session);
  }, owner.session);
  await expect(page.getByTestId('fixture-account')).toHaveAttribute('data-account', owner.id);
  await originalResult(page, owner, job.job_id, info);
});

test('should resume the same output after the response body is interrupted', async ({
  page,
  context,
}, info) => {
  const user = await harness.backend.createUser();
  await signIn(context, user);
  await openWorkspace(page, user);
  const job = await startImage(page, user);
  const outputPath = await harness.backend.stageReady(job.job_id, output);
  harness.backend.putObject(outputPath, output, 'image/png', { chunkBytes: 512, delayMs: 500 });
  await expect
    .poll(
      async () =>
        (
          await harness.backend.db.query(
            'SELECT delivery_lease_expires_at IS NOT NULL AS leased FROM public.upscale_executions WHERE job_id=$1',
            [job.job_id]
          )
        ).rows[0].leased
    )
    .toBe(true);
  await page.reload();
  await expect
    .poll(
      async () =>
        (
          await harness.backend.db.query(
            'SELECT stage FROM public.upscale_executions WHERE job_id=$1',
            [job.job_id]
          )
        ).rows[0].stage
    )
    .toBe('ready');
  harness.backend.putObject(outputPath, output);
  await originalResult(page, user, job.job_id, info);
  expect(
    harness.requests.filter(
      request => request.path === '/api/upscale/output' && request.jobId === job.job_id
    ).length
  ).toBeGreaterThanOrEqual(2);
});

test('should reject a stale browser protocol before reserving credits', async ({
  page,
  context,
}) => {
  const user = await harness.backend.createUser();
  await signIn(context, user);
  await openWorkspace(page, user);
  await page.route('**/api/upscale', async route => {
    const headers = { ...route.request().headers() };
    delete headers['x-upscale-protocol'];
    await route.continue({ headers });
  });
  const rejected = page.waitForResponse(
    response => new URL(response.url()).pathname === '/api/upscale'
  );
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: 'original.png', mimeType: 'image/png', buffer: source });
  await page.locator('[data-driver="process-button"]').click();
  expect((await rejected).status()).toBe(426);
  await expect(
    page.getByText('Refresh this page to continue processing images.', { exact: true }).first()
  ).toBeVisible();
  const {
    rows: [ledger],
  } = await harness.backend.db.query(
    `
    SELECT (SELECT COUNT(*)::integer FROM public.upscale_executions WHERE user_id=$1) AS jobs,
      (SELECT COUNT(*)::integer FROM public.processing_credit_reservations WHERE user_id=$1) AS reservations,
      subscription_credits_balance AS balance FROM public.profiles WHERE id=$1`,
    [user.id]
  );
  expect(ledger).toEqual({ jobs: 0, reservations: 0, balance: 20 });
});

test('should preserve the original job beyond thirty minutes of unavailable polling', async ({
  page,
  context,
}, info) => {
  const user = await harness.backend.createUser();
  await signIn(context, user);
  await openWorkspace(page, user);
  let unavailable = true;
  await page.route('**/api/upscale/jobs?jobId=*', async route => {
    if (!unavailable) {
      await route.continue();
      return;
    }
    await route.fetch();
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });
  const job = await startImage(page, user);
  await expect(page.getByText('Reconnecting… Your image is still processing.')).toBeVisible();
  await page.screenshot({ path: info.outputPath('desktop-reconnecting.png'), fullPage: true });
  await page.clock.install();
  await page.clock.fastForward(31 * 60_000);
  await expect(page.locator('[data-driver="process-button"]')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Try Again', exact: true })).toHaveCount(0);
  await harness.backend.stageReady(job.job_id, output);
  unavailable = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await originalResult(page, user, job.job_id, info);
  expect(
    harness.requests.filter(
      request => request.path === '/api/upscale' && request.jobId === job.job_id
    )
  ).toHaveLength(1);
});
