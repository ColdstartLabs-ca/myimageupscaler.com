/**
 * Checkout Funnel Tracking Unit Tests
 *
 * Tests for checkout analytics events as defined in:
 * - Phase 1 of docs/PRDs/checkout-friction-investigation.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  TCheckoutStep,
  TCheckoutErrorType,
  TCheckoutExitMethod,
  TDeviceType,
} from '@server/analytics/types';

// =============================================================================
// Test Helper Functions
// =============================================================================

/**
 * Detect device type based on viewport and user agent
 */
function detectDeviceType(): TDeviceType {
  if (typeof window === 'undefined') return 'desktop';

  const width = window.innerWidth;
  const ua = navigator.userAgent.toLowerCase();

  // Tablet detection
  const isTablet =
    /ipad|android(?!.*mobile)|tablet/i.test(ua) || (width >= 768 && width < 1024);
  if (isTablet) return 'tablet';

  // Mobile detection
  const isMobile =
    /iphone|ipod|android.*mobile|blackberry|opera mini|iemobile/i.test(ua) || width < 768;
  if (isMobile) return 'mobile';

  return 'desktop';
}

/**
 * Sanitize error message - remove sensitive data
 */
function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/\d{13,16}/g, '[CARD]') // Remove card numbers
    .replace(/cvc|cvv|cv2/gi, '[CVC]') // Remove CVC mentions
    .slice(0, 200); // Limit length
}

// Mock window dimensions
function mockWindowDimensions(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
}

// Mock user agent
function mockUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', {
    writable: true,
    configurable: true,
    value: ua,
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('Checkout Funnel Tracking', () => {
  describe('detectDeviceType', () => {
    const originalWidth = window.innerWidth;
    const originalUA = navigator.userAgent;

    beforeEach(() => {
      vi.stubGlobal('window', {
        innerWidth: 1024,
      });
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        userAgentData: undefined,
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should detect desktop correctly', () => {
      mockWindowDimensions(1200);
      mockUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0');
      expect(detectDeviceType()).toBe('desktop');
    });

    it('should detect mobile correctly from user agent', () => {
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) Mobile/15E148');
      expect(detectDeviceType()).toBe('mobile');
    });

    it('should detect mobile correctly from viewport width', () => {
      mockWindowDimensions(375);
      mockUserAgent('Mozilla/5.0 (Linux; Android 10; Mobile) Chrome/120.0.0.0');
      expect(detectDeviceType()).toBe('mobile');
    });

    it('should detect tablet correctly from user agent', () => {
      mockUserAgent('Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) Safari/604.1');
      expect(detectDeviceType()).toBe('tablet');
    });

    it('should detect tablet correctly from viewport width', () => {
      mockWindowDimensions(800);
      mockUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0');
      expect(detectDeviceType()).toBe('tablet');
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('should sanitize card numbers from error messages', () => {
      const message = 'Card 4242424242424242 declined';
      expect(sanitizeErrorMessage(message)).toBe('Card [CARD] declined');
    });

    it('should sanitize CVC mentions', () => {
      const message = 'Your cvc is invalid';
      expect(sanitizeErrorMessage(message)).toBe('Your [CVC] is invalid');
    });

    it('should handle CVV variations', () => {
      const message = 'CVV check failed';
      expect(sanitizeErrorMessage(message)).toBe('[CVC] check failed');
    });

    it('should limit message length to 200 characters', () => {
      const longMessage = 'a'.repeat(300);
      const result = sanitizeErrorMessage(longMessage);
      expect(result.length).toBe(200);
    });

    it('should handle multiple sensitive data in one message', () => {
      const message = 'Card 4111111111111111 cvc 123 failed';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Card [CARD] [CVC] 123 failed');
    });

    it('should preserve safe error messages', () => {
      const message = 'Network error occurred';
      expect(sanitizeErrorMessage(message)).toBe('Network error occurred');
    });
  });

  describe('Event Property Types', () => {
    it('should have valid checkout step values', () => {
      const validSteps: TCheckoutStep[] = [
        'plan_selection',
        'stripe_embed',
        'payment_details',
        'confirmation',
      ];

      // Type assertion - will fail to compile if types don't match
      expect(validSteps.length).toBe(4);
    });

    it('should have valid error type values', () => {
      const validErrorTypes: TCheckoutErrorType[] = [
        'card_declined',
        '3ds_failed',
        'network_error',
        'invalid_card',
        'session_expired',
        'other',
      ];

      expect(validErrorTypes.length).toBe(6);
    });

    it('should have valid exit method values', () => {
      const validExitMethods: TCheckoutExitMethod[] = [
        'close_button',
        'escape_key',
        'click_outside',
        'navigate_away',
      ];

      expect(validExitMethods.length).toBe(4);
    });

    it('should have valid device type values', () => {
      const validDeviceTypes: TDeviceType[] = ['mobile', 'desktop', 'tablet'];

      expect(validDeviceTypes.length).toBe(3);
    });
  });
});
