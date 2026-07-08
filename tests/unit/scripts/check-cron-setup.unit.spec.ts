import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('check-cron-setup script', () => {
  it('accepts cron endpoints that include query parameters', () => {
    const output = execFileSync('node', ['scripts/check-cron-setup.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(output).toContain('OK: cron setup valid');
  });
});
