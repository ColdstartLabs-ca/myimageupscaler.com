import { describe, expect, it } from 'vitest';
import { auditLocaleMetadataHtml } from '@/scripts/seo/audit-locale-metadata';

const working = `
  <html><head>
    <title>DALL-E PNG Upscaler | MyImageUpscaler</title>
    <meta name="description" content="Upscale DALL-E PNG images">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://myimageupscaler.com/platform-format/dalle-upscaler-png">
  </head><body><h1>DALL-E PNG Upscaler</h1></body></html>`;

describe('locale metadata audit', () => {
  it('should flag a page whose title is the layout default', () => {
    const result = auditLocaleMetadataHtml(
      'https://myimageupscaler.com/es/platform-format/dalle-upscaler-png',
      working.replace(
        'DALL-E PNG Upscaler | MyImageUpscaler',
        'MyImageUpscaler - Image Upscaling & Enhancement'
      )
    );
    expect(result.defaultTitle).toBe(true);
  });

  it('should flag a page with no robots meta', () => {
    const result = auditLocaleMetadataHtml(
      'https://myimageupscaler.com/es/platform-format/dalle-upscaler-png',
      working.replace('<meta name="robots" content="index, follow">', '')
    );
    expect(result.missingRobots).toBe(true);
    expect(auditLocaleMetadataHtml('https://myimageupscaler.com/x', working).missingRobots).toBe(
      false
    );
  });

  it('should not flag the working root route', () => {
    expect(
      auditLocaleMetadataHtml(
        'https://myimageupscaler.com/platform-format/dalle-upscaler-png',
        working
      )
    ).toMatchObject({ defaultTitle: false, missingRobots: false, titleH1Mismatch: false });
  });
});
