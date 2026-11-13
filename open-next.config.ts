import { defineCloudflareConfig, getCloudflareContext } from '@opennextjs/cloudflare';
import purgeCache from '@opennextjs/cloudflare/overrides/cache-purge/index';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';
import { withRegionalCache } from '@opennextjs/cloudflare/overrides/incremental-cache/regional-cache';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';
import doShardedTagCache from '@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache';

const nonBlockingDoQueue: typeof doQueue = {
  name: 'durable-queue-non-blocking',
  send: async msg => {
    getCloudflareContext().ctx.waitUntil(
      doQueue.send(msg).catch(error => console.error('[isr-queue] revalidation send failed', error))
    );
  },
};

export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, {
    mode: 'long-lived',
    // Regional hits skip the tag DO; revalidatePath purges them by cache-tag via cachePurge below.
    bypassTagCacheOnCacheHit: true,
  }),
  // Required by bypassTagCacheOnCacheHit; needs CACHE_PURGE_API_TOKEN + CACHE_PURGE_ZONE_ID Worker secrets.
  cachePurge: purgeCache({ type: 'direct' }),
  // The queue handles expiry; revalidatePath needs a persistent tag store too.
  tagCache: doShardedTagCache({ baseShardSize: 4, regionalCache: false }),
  // The durable queue is the precondition for interception (2026-08-31 outage).
  // Send is fire-and-forget via ctx.waitUntil so stale hits do not wait on the DO RPC.
  queue: nonBlockingDoQueue,
  // Serve prerendered SSG/ISR responses from the incremental cache before the Next
  // server bundle loads. The queue above makes this safe; preview acceptance
  // (`docs/PRDs/done/platform/opennext-revalidation-queue.md` §5.5/§7) gates production.
  enableCacheInterception: true,
});
