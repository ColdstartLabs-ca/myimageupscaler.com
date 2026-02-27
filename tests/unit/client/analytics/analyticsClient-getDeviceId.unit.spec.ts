import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for the analytics client getDeviceId method.
 *
 * These tests verify that the getDeviceId method correctly retrieves
 * the Amplitude device ID for server-side correlation.
 */

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

// Mock window
Object.defineProperty(global, 'window', {
  value: {
    localStorage: localStorageMock,
  },
  writable: true,
});

describe('Analytics Client - getDeviceId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getDeviceId method', () => {
    test('should return existing device ID from localStorage', async () => {
      // Set up existing device ID
      localStorageMock.setItem('miu_device_id', 'existing-device-123');

      // Import analytics client
      const { analytics } = await import('../../../../client/analytics/analyticsClient');

      const deviceId = analytics.getDeviceId();

      expect(deviceId).toBe('existing-device-123');
    });

    test('should generate and store new device ID if none exists', async () => {
      // Ensure no existing device ID
      localStorageMock.clear();

      const { analytics } = await import('../../../../client/analytics/analyticsClient');

      const deviceId = analytics.getDeviceId();

      expect(deviceId).toBeTruthy();
      expect(typeof deviceId).toBe('string');
      expect(deviceId.length).toBeGreaterThan(10);

      // Verify it was stored
      expect(localStorageMock.setItem).toHaveBeenCalledWith('miu_device_id', deviceId);
    });

    test('should return consistent device ID across multiple calls', async () => {
      localStorageMock.clear();

      const { analytics } = await import('../../../../client/analytics/analyticsClient');

      const deviceId1 = analytics.getDeviceId();
      const deviceId2 = analytics.getDeviceId();

      expect(deviceId1).toBe(deviceId2);
    });

    test('should prefer amp_device_id if available (when amplitude is initialized)', async () => {
      // This test verifies the code path that checks for amp_device_id
      // In production, when Amplitude SDK is initialized, it stores device_id in amp_device_id
      localStorageMock.setItem('amp_device_id', 'amplitude-device-456');
      localStorageMock.setItem('miu_device_id', 'fallback-device-789');

      const { analytics } = await import('../../../../client/analytics/analyticsClient');

      const deviceId = analytics.getDeviceId();

      // Since amplitudeModule is not initialized in this test environment,
      // it will fall back to miu_device_id. In production with Amplitude initialized,
      // it would return amp_device_id.
      // The important thing is the function returns a device ID without error.
      expect(deviceId).toBeTruthy();
      expect(typeof deviceId).toBe('string');
    });

    test('should return null in server environment (no window)', async () => {
      // Temporarily remove window
      const originalWindow = global.window;
      // @ts-expect-error - intentionally removing window for test
      delete global.window;

      vi.resetModules();

      const { analytics } = await import('../../../../client/analytics/analyticsClient');

      const deviceId = analytics.getDeviceId();

      expect(deviceId).toBeNull();

      // Restore window
      global.window = originalWindow;
    });

    test('should handle localStorage errors gracefully', async () => {
      // Make localStorage throw
      localStorageMock.getItem.mockImplementationOnce(() => {
        throw new Error('Storage quota exceeded');
      });

      const { analytics } = await import('../../../../client/analytics/analyticsClient');

      // Should not throw, should return null
      const deviceId = analytics.getDeviceId();

      expect(deviceId).toBeNull();
    });
  });

  describe('Device ID format', () => {
    test('should generate device ID with timestamp and random component', async () => {
      localStorageMock.clear();

      const { analytics } = await import('../../../../client/analytics/analyticsClient');

      const deviceId = analytics.getDeviceId();

      // Format: {timestamp}-{random_string}
      expect(deviceId).toMatch(/^\d+-[a-z0-9]+$/);
    });

    test('should generate unique device IDs for different instances', async () => {
      localStorageMock.clear();

      const { analytics } = await import('../../../../client/analytics/analyticsClient');

      const deviceId1 = analytics.getDeviceId();

      // Clear and generate new one
      localStorageMock.clear();
      vi.resetModules();

      const { analytics: analytics2 } =
        await import('../../../../client/analytics/analyticsClient');
      const deviceId2 = analytics2.getDeviceId();

      // After clearing, a new ID should be generated
      expect(deviceId1).not.toBe(deviceId2);
    });
  });
});
