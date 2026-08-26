import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('removed voluntary upscale ack route', () => {
  it('does not expose /api/upscale/ack because delivery is acknowledged by streamed output', () => {
    expect(existsSync(join(process.cwd(), 'app/api/upscale/ack/route.ts'))).toBe(false);
  });
});
