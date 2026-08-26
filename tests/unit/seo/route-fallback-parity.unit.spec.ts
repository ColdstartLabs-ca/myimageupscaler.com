import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'tinyglobby';

describe('locale pSEO metadata fallback parity', () => {
  it('should have no route returning bare metadata from missing localized data', () => {
    const offenders = globSync('app/[[]locale]/(pseo)/**/page.tsx').filter(file => {
      const source = readFileSync(file, 'utf8');
      return /if\s*\(\s*!result\.data\s*\)\s*return\s*\{\s*\}/.test(source);
    });

    expect(offenders).toEqual([]);
  });
});
