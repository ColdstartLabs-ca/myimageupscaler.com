import { expect, test } from '@playwright/test';
import { startAsyncUpscaleDatabase } from '../helpers/async-upscale-database';

for (const omitted of [true, false]) {
  test(`installs async RPCs with retired legacy refund entrypoints omitted=${omitted}`, async () => {
    const database = await startAsyncUpscaleDatabase({ omitUnusedLegacyRefunds: omitted });
    try {
      const result = await database.pool.query(`SELECT
      to_regprocedure('public.list_active_async_upscale_jobs(uuid,integer)') IS NOT NULL AS active_jobs,
      to_regprocedure('public.read_async_upscale_job(uuid,uuid,text)') IS NOT NULL AS read_job,
      to_regprocedure('public.refund_credits_v2(uuid,integer,text,text,text)') IS NULL AS retired_v2,
      to_regprocedure('public.refund_credits_to_pool(uuid,integer,text,text,text)') IS NULL AS retired_pool`);
      expect(result.rows[0]).toEqual({
        active_jobs: true,
        read_job: true,
        retired_v2: omitted,
        retired_pool: omitted,
      });
    } finally {
      await database.close();
    }
  });
}
