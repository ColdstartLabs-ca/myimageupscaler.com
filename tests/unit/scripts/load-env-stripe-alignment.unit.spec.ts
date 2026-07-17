import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('production Stripe price alignment', () => {
  test('server Stripe prices override stale public prices from another Stripe account', () => {
    const directory = mkdtempSync(join(tmpdir(), 'miu-load-env-'));
    tempDirs.push(directory);
    cpSync(join(process.cwd(), 'scripts/load-env.sh'), join(directory, 'load-env.sh'));

    writeFileSync(
      join(directory, '.env.client.prod'),
      'NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SMALL=price_stale_client_account\n'
    );
    writeFileSync(
      join(directory, '.env.api.prod'),
      'STRIPE_PRICE_CREDITS_SMALL=price_current_server_account\n'
    );

    const result = execFileSync(
      'bash',
      [
        '-c',
        'source ./load-env.sh --prod >/dev/null && printf "%s" "$NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SMALL"',
      ],
      { cwd: directory, encoding: 'utf8' }
    );

    expect(result).toBe('price_current_server_account');
  });
});
