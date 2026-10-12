import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const preflightScriptPath = path.resolve(process.cwd(), 'scripts/deploy/steps/01-preflight.sh');

const VALID: Record<string, string> = {
  CLOUDFLARE_API_TOKEN: 'token',
  CLOUDFLARE_ACCOUNT_ID: 'acct',
  CLOUDFLARE_ZONE_ID: 'zone',
  DOMAIN_NAME: 'myimageupscaler.com',
  R2_ACCESS_KEY_ID: 'r2-key',
  R2_SECRET_ACCESS_KEY: 'r2-secret',
};

function runCloudflareCredentialsCheck(overrides: Partial<Record<string, string>> = {}) {
  return spawnSync(
    'bash',
    [
      '-c',
      `set -euo pipefail
log_success() { :; }
log_error() { printf '%s\\n' "$1" >&2; exit 1; }
source "$PREFLIGHT_SCRIPT"
_check_cloudflare_credentials`,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, ...VALID, PREFLIGHT_SCRIPT: preflightScriptPath, ...overrides },
    }
  );
}

describe('R2 deploy preflight', () => {
  test('accepts a complete Cloudflare and R2 credential set', () => {
    expect(runCloudflareCredentialsCheck().status).toBe(0);
  });

  test.each([['CLOUDFLARE_ACCOUNT_ID'], ['R2_ACCESS_KEY_ID'], ['R2_SECRET_ACCESS_KEY']])(
    'blocks deployment when %s is missing',
    name => {
      const result = runCloudflareCredentialsCheck({ [name]: '' });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`Missing ${name}`);
    }
  );
});
