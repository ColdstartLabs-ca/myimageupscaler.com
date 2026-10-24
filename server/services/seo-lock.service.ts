import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import type { ISeoLock, ISeoLockEntry } from '@/lib/seo/seo-lock';

const COLUMNS =
  'path,title,description,h1,intro_hash,canonical,robots,hreflang,json_ld_types,clicks_28d';

export async function loadAutoSeoLocks(paths?: string[]): Promise<ISeoLock> {
  if (paths?.length === 0) return {};
  const result: ISeoLock = {};
  for (let offset = 0; ; offset += 1000) {
    let query = supabaseAdmin.from('seo_lock_auto_entries').select(COLUMNS).order('path');
    if (paths) query = query.in('path', paths);
    const { data, error } = await query.range(offset, offset + 999);
    if (error) throw new Error(`Cannot read SEO auto locks: ${error.message}`);
    if (!data) throw new Error('Cannot read SEO auto locks: missing data');
    for (const row of data) {
      result[row.path] = {
        title: row.title,
        description: row.description,
        h1: row.h1,
        introHash: row.intro_hash,
        canonical: row.canonical,
        robots: row.robots,
        hreflang: row.hreflang,
        jsonLdTypes: row.json_ld_types,
        clicks28d: row.clicks_28d,
        source: /^\/(?:[a-z]{2}\/)?blog\//.test(row.path) ? 'db' : 'code',
      };
    }
    if (data.length < 1000) return result;
  }
}

export async function insertAutoSeoLock(path: string, entry: ISeoLockEntry): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('seo_lock_auto_entries')
    .upsert(
      {
        path,
        title: entry.title,
        description: entry.description,
        h1: entry.h1,
        intro_hash: entry.introHash,
        canonical: entry.canonical,
        robots: entry.robots,
        hreflang: entry.hreflang,
        json_ld_types: entry.jsonLdTypes,
        clicks_28d: entry.clicks28d,
      },
      { onConflict: 'path', ignoreDuplicates: true }
    )
    .select('path');
  if (error) throw new Error(`Cannot insert SEO auto lock: ${error.message}`);
  if (!data) throw new Error('Cannot insert SEO auto lock: missing data');
  return data.length > 0;
}
