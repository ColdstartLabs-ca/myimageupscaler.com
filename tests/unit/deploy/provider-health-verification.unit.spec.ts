import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';

const verifyScriptPath = path.resolve(process.cwd(), 'scripts/deploy/steps/06-verify.sh');
const preflightScriptPath = path.resolve(process.cwd(), 'scripts/deploy/steps/01-preflight.sh');
const secretsScriptPath = path.resolve(process.cwd(), 'scripts/deploy/steps/05-secrets.sh');
const deployScriptPath = path.resolve(process.cwd(), 'scripts/deploy/deploy.sh');
const verifyScript = readFileSync(verifyScriptPath, 'utf8');
const preflightScript = readFileSync(preflightScriptPath, 'utf8');
const secretsScript = readFileSync(secretsScriptPath, 'utf8');
const deployScript = readFileSync(deployScriptPath, 'utf8');

function runProviderObservabilityPreflight(overrides: Partial<Record<string, string>> = {}) {
  return spawnSync(
    'bash',
    [
      '-c',
      `set -euo pipefail
log_success() { :; }
log_error() { printf '%s\\n' "$1" >&2; exit 1; }
source "$PREFLIGHT_SCRIPT"
_check_provider_observability`,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        BASELIME_API_KEY: 'baselime-key',
        BREVO_API_KEY: '',
        CLOUDFLARE_EMAIL_API_TOKEN: 'email-key',
        PREFLIGHT_SCRIPT: preflightScriptPath,
        PROVIDER_ALERT_EMAIL: 'alerts@example.com',
        ...overrides,
      },
    }
  );
}

function runProviderHealthVerification({
  responseBody = '{"success":true,"alerted":false}',
  responseCode = '200',
  secret = 'cron-secret',
}: {
  responseBody?: string;
  responseCode?: string;
  secret?: string;
} = {}) {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'provider-health-verify-'));
  const fakeBin = path.join(fixtureRoot, 'bin');
  const callLog = path.join(fixtureRoot, 'curl.log');
  mkdirSync(fakeBin, { recursive: true });

  const fakeCurl = path.join(fakeBin, 'curl');
  writeFileSync(
    fakeCurl,
    `#!/bin/bash
set -euo pipefail
printf '%s\\n' "$*" > "$CALL_LOG"
output_file=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "-o" ]]; then
    output_file="$2"
    shift 2
    continue
  fi
  shift
done
printf '%s' "$RESPONSE_BODY" > "$output_file"
printf '%s' "$RESPONSE_CODE"
`
  );
  chmodSync(fakeCurl, 0o755);

  const result = spawnSync(
    'bash',
    [
      '-c',
      `set -euo pipefail
log_info() { :; }
log_success() { :; }
log_error() { printf '%s\\n' "$1" >&2; exit 1; }
source "$VERIFY_SCRIPT"
_verify_provider_health_cron "https://example.com"`,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        CALL_LOG: callLog,
        CRON_SECRET: secret,
        PATH: `${fakeBin}:${process.env.PATH}`,
        RESPONSE_BODY: responseBody,
        RESPONSE_CODE: responseCode,
        VERIFY_SCRIPT: verifyScriptPath,
      },
    }
  );

  return {
    ...result,
    curlCall: (() => {
      try {
        return readFileSync(callLog, 'utf8');
      } catch {
        return '';
      }
    })(),
  };
}

describe('provider health deployment verification', () => {
  test('blocks deployment without provider observability and alert delivery settings', () => {
    expect(preflightScript).toContain('BASELIME_API_KEY');
    expect(preflightScript).toContain('PROVIDER_ALERT_EMAIL');
    expect(preflightScript).toContain('CLOUDFLARE_EMAIL_API_TOKEN');
    expect(preflightScript).toContain('BREVO_API_KEY');
  });

  test('uploads provider observability and alert routing settings', () => {
    expect(secretsScript).toContain('BASELIME_API_KEY');
    expect(secretsScript).toContain('PROVIDER_ALERT_EMAIL');
  });

  test('runs provider observability preflight before production migrations', () => {
    const preflightIndex = deployScript.indexOf('step_preflight');
    const migrationIndex = deployScript.indexOf('deploy_database_migrations');

    expect(preflightIndex).toBeGreaterThan(-1);
    expect(migrationIndex).toBeGreaterThan(-1);
    expect(preflightIndex).toBeLessThan(migrationIndex);
  });

  test('accepts a configured logger, alert destination, and email provider', () => {
    expect(runProviderObservabilityPreflight().status).toBe(0);
    expect(
      runProviderObservabilityPreflight({
        BREVO_API_KEY: 'brevo-key',
        CLOUDFLARE_EMAIL_API_TOKEN: '',
      }).status
    ).toBe(0);
  });

  test.each([
    [{ BASELIME_API_KEY: '' }, 'Missing BASELIME_API_KEY'],
    [{ PROVIDER_ALERT_EMAIL: '' }, 'Missing PROVIDER_ALERT_EMAIL'],
    [{ BREVO_API_KEY: '', CLOUDFLARE_EMAIL_API_TOKEN: '' }, 'Missing alert delivery provider'],
  ])('blocks deployment when provider paging is inert', (overrides, expectedError) => {
    const result = runProviderObservabilityPreflight(overrides);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(expectedError);
  });

  test('calls the authenticated provider-health cron route after deployment', () => {
    expect(verifyScript).toContain('_verify_provider_health_cron "$url"');
    expect(verifyScript).toContain('-X POST "$url/api/cron/provider-health"');
    expect(verifyScript).toContain('/api/cron/provider-health');
    expect(verifyScript).toContain('-H "x-cron-secret: $cron_secret"');
  });

  test('requires a successful provider-health response', () => {
    expect(verifyScript).toContain('Provider health verification returned HTTP $response_code');
    expect(verifyScript).toContain("jq -e '.success == true'");
    expect(verifyScript).toContain('Provider health cron verification failed');
  });

  test('passes the cron secret and accepts a healthy response', () => {
    const result = runProviderHealthVerification();

    expect(result.status).toBe(0);
    expect(result.curlCall).toContain('-X POST https://example.com/api/cron/provider-health');
    expect(result.curlCall).toContain('-H x-cron-secret: cron-secret');
  });

  test.each([
    [{ secret: '' }, 'CRON_SECRET is required'],
    [{ responseCode: '500' }, 'returned HTTP 500'],
    [{ responseBody: '{"success":false}' }, 'verification failed'],
  ])('blocks deployment when provider health verification fails', (options, expectedError) => {
    const result = runProviderHealthVerification(options);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(expectedError);
  });
});
