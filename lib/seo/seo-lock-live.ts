import { diffLock, extractSeoFields, type ISeoLock, type ISeoLockFields } from './seo-lock';

export interface ILiveSeoPage {
  fields?: ISeoLockFields;
  error?: string;
}

export interface ISeoDriftRow {
  path: string;
  field: string;
  expected: unknown;
  actual: unknown;
}

export async function readLiveSeoFields(
  baseUrl: string,
  path: string,
  fetcher: typeof fetch = fetch
): Promise<ILiveSeoPage> {
  try {
    const url = new URL(path, baseUrl);
    if (!path.startsWith('/') || url.origin !== new URL(baseUrl).origin) {
      throw new Error('Lock path must stay on the site origin');
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetcher(url.toString(), {
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status >= 500 && attempt === 0) {
        await response.body?.cancel();
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        return { error: `HTTP ${response.status}` };
      }
      return { fields: await extractSeoFields(await response.text()) };
    }
    return { error: 'No response' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function collectSeoDrift(
  lock: ISeoLock,
  readPage: (path: string) => Promise<ILiveSeoPage>
): Promise<ISeoDriftRow[]> {
  const rows: ISeoDriftRow[] = [];
  for (const [path, entry] of Object.entries(lock)) {
    const page = await readPage(path);
    if (!page.fields) {
      rows.push({
        path,
        field: 'unreachable',
        expected: '2xx HTML',
        actual: page.error ?? 'No fields',
      });
    } else {
      rows.push(...diffLock(entry, page.fields).map(diff => ({ path, ...diff })));
    }
  }
  return rows;
}
