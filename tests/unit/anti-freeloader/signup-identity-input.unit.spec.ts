import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const signupPaths = [
  'client/components/modal/auth/AuthenticationModal.tsx',
  'client/store/auth/authOperations.ts',
  'client/store/auth/types.ts',
  'client/store/userStore.ts',
  'app/[locale]/auth/callback/page.tsx',
  'app/[locale]/auth/confirm/page.tsx',
];

describe('signup identity input', () => {
  it('does not send a browser fingerprint to free-credit setup', () => {
    for (const path of signupPaths) {
      expect(readFileSync(path, 'utf8')).not.toContain('fingerprintHash');
      expect(readFileSync(path, 'utf8')).not.toContain('register_fingerprint');
    }
  });
});
