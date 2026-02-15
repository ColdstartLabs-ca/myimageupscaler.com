/**
 * Unit tests for PreviewArea component
 * Tests MODEL_PROCESSING_TIMES configuration and bg-removal support
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the next-intl useTranslations hook
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'previewArea.stages.preparing': 'Preparing image...',
      'previewArea.stages.analyzing': 'Analyzing image...',
      'previewArea.stages.enhancing': 'Enhancing image...',
      'previewArea.stages.finalizing': 'Finalizing...',
      'previewArea.statusMessages.preparing': 'Preparing your image',
      'previewArea.statusMessages.analyzing': 'Analyzing quality',
      'previewArea.statusMessages.enhancing': 'Enhancing quality',
      'previewArea.statusMessages.finalizing': 'Almost done',
      'previewArea.statusMessages.processing': 'Processing...',
      'previewArea.emptyState.title': 'Select an image to preview',
      'previewArea.completed.title': 'Processing complete',
      'previewArea.errors.title': 'Processing Error',
      'previewArea.errors.tryAgain': 'Try Again',
      'previewArea.batch.preparingNext': 'Preparing next image...',
      'previewArea.batch.rateLimitingPause': 'Brief pause between images',
      'previewArea.batch.imageXofYcomplete': 'Image {current} of {total} complete',
    };
    return translations[key] || key;
  },
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  AlertTriangle: () => null,
  Check: () => null,
  Layers: () => null,
  Loader2: () => null,
}));

// Mock Button component
vi.mock('@client/components/ui/Button', () => ({
  Button: () => null,
}));

// Mock ImageComparison component
vi.mock('@client/components/features/image-processing/ImageComparison', () => ({
  default: () => null,
}));

describe('PreviewArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('MODEL_PROCESSING_TIMES', () => {
    it('should have bg-removal in processing times', async () => {
      // Import the module to access the MODEL_PROCESSING_TIMES constant
      // We need to read the source file and extract the constant
      const fs = await import('fs');
      const path = await import('path');

      const sourceFile = fs.readFileSync(
        path.resolve(__dirname, '../../../client/components/features/workspace/PreviewArea.tsx'),
        'utf-8'
      );

      // Verify bg-removal is in the MODEL_PROCESSING_TIMES object
      expect(sourceFile).toContain("'bg-removal':");
      expect(sourceFile).toContain("'bg-removal': 10");

      // Verify the structure is correct
      const modelProcessingTimesMatch = sourceFile.match(
        /const MODEL_PROCESSING_TIMES:\s*Record<string,\s*number>\s*=\s*\{([^}]+)\}/
      );
      expect(modelProcessingTimesMatch).toBeTruthy();

      const timesBlock = modelProcessingTimesMatch![1];

      // Verify all expected models are present
      expect(timesBlock).toContain("'real-esrgan': 15");
      expect(timesBlock).toContain('gfpgan: 20');
      expect(timesBlock).toContain("'nano-banana': 25");
      expect(timesBlock).toContain("'clarity-upscaler': 30");
      expect(timesBlock).toContain("'nano-banana-pro': 45");
      expect(timesBlock).toContain("'bg-removal': 10");
      expect(timesBlock).toContain('auto: 35');
    });

    it('should export PreviewArea component', async () => {
      const { PreviewArea } = await import('@/client/components/features/workspace/PreviewArea');
      expect(PreviewArea).toBeDefined();
      expect(typeof PreviewArea).toBe('function');
    });
  });
});
