/**
 * Unit tests for client-side background removal processing
 * Tests the processBackgroundRemoval function with mocked library
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProcessingStage } from '@/shared/types/coreflow.types';

// Mock URL.createObjectURL before importing the module
const mockCreateObjectURL = vi.fn();
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

// Mock the @imgly/background-removal library
const mockRemoveBackground = vi.fn();

vi.mock('@imgly/background-removal', () => ({
  removeBackground: mockRemoveBackground,
}));

describe('bg-removal', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock URL.createObjectURL
    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = vi.fn();

    // Default mock implementations
    mockCreateObjectURL.mockReturnValue('blob:mock-url-123');
    mockRemoveBackground.mockReset();
  });

  afterEach(() => {
    // Restore original URL methods
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  describe('processBackgroundRemoval', () => {
    it('should export processBackgroundRemoval function', async () => {
      const { processBackgroundRemoval: processFn } = await import('@/client/utils/bg-removal');
      expect(typeof processFn).toBe('function');
    });

    it('should return creditsUsed: 1', async () => {
      const mockBlob = new Blob(['mock-png-data'], { type: 'image/png' });
      mockRemoveBackground.mockResolvedValue(mockBlob);

      // Import fresh to get a new module instance
      const { processBackgroundRemoval: processFn } = await import('@/client/utils/bg-removal');

      const file = new File(['test-image'], 'test.png', { type: 'image/png' });
      const onProgress = vi.fn();

      const result = await processFn(file, onProgress);

      expect(result.creditsUsed).toBe(1);
    });

    it('should return blob URL as imageUrl', async () => {
      const mockBlob = new Blob(['mock-png-data'], { type: 'image/png' });
      mockRemoveBackground.mockResolvedValue(mockBlob);
      mockCreateObjectURL.mockReturnValue('blob:mock-url-456');

      const { processBackgroundRemoval: processFn } = await import('@/client/utils/bg-removal');

      const file = new File(['test-image'], 'test.png', { type: 'image/png' });
      const onProgress = vi.fn();

      const result = await processFn(file, onProgress);

      expect(result.imageUrl).toMatch(/^blob:/);
      expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob);
    });

    it('should call progress callback with correct stages', async () => {
      const mockBlob = new Blob(['mock-png-data'], { type: 'image/png' });
      mockRemoveBackground.mockImplementation(
        async (
          _file: File,
          options?: { progress?: (key: string, current: number, total: number) => void }
        ) => {
          // Simulate progress during processing
          if (options?.progress) {
            options.progress('download', 0.5, 1);
            options.progress('download', 1, 1);
          }
          return mockBlob;
        }
      );

      const { processBackgroundRemoval: processFn } = await import('@/client/utils/bg-removal');

      const file = new File(['test-image'], 'test.png', { type: 'image/png' });
      const progressCalls: Array<{ progress: number; stage?: ProcessingStage }> = [];
      const onProgress = (progress: number, stage?: ProcessingStage) => {
        progressCalls.push({ progress, stage });
      };

      await processFn(file, onProgress);

      // Verify progress stages were called
      const stages = progressCalls.map(p => p.stage);

      // Should start with PREPARING stage
      expect(stages[0]).toBe(ProcessingStage.PREPARING);

      // Should include ENHANCING stage during processing
      expect(stages).toContain(ProcessingStage.ENHANCING);

      // Should end with FINALIZING stage
      expect(stages[stages.length - 1]).toBe(ProcessingStage.FINALIZING);
    });

    it('should call removeBackground with correct options', async () => {
      const mockBlob = new Blob(['mock-png-data'], { type: 'image/png' });
      mockRemoveBackground.mockResolvedValue(mockBlob);

      const { processBackgroundRemoval: processFn } = await import('@/client/utils/bg-removal');

      const file = new File(['test-image'], 'test.png', { type: 'image/png' });
      const onProgress = vi.fn();

      await processFn(file, onProgress);

      expect(mockRemoveBackground).toHaveBeenCalledWith(
        file,
        expect.objectContaining({
          progress: expect.any(Function),
          output: { format: 'image/png', quality: 1 },
        })
      );
    });

    it('should report progress from 10 to 100', async () => {
      const mockBlob = new Blob(['mock-png-data'], { type: 'image/png' });
      mockRemoveBackground.mockResolvedValue(mockBlob);

      const { processBackgroundRemoval: processFn } = await import('@/client/utils/bg-removal');

      const file = new File(['test-image'], 'test.png', { type: 'image/png' });
      const progressValues: number[] = [];
      const onProgress = (progress: number) => {
        progressValues.push(progress);
      };

      await processFn(file, onProgress);

      // First progress should be 10
      expect(progressValues[0]).toBe(10);

      // Last progress should be 100
      expect(progressValues[progressValues.length - 1]).toBe(100);

      // Progress should be monotonically increasing
      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
      }
    });

    it('should pass file to removeBackground', async () => {
      const mockBlob = new Blob(['mock-png-data'], { type: 'image/png' });
      mockRemoveBackground.mockResolvedValue(mockBlob);

      const { processBackgroundRemoval: processFn } = await import('@/client/utils/bg-removal');

      const file = new File(['test-image-data'], 'photo.jpg', {
        type: 'image/jpeg',
      });
      const onProgress = vi.fn();

      await processFn(file, onProgress);

      expect(mockRemoveBackground).toHaveBeenCalledWith(file, expect.any(Object));
    });
  });
});
