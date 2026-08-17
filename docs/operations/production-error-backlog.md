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

