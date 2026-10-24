import dayjs from 'dayjs';
import signedLock from '@/content/seo-lock.json';
import proposals from '@/content/seo-lock-proposals.json';
import { serverEnv } from '@shared/config/env';
import {
  loadEffectiveLock,
  normalizeSeoPath,
  SEO_LOCK_FIELDS,
  hasValidSeoChangeMetadata,
  type ISeoLock,
} from '@lib/seo/seo-lock';
import { collectSeoDrift, readLiveSeoFields, type ILiveSeoPage } from '@lib/seo/seo-lock-live';
import { classifySeoChange } from '@lib/seo/seo-lock-performance';
import { loadAutoSeoLocks, insertAutoSeoLock } from './seo-lock.service';
import { listSeoGateCommits } from './seo-lock-commits.service';
import {
  buildGscDateRange,
  createGscAccessToken,
  queryAllSearchAnalyticsRows,
} from './gsc.service';
import type {
  IGscDateRange,
  IGscSearchAnalyticsRequest,
  IGscSearchAnalyticsRow,
} from './gsc.types';
import { getEmailService } from './email.service';

const SITE = 'https://myimageupscaler.com';
const shift = (date: string, days: number) => dayjs(date).add(days, 'day').format('YYYY-MM-DD');
const validDate = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) && dayjs(date).format('YYYY-MM-DD') === date;
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

function pageClicks(rows: IGscSearchAnalyticsRow[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of rows) {
    if (typeof row.keys?.[0] !== 'string' || !Number.isFinite(row.clicks) || row.clicks < 0)
      throw new Error('Invalid GSC page row');
    const url = new URL(row.keys[0], SITE);
    if (url.origin !== SITE) continue;
    const path = normalizeSeoPath(url.pathname);
    result.set(path, (result.get(path) ?? 0) + row.clicks);
  }
  return result;
}

export async function runSeoLockDigest(): Promise<{
  checked: number;
  autoAdded: number;
  alertCount: number;
  emailSent: boolean;
}> {
  if (!serverEnv.GSC_SERVICE_ACCOUNT_EMAIL || !serverEnv.GSC_PRIVATE_KEY)
    throw new Error('Missing GSC credentials');
  const lock = await loadEffectiveLock(signedLock as ISeoLock, loadAutoSeoLocks);
  const current = buildGscDateRange(28, 3);
  const today = shift(current.endDate, 3);
  const previous = {
    startDate: shift(current.startDate, -28),
    endDate: shift(current.startDate, -1),
  };
  const token = await createGscAccessToken(
    serverEnv.GSC_SERVICE_ACCOUNT_EMAIL,
    serverEnv.GSC_PRIVATE_KEY
  );
  const query = (range: IGscDateRange, extra: Partial<IGscSearchAnalyticsRequest> = {}) =>
    queryAllSearchAnalyticsRows(token, serverEnv.GSC_SITE_URL, {
      ...range,
      dimensions: ['page'],
      rowLimit: 25000,
      type: 'web',
      dataState: 'final',
      ...extra,
    });
  const [currentRows, previousRows] = await Promise.all([query(current), query(previous)]);
  const nowClicks = pageClicks(currentRows),
    beforeClicks = pageClicks(previousRows);
  const pages = new Map<string, Promise<ILiveSeoPage>>();
  const readPage = (path: string) => {
    if (!pages.has(path)) pages.set(path, readLiveSeoFields(SITE, path));
    return pages.get(path)!;
  };
  const drift = await collectSeoDrift(lock, readPage);
  const sections = [
    {
      title: 'Drift',
      rows: drift.map(
        row =>
          `${row.path} ${row.field}: lock ${JSON.stringify(row.expected)}; live ${JSON.stringify(row.actual)}`
      ),
    },
    { title: 'Stop-loss', rows: [] as string[] },
    { title: 'Diagnosis: unchanged winners losing traffic', rows: [] as string[] },
    { title: 'New winners locked', rows: [] as string[] },
    { title: 'Proposals awaiting signed approval', rows: [] as string[] },
    { title: 'Gate-file commits', rows: [] as string[] },
    { title: 'Monitoring errors', rows: [] as string[] },
  ];
  const errors = sections[6].rows;
  const controlCache = new Map<string, Promise<number>>();
  const control = (range: IGscDateRange) => {
    const key = `${range.startDate}:${range.endDate}`;
    if (!controlCache.has(key))
      controlCache.set(
        key,
        query(range, {
          dimensions: [],
          dimensionFilterGroups: [
            {
              filters: [
                { dimension: 'query', operator: 'notEquals', expression: 'myimageupscaler' },
                { dimension: 'query', operator: 'notEquals', expression: 'my image upscaler' },
              ],
            },
          ],
        }).then(rows => rows.reduce((sum, row) => sum + row.clicks, 0))
      );
    return controlCache.get(key)!;
  };

  for (const [path, entry] of Object.entries(lock)) {
    const change = entry.change;
    if (!change || change.approvedAt < shift(current.endDate, -56)) {
      const before = beforeClicks.get(path) ?? 0,
        after = nowClicks.get(path) ?? 0;
      if (before >= 20 && after / before <= 0.7 + 1e-9)
        sections[2].rows.push(
          `${path}: ${before} → ${after} clicks (${Math.round((after / before - 1) * 100)}%). Diagnosis only; no automatic revert.`
        );
    }
    if (!change) continue;
    if (!hasValidSeoChangeMetadata(change)) {
      errors.push(`${path}: invalid signed change metadata; stop-loss was not evaluated.`);
      continue;
    }
    if (change.readbackDate > today) continue;
    const afterRange = {
      startDate: shift(change.approvedAt, 1),
      endDate: [current.endDate, shift(change.approvedAt, 28)].sort()[0],
    };
    const heldDays = dayjs(afterRange.endDate).diff(dayjs(afterRange.startDate), 'day') + 1;
    if (heldDays < 14) continue;
    const beforeRange = {
      startDate: shift(change.baselineEndDate, -27),
      endDate: change.baselineEndDate,
    };
    const [pageRows, controlBeforeClicks, controlAfterClicks] = await Promise.all([
      query(afterRange, {
        dimensions: [],
        dimensionFilterGroups: [
          { filters: [{ dimension: 'page', operator: 'equals', expression: `${SITE}${path}` }] },
        ],
      }),
      control(beforeRange),
      control(afterRange),
    ]);
    const verdict = classifySeoChange({
      beforeClicks: change.baselineClicks28d,
      afterClicks: pageRows.reduce((sum, row) => sum + row.clicks, 0),
      controlBeforeClicks,
      controlAfterClicks,
      heldDays,
    });
    if (!verdict) {
      errors.push(`${path}: insufficient non-brand control data; no verdict.`);
      continue;
    }
    let text = `${path}: ${verdict}, ${heldDays} complete days against site-wide non-brand control.`;
    if (verdict === 'LOSS')
      text += ` Proposed revert: yarn seo:lock:restore ${shellQuote(`--path=${path}`)} --from=${change.previousLockCommit} && git add content/seo-lock.json && git commit -S -m 'Restore approved SEO lock values'`;
    sections[1].rows.push(text);
  }

  let autoAdded = 0;
  for (const [path, clicks28d] of nowClicks) {
    if (clicks28d <= 20 || lock[path]) continue;
    const page = await readPage(path);
    if (!page.fields) {
      errors.push(`${path}: new winner could not be locked (${page.error ?? 'unreachable'}).`);
      continue;
    }
    if (
      await insertAutoSeoLock(path, {
        ...page.fields,
        clicks28d,
        source: /^\/(?:[a-z]{2}\/)?blog\//.test(path) ? 'db' : 'code',
      })
    ) {
      autoAdded++;
      sections[3].rows.push(`${path}: ${clicks28d} clicks / 28 days; live fields frozen.`);
    }
  }
  const weekStart = shift(today, -7);
  for (const value of proposals as unknown[]) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push('Invalid SEO lock proposal; expected an object.');
      continue;
    }
    const item = value as {
      path: string;
      source: string;
      proposedAt: string;
      field: string;
      proposedValue: unknown;
      evidence: string;
    };
    if (
      lock[item.path] &&
      ['three-kings-manager', 'blog-opportunities-publisher'].includes(item.source) &&
      validDate(item.proposedAt) &&
      item.proposedAt >= weekStart &&
      item.proposedAt <= today &&
      SEO_LOCK_FIELDS.some(field => field === item.field) &&
      typeof item.evidence === 'string' &&
      item.evidence.trim()
    ) {
      sections[4].rows.push(
        `${item.source}: ${item.path} ${item.field} → ${JSON.stringify(item.proposedValue)}. Evidence: ${item.evidence}`
      );
    }
  }
  try {
    sections[5].rows.push(...(await listSeoGateCommits(dayjs().subtract(7, 'day').toDate())));
  } catch (error) {
    errors.push(
      `Gate-file commit collection failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const populated = sections.filter(section => section.rows.length > 0);
  const alertCount = populated.reduce((sum, section) => sum + section.rows.length, 0);
  if (alertCount > 0) {
    const delivery = await getEmailService().send({
      to: serverEnv.ADMIN_EMAIL,
      type: 'transactional',
      template: 'seo-weekly-digest',
      data: {
        day: today,
        sections: populated,
      },
    });
    if (!delivery.success) throw new Error(delivery.error || 'SEO digest email was not accepted');
  }
  return { checked: Object.keys(lock).length, autoAdded, alertCount, emailSent: alertCount > 0 };
}
