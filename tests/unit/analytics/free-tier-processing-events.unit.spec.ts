import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('free-tier processing analytics', () => {
  it('records image_uploaded at add time with guest and source context', () => {
    const queueSource = readFileSync('client/hooks/useBatchQueue.ts', 'utf8');
    const addFilesStart = queueSource.indexOf('const addFiles = useCallback');
    const processStart = queueSource.indexOf('const processSingleItem = async');
    const uploadEvent = queueSource.indexOf("analytics.track('image_uploaded'");

    expect(uploadEvent).toBeGreaterThan(addFilesStart);
    expect(uploadEvent).toBeLessThan(processStart);
    expect(queueSource).toContain('source,');
    expect(queueSource).toContain('isGuest,');
    expect(queueSource).not.toContain("source: 'completed_processing',\n        isGuest: false");
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
