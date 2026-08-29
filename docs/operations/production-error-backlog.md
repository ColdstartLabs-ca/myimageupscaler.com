# MIU Production Error Backlog

Automated static-first production findings. Entries are deduplicated by fingerprint. `urgent` means production-breaking; `relevant` means actionable but not currently breaking production.
Updated 2026-08-10 for the upscale completion-rate recovery.

## Closed findings — mitigation implemented locally

### 2026-08-06T20:08:21+00:00 — `miu-228e9c035d1ccf8f` — relevant

- **Signature:** `worker-myimageupscaler-status-exceededMemory`
- **Count/window:** 20 in the sampled window
- **Evidence:** `{"count_15m": 1, "count_3h": 20, "live_health": {"api_health": {"latency_ms": 1198, "status": 200}, "homepage": {"latency_ms": 343, "status": 200}}, "rate_15m": 0.00424, "rate_3h": 0.00551, "requests_15m": 236, "requests_3h": 3628}`
- **Assessment:** 20 memory-limit failures in 3 hours at 0.55% of requests; health endpoints remain successful.
- **Resolution:** The client now enforces the tier byte ceiling before upload, including the quick-path early return.
- **Status:** Closed — mitigation implemented locally; post-deploy verification pending

### 2026-08-07T17:39:26+00:00 — `miu-228e9c035d1ccf8f` — relevant

- **Signature:** `worker-myimageupscaler-status-exceededMemory`
- **Count/window:** 41 in the sampled window
- **Evidence:** `{"count_15m": 20, "count_3h": 41, "live_health": {"api_health": {"latency_ms": 1209, "status": 200}, "homepage": {"latency_ms": 1398, "status": 200}}, "rate_15m": 0.0597, "rate_3h": 0.01484, "requests_15m": 335, "requests_3h": 2762}`
- **Assessment:** 41 failures in 2,762 requests over 3h, including 20 in the last 15m, with homepage and API health returning 200.
- **Resolution:** The client now enforces the tier byte ceiling before upload, including the quick-path early return.
- **Status:** Closed — mitigation implemented locally; post-deploy verification pending

### 2026-08-07T18:40:19+00:00 — `miu-228e9c035d1ccf8f` — relevant

- **Signature:** `worker-myimageupscaler-status-exceededMemory`
- **Count/window:** 83 in the sampled window
- **Evidence:** `{"count_15m": 15, "count_3h": 83, "live_health": {"api_health": {"latency_ms": 1272, "status": 200}, "homepage": {"latency_ms": 1392, "status": 200}}, "rate_15m": 0.11278, "rate_3h": 0.0267, "requests_15m": 133, "requests_3h": 3109}`
- **Assessment:** 83 memory-limit failures in 3,109 requests over 3h, rising to 15/133 in 15m, while homepage and API health return 200.
- **Resolution:** The client now enforces the tier byte ceiling before upload, including the quick-path early return. A real 12MP PNG proof produced a 4.41MB upload under the 5MB free-tier ceiling.
- **Status:** Closed — mitigation implemented locally; post-deploy verification pending

### 2026-08-08T03:49:09+00:00 — `miu-228e9c035d1ccf8f` — relevant

- **Signature:** `worker-myimageupscaler-status-exceededMemory`
- **Count/window:** 60 in the sampled window
- **Evidence:** `{"count_15m": 0, "count_3h": 60, "live_health": {"api_health": {"latency_ms": 1151, "status": 200}, "homepage": {"latency_ms": 1309, "status": 200}}, "rate_15m": 0.0, "rate_3h": 0.01859, "requests_15m": 178, "requests_3h": 3228}`
- **Assessment:** 60 failures in 3,228 requests over 3h (1.86%), with healthy endpoints and none in the latest 15m.
- **Resolution:** The client now enforces the tier byte ceiling before upload, including the quick-path early return.
- **Status:** Closed — mitigation implemented locally; post-deploy verification pending

### 2026-08-08T07:56:45+00:00 — `miu-228e9c035d1ccf8f` — relevant

- **Signature:** `worker-myimageupscaler-status-exceededMemory`
- **Count/window:** 71 in the sampled window
- **Evidence:** `{"count_15m": 11, "count_3h": 71, "live_health": {"api_health": {"latency_ms": 1073, "status": 200}, "homepage": {"latency_ms": 1232, "status": 200}}, "rate_15m": 0.05263, "rate_3h": 0.02229, "requests_15m": 209, "requests_3h": 3185}`
- **Assessment:** 71/3185 failures in 3h and 11/209 in 15m despite healthy 200 endpoints; recurring memory pressure, not an outage.
- **Resolution:** The client now enforces the tier byte ceiling before upload, including the quick-path early return.
- **Status:** Closed — mitigation implemented locally; post-deploy verification pending

## Evidence boundary

The implementation and 12MP client proof are complete locally. A post-deploy three-hour
Cloudflare observation confirming `exceededMemory <= 0.1%` is still required; live
`wrangler tail` was blocked in this lane because `CLOUDFLARE_API_TOKEN` was not
available. Do not treat the pre-fix rates above as a post-deploy measurement.

### 2026-08-11T10:09:12+00:00 — `miu-228e9c035d1ccf8f` — relevant

- **Signature:** `worker-myimageupscaler-status-exceededMemory`
- **Count/window:** 35 in the sampled window
- **Evidence:** `{"count_15m": 3, "count_3h": 35, "live_health": {"api_health": {"latency_ms": 1013, "status": 200}, "homepage": {"latency_ms": 1276, "status": 200}}, "rate_15m": 0.03797, "rate_3h": 0.01502, "requests_15m": 79, "requests_3h": 2330}`
- **Assessment:** 35 memory failures in 2,330 requests over 3 hours, rising to 3 in 79 recently, while homepage and API health remain 200.
- **Next action:** Inspect high-memory inputs and worker limits, add safeguards, and monitor the failure rate.
- **Status:** Open

### 2026-08-15T22:15:20+00:00 — `miu-228e9c035d1ccf8f` — relevant

- **Signature:** `worker-myimageupscaler-status-exceededMemory`
- **Count/window:** 39 in the sampled window
- **Evidence:** `{"count_15m": 16, "count_3h": 39, "live_health": {"api_health": {"latency_ms": 1150, "status": 200}, "homepage": {"latency_ms": 1608, "status": 200}}, "rate_15m": 0.1203, "rate_3h": 0.02057, "requests_15m": 133, "requests_3h": 1896}`
- **Assessment:** 39 errors in 3h (2.1% of 1,896 requests) and 16 in the last 15m (12.0%), while endpoints remain healthy.
- **Next action:** Investigate worker memory usage and request sizes, then monitor the error rate after mitigation.
- **Status:** Open

### 2026-08-16T05:22:40+00:00 — `miu-228e9c035d1ccf8f` — relevant

- **Signature:** `worker-myimageupscaler-status-exceededMemory`
- **Count/window:** 42 in the sampled window
- **Evidence:** `{"count_15m": 5, "count_3h": 42, "live_health": {"api_health": {"latency_ms": 1474, "status": 200}, "homepage": {"latency_ms": 2130, "status": 200}}, "rate_15m": 0.04202, "rate_3h": 0.0167, "requests_15m": 119, "requests_3h": 2515}`
- **Assessment:** 42 memory failures in 2,515 requests over 3h, rising to 4.2% in 15m; endpoints remain healthy.
- **Next action:** Inspect affected image sizes and worker memory limits, then reproduce and tune or constrain workloads.
- **Status:** Open

### 2026-08-16T16:33:10+00:00 — `miu-228e9c035d1ccf8f` — relevant

- **Signature:** `worker-myimageupscaler-status-exceededMemory`
- **Count/window:** 48 in the sampled window
- **Evidence:** `{"count_15m": 3, "count_3h": 48, "live_health": {"api_health": {"latency_ms": 1236, "status": 200}, "homepage": {"latency_ms": 2134, "status": 200}}, "rate_15m": 0.01345, "rate_3h": 0.01564, "requests_15m": 223, "requests_3h": 3070}`
- **Assessment:** 48 memory-exceeded failures in 3h across 3070 requests while health checks remain 200.
- **Next action:** Inspect worker memory limits, image-size distribution, and failing jobs; add mitigation if needed.
- **Status:** Open

### 2026-08-22T09:14:00+00:00 — `miu-228e9c035d1ccf8f` — relevant

- **Signature:** `worker-myimageupscaler-status-exceededMemory`
- **Count/window:** 14 in the sampled window
- **Evidence:** `{"count_15m": 1, "count_3h": 14, "live_health": {"api_health": {"latency_ms": 1104, "status": 200}, "homepage": {"latency_ms": 1476, "status": 200}}, "rate_15m": 0.0068, "rate_3h": 0.00614, "requests_15m": 147, "requests_3h": 2280}`
- **Assessment:** 14 memory exceedances in 2,280 requests over 3h (0.61%), including 1 in the last 15m, while endpoints remain healthy.
- **Next action:** Investigate affected image sizes and worker memory limits, then backlog a targeted fix.
- **Status:** Open

### 2026-08-23T01:31:03+00:00 — `miu-228e9c035d1ccf8f` — relevant

- **Signature:** `worker-myimageupscaler-status-exceededMemory`
- **Count/window:** 19 in the sampled window
- **Evidence:** `{"count_15m": 1, "count_3h": 19, "live_health": {"api_health": {"latency_ms": 1271, "status": 200}, "homepage": {"latency_ms": 1622, "status": 200}}, "rate_15m": 0.00495, "rate_3h": 0.0059, "requests_15m": 202, "requests_3h": 3223}`
- **Assessment:** 19 exceeded-memory events across 3,223 requests in 3h (0.59%), with healthy HTTP 200 endpoints and no broad outage.
- **Next action:** Inspect affected image sizes and worker memory limits, then tune or cap workloads and monitor recurrence.
- **Status:** Open

### 2026-08-23T12:42:51+00:00 — `miu-228e9c035d1ccf8f` — relevant

- **Signature:** `worker-myimageupscaler-status-exceededMemory`
- **Count/window:** 39 in the sampled window
- **Evidence:** `{"count_15m": 2, "count_3h": 39, "live_health": {"api_health": {"latency_ms": 1004, "status": 200}, "homepage": {"latency_ms": 1408, "status": 200}}, "rate_15m": 0.00637, "rate_3h": 0.01461, "requests_15m": 314, "requests_3h": 2670}`
- **Assessment:** 39 exceeded-memory errors in 3h (1.46%) recur while health endpoints remain up.
- **Next action:** Inspect worker memory usage and workload sizes, then tune limits or batching.
- **Status:** Open

### 2026-08-25T03:21:54+00:00 — `miu-228e9c035d1ccf8f` — relevant

- **Signature:** `worker-myimageupscaler-status-exceededMemory`
- **Count/window:** 11 in the sampled window
- **Evidence:** `{"count_15m": 0, "count_3h": 11, "live_health": {"api_health": {"latency_ms": 1244, "status": 200}, "homepage": {"latency_ms": 2403, "status": 200}}, "rate_15m": 0.0, "rate_3h": 0.00542, "requests_15m": 112, "requests_3h": 2029}`
- **Assessment:** 11 memory-limit failures in 3 hours at a 0.54% rate, with healthy endpoints and no failures in the last 15 minutes.
- **Next action:** Review worker memory usage and limits, then reproduce and mitigate the failing workload.
- **Status:** Open

### 2026-08-25T04:22:56+00:00 — `miu-228e9c035d1ccf8f` — relevant

- **Signature:** `worker-myimageupscaler-status-exceededMemory`
- **Count/window:** 30 in the sampled window
- **Evidence:** `{"count_15m": 19, "count_3h": 30, "live_health": {"api_health": {"latency_ms": 1322, "status": 200}, "homepage": {"latency_ms": 929, "status": 200}}, "rate_15m": 0.06507, "rate_3h": 0.01197, "requests_15m": 292, "requests_3h": 2507}`
- **Assessment:** 30 failures in 2,507 requests over 3 hours, rising to 19 in 292 requests over 15 minutes; endpoints remain healthy.
- **Next action:** Investigate worker memory usage and request-size patterns, then tune limits or processing.
- **Status:** Open
### 2026-08-28T03:34:53+00:00 — `miu-228e9c035d1ccf8f` — relevant

- **Signature:** `worker-myimageupscaler-status-exceededMemory`
- **Count/window:** 23 in the sampled window
- **Evidence:** `{"count_15m": 4, "count_3h": 23, "live_health": {"api_health": {"latency_ms": 861, "status": 200}, "homepage": {"latency_ms": 874, "status": 200}}, "rate_15m": 0.0226, "rate_3h": 0.01343, "requests_15m": 177, "requests_3h": 1712}`
- **Assessment:** 23 exceeded-memory errors across 1712 requests in 3h, rising to 4 of 177 in 15m, while health checks remain 200.
- **Next action:** Investigate worker memory usage and input-size patterns, then tune limits or processing before the failure rate grows.
- **Status:** Open

### 2026-08-28T05:36:59+00:00 — `miu-fb691e9458f01b78` — relevant

- **Signature:** `endpoint-homepage-status-500`
- **Count/window:** 1 in the sampled window
- **Evidence:** `{"latency_ms": 1079, "status": 500}`
- **Assessment:** Homepage returned 500 once while API health is 200 and workers are succeeding; no evidence of broad outage.
- **Next action:** Investigate the homepage 500 and add a regression check.
- **Status:** Open

### 2026-08-28T19:51:24+00:00 — `miu-228e9c035d1ccf8f` — relevant

- **Signature:** `worker-myimageupscaler-status-exceededMemory`
- **Count/window:** 18 in the sampled window
- **Evidence:** `{"count_15m": 6, "count_3h": 18, "live_health": {"api_health": {"latency_ms": 1430, "status": 200}, "homepage": {"latency_ms": 1027, "status": 200}}, "rate_15m": 0.01818, "rate_3h": 0.01002, "requests_15m": 330, "requests_3h": 1796}`
- **Assessment:** 18 of 1,796 jobs failed from exceeded memory (1.0%), including 6 in the last 15 minutes, while health endpoints remain 200.
- **Next action:** Inspect failing image sizes and worker memory limits, then monitor the failure rate after mitigation.
- **Status:** Open

