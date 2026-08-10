# Production Error Backlog

Updated 2026-08-10 for the upscale completion-rate recovery.

## Closed mitigations

| Error                                          | First observed |                                                        Observed rate | Status                          | Resolution                                                                                                                                                                          |
| ---------------------------------------------- | -------------- | -------------------------------------------------------------------: | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worker-myimageupscaler-status-exceededMemory` | 2026-08-06     | 0.42–2.67% overall; 11.3% in the 2026-08-07T18:40Z window (83/3,109) | Closed — mitigation implemented | The client now enforces the tier byte ceiling before upload, including the quick-path early return. A real 12MP PNG proof produced a 4.41MB upload under the 5MB free-tier ceiling. |

## Evidence boundary

The implementation and 12MP client proof are complete locally. A post-deploy three-hour
Cloudflare observation confirming `exceededMemory <= 0.1%` is still required; live
`wrangler tail` was blocked in this lane because `CLOUDFLARE_API_TOKEN` was not
available. Do not treat the pre-fix rates above as a post-deploy measurement.
