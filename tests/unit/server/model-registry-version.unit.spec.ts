import { describe, expect, it } from 'vitest';

import { resolveRealEsrganModelVersion } from '@server/services/model-registry';

describe('Real-ESRGAN model version resolution', () => {
  it('prefers the dedicated override over the legacy global override', () => {
    expect(
      resolveRealEsrganModelVersion(
        'nightmareai/real-esrgan:dedicated-version',
        'nightmareai/real-esrgan:legacy-version'
      )
    ).toBe('nightmareai/real-esrgan:dedicated-version');
  });

  it('uses the legacy global override when the dedicated override is absent', () => {
    expect(resolveRealEsrganModelVersion(undefined, 'nightmareai/real-esrgan:legacy-version')).toBe(
      'nightmareai/real-esrgan:legacy-version'
    );
  });

  it('falls back to the pinned NightmareAI version', () => {
    expect(resolveRealEsrganModelVersion(undefined, undefined)).toMatch(
      /^nightmareai\/real-esrgan:[0-9a-f]{64}$/
    );
  });
});
