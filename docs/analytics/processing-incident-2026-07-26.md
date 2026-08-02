# Processing Incident — 2026-07-26 UTC

Status: local incident-analysis tooling is implemented; live validation is
unavailable in this repository-only run.

## Evidence boundary

Repository evidence currently consists of the PRD's supplied audit baseline:

- `processing_failed` was reported at 424 events over the supplied 30-day
  period.
- The supplied baseline reports 142 failures on 2026-07-26.
- The supplied baseline reports 5.6% relative to `image_upscaled`.
- The PRD requires the failure rate denominator to be terminal attempts:
  `processing_failed / (processing_failed + successful terminal processing)`.

Those figures are documented inputs to the PRD, not a live export read by this
repository. No hourly, provider, model/tier, error-type, reason, application
log, provider-status, deploy-history, or retry-correlation export was supplied
here. Therefore this note does not name a dominant segment, onset, recovery
time, root cause, affected-user count, or remediation owner.

## Current conclusion

The cause is **unresolved**. The repository establishes the required analysis
shape and the known aggregate supplied by the PRD, but it cannot establish
whether the spike was caused by the application, a provider, both, or a data
pipeline issue. A follow-up defect must wait until evidence identifies a
product or provider cause.

## Local tooling

`scripts/incident-processing-2026-07-26.ts` accepts a redacted local JSON
export. It calculates:

- 24 hourly terminal-attempt counts and bounded error/reason/provider/model
  segments.
- Overall failure rate using successful plus failed terminal attempts.
- First failure, last failure, and post-failure recovery timestamps.
- Failed attempts that later succeeded, using explicit retry IDs or attempt
  groups and requiring the success to occur later.
- Distinct affected-user count only when stable user IDs are supplied; IDs are
  never emitted in the report.
- Evidence status, deployment markers, missing validation inputs, and an
  optional remediation owner/defect reference.

Example local-only invocation:

```bash
npx tsx scripts/incident-processing-2026-07-26.ts \
  --mode live \
  --allow-live-read \
  --input ./tmp/processing-incident-2026-07-26.json > ./tmp/processing-incident-report.json
```

`--allow-live-read` acknowledges that the local file is labelled `live`; it
does not grant the script network access. The script performs no API calls,
does not read secrets, and does not mutate production data.

## Redacted input shape

```json
{
  "mode": "live",
  "incidentDateUtc": "2026-07-26",
  "attempts": [
    {
      "attemptId": "attempt_example",
      "occurredAt": "2026-07-26T12:03:00.000Z",
      "outcome": "failure",
      "errorType": "provider_error",
      "reason": "upstream_unavailable",
      "provider": "replicate",
      "model": "high",
      "userId": "user_example",
      "attemptGroupId": "group_example"
    }
  ],
  "evidence": {
    "validationStatus": "provided_unverified",
    "providerSignals": [],
    "applicationSignals": [],
    "deployments": []
  }
}
```

The report is intentionally count-oriented. It never prints `userId`,
`attemptId`, retry IDs, raw messages, stack traces, or provider payloads.

## Required follow-up evidence

| Required finding             | Current state           | What closes the gap                                                        |
| ---------------------------- | ----------------------- | -------------------------------------------------------------------------- |
| Dominant failure segment     | unavailable             | Local export with bounded provider, model/tier, `errorType`, and `reason`. |
| Onset and recovery window    | unavailable             | Timestamped terminal attempts plus application/provider signals.           |
| Likely cause                 | unresolved              | Correlated application logs, provider status/logs, and deploy history.     |
| Affected attempts/users      | aggregate supplied only | Stable attempt data and optional privacy-safe user correlation.            |
| Retries that later succeeded | unavailable             | `retryOfAttemptId` or `attemptGroupId` in the local export.                |
| Remediation owner            | unassigned              | Evidence-backed defect and an explicitly supplied owner.                   |

Once a redacted export is available, save the generated JSON next to this
note as an evidence artifact and update this document with the script output.
Do not paste production secrets or raw user identifiers into the repository.
