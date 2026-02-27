'use client';

import { useEffect, useState } from 'react';

let cachedHash: string | null = null;

/**
 * Returns the FingerprintJS visitor ID hash for multi-account detection.
 * Uses module-level cache so FingerprintJS only loads once per browser session.
 * Returns null until the hash is available — callers must treat it as optional.
 */
export function useFingerprint(): string | null {
  const [hash, setHash] = useState<string | null>(cachedHash);

  useEffect(() => {
    if (cachedHash !== null) return;
    // Dynamic import — FingerprintJS is ESM, works with vitest dynamic imports
    import('@fingerprintjs/fingerprintjs')
      .then(FingerprintJS => FingerprintJS.load())
      .then(fp => fp.get())
      .then(result => {
        cachedHash = result.visitorId;
        setHash(cachedHash);
      })
      .catch(() => {}); // best-effort, silent failure is acceptable
  }, []);

  return hash;
}
