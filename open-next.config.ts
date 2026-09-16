import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';
import { withRegionalCache } from '@opennextjs/cloudflare/overrides/incremental-cache/regional-cache';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';

export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: 'long-lived' }),
  // The durable queue is the precondition for interception: the 2026-08-31 outage
  // was interception running against the dummy queue. Keep the two together —
  // tests enforce interception ⇒ durable queue ⇒ binding.
  queue: doQueue,
  // Serve prerendered SSG/ISR responses from the incremental cache before the Next
  // server bundle loads. The queue above makes this safe; preview acceptance
  // (`docs/PRDs/done/opennext-revalidation-queue.md` §5.5/§7) gates production.
  enableCacheInterception: true,
});
