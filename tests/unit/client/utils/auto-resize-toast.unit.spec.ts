import { describe, expect, it } from 'vitest';
import { buildProcessingAutoResizeToastValues } from '@client/utils/auto-resize-toast';

describe('buildProcessingAutoResizeToastValues', () => {
  it('describes the final output as scale relative to the resized input', () => {
    expect(
      buildProcessingAutoResizeToastValues({
        resizedWidth: 1375,
        resizedHeight: 2048,
        scale: 2,
      })
    ).toEqual({
      resizedWidth: 1375,
      resizedHeight: 2048,
      scale: 2,
      expectedWidth: 2750,
      expectedHeight: 4096,
    });
  });
});
