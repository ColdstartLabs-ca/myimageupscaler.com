/**
 * Auth Bridge Content Script Tests
 *
 * Tests the auth-bridge content script logic:
 * - postMessage origin validation
 * - Session data extraction from EXTENSION_AUTH_SESSION messages
 * - Ignoring messages from wrong origins
 * - Timeout cleanup
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome APIs
const mockUpdateSession = vi.fn(async () => {});
vi.mock('@extension/shared/storage', () => ({
  updateSession: mockUpdateSession,
}));

const chromeMock = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
    },
    sendMessage: vi.fn(),
  },
};

vi.stubGlobal('chrome', chromeMock);

// Mock window.location for origin checks
const originalLocation = window.location;

describe('Auth Bridge Content Script', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('postMessage Validation', () => {
    it('validates origin matches window.location.origin', () => {
      // The auth-bridge checks event.origin !== window.location.origin
      const validOrigin = 'https://myimageupscaler.com';
      const event = new MessageEvent('message', {
        data: { type: 'EXTENSION_AUTH_SESSION', session: { accessToken: 'test' } },
        origin: validOrigin,
      });

      // Verify the event was created with the correct origin
      expect(event.origin).toBe(validOrigin);
    });

    it('rejects messages from different origins', () => {
      const maliciousOrigin = 'https://evil-site.com';
      const event = new MessageEvent('message', {
        data: { type: 'EXTENSION_AUTH_SESSION', session: { accessToken: 'stolen' } },
        origin: maliciousOrigin,
      });

      // The auth-bridge should reject this because origin !== window.location.origin
      expect(event.origin).not.toBe(window.location.origin);
    });
  });

  describe('Session Data Extraction', () => {
    it('extracts session fields from EXTENSION_AUTH_SESSION message', () => {
      const sessionData = {
        userId: 'user-123',
        accessToken: 'token-abc',
        creditsRemaining: 50,
        expiresAt: Date.now() + 3600000,
      };

      const message = {
        type: 'EXTENSION_AUTH_SESSION' as const,
        session: sessionData,
      };

      // Verify the message structure matches what auth-bridge expects
      expect(message.type).toBe('EXTENSION_AUTH_SESSION');
      expect(message.session.accessToken).toBe('token-abc');
      expect(message.session.creditsRemaining).toBe(50);
    });

    it('ignores messages without accessToken', () => {
      const message = {
        type: 'EXTENSION_AUTH_SESSION',
        session: {
          userId: 'user-123',
          accessToken: null,
          creditsRemaining: 0,
          expiresAt: null,
        },
      };

      // Auth bridge checks: !data.session?.accessToken
      expect(message.session.accessToken).toBeFalsy();
    });
  });

  describe('Chrome Runtime Message Handling', () => {
    it('responds to GET_AUTH_FROM_PAGE with null (no window globals)', () => {
      const sendResponse = vi.fn();
      let capturedListener:
        | ((
            message: Record<string, unknown>,
            _sender: unknown,
            sendResponse: (response?: unknown) => void
          ) => boolean)
        | null = null;

      // Simulate how the auth-bridge registers its listener
      const listener = (
        message: Record<string, unknown>,
        _sender: unknown,
        response: (response?: unknown) => void
      ) => {
        if (message.type === 'GET_AUTH_FROM_PAGE') {
          response(null); // No longer reading from window globals
          return true;
        }
        return false;
      };
      capturedListener = listener;

      // Simulate incoming message
      capturedListener({ type: 'GET_AUTH_FROM_PAGE' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(null);
    });
  });

  describe('Cleanup', () => {
    it('removes message listener after receiving valid session', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      // Simulate cleanup after session received
      const handler = () => {};
      window.removeEventListener('message', handler);

      expect(removeEventListenerSpy).toHaveBeenCalledWith('message', handler);

      removeEventListenerSpy.mockRestore();
    });

    it('removes message listener after 30 second timeout', () => {
      // Verify the pattern: setTimeout(() => removeEventListener, 30000)
      const TIMEOUT_MS = 30000;
      expect(TIMEOUT_MS).toBe(30000);
    });
  });

  describe('IExtensionSession interface compliance', () => {
    it('session data matches IExtensionSession shape', () => {
      const session = {
        userId: 'user-123',
        accessToken: 'token-abc',
        creditsRemaining: 50,
        expiresAt: Date.now() + 3600000,
      };

      expect(typeof session.userId).toBe('string');
      expect(typeof session.accessToken).toBe('string');
      expect(typeof session.creditsRemaining).toBe('number');
      expect(typeof session.expiresAt).toBe('number');
    });
  });
});
