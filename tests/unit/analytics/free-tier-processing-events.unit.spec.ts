import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('free-tier processing analytics', () => {
  it('records image_uploaded only after processing succeeds', () => {
    const queueSource = readFileSync('client/hooks/useBatchQueue.ts', 'utf8');

    expect(queueSource.indexOf("analytics.track('image_uploaded'")).toBeGreaterThan(
      queueSource.indexOf('const result = await processImage')
    );
  });

  it('records background removal only after browser processing succeeds', () => {
    const apiClient = readFileSync('client/utils/api-client.ts', 'utf8');
    const deductRoute = readFileSync('app/api/bg-removal/deduct/route.ts', 'utf8');

    expect(apiClient.indexOf('const result = await processBackgroundRemoval')).toBeLessThan(
      apiClient.indexOf("analytics.track('image_upscaled'")
    );
    expect(deductRoute).not.toContain("trackServerEvent(\n      'image_upscaled'");
  });
});
