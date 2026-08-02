import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('free-tier processing analytics', () => {
  it('records image_uploaded immediately without waiting for dimension loading', () => {
    const queueSource = readFileSync('client/hooks/useBatchQueue.ts', 'utf8');
    const addFilesStart = queueSource.indexOf('const addFiles = useCallback');
    const processStart = queueSource.indexOf('const processSingleItem = async');
    const uploadEvent = queueSource.indexOf("analytics.track('image_uploaded'");
    const dimensionLookup = queueSource.indexOf('loadImageDimensions(file)', addFilesStart);

    expect(uploadEvent).toBeGreaterThan(addFilesStart);
    expect(uploadEvent).toBeLessThan(processStart);
    expect(uploadEvent).toBeLessThan(dimensionLookup);
    expect(queueSource).toContain('fileSizeBucket');
    expect(queueSource).toContain('fileType: fileTelemetry.fileType');
    expect(queueSource).toContain('source,');
    expect(queueSource).toContain('isGuest,');
    expect(queueSource).not.toContain('fileSize: file.size');
    expect(queueSource).not.toContain('fileName: item.file.name');
    expect(queueSource).not.toContain("source: 'completed_processing',\n        isGuest: false");
  });

  it('uses the shared privacy-safe file normalizer and avoids duplicate API terminal events', () => {
    const queueSource = readFileSync('client/hooks/useBatchQueue.ts', 'utf8');
    const preprocessingSource = readFileSync('client/utils/upscale-file-preprocessing.ts', 'utf8');

    expect(preprocessingSource).toContain('normalizeImageUpscaledProperties');
    expect(queueSource).toContain("config.qualityTier === 'bg-removal'");
    expect(queueSource).toContain("normalizeCoreEventProperties('processing_failed'");
  });

  it('records background removal only after browser processing succeeds', () => {
    const apiClient = readFileSync('client/utils/api-client.ts', 'utf8');
    const deductRoute = readFileSync('app/api/bg-removal/deduct/route.ts', 'utf8');

    expect(apiClient.indexOf('const result = await processBackgroundRemoval')).toBeLessThan(
      apiClient.indexOf("analytics.track('image_upscaled'")
    );
    expect(apiClient).toContain("normalizeCoreEventProperties('image_upscaled'");
    expect(deductRoute).not.toContain("trackServerEvent(\n      'image_upscaled'");
  });
});
