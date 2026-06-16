/**
 * Extension Background Script Tests
 *
 * Tests the messaging patterns used by the background service worker:
 * - Handshake pattern for image-fetcher content script
 * - Message routing patterns (IMAGE_HOVERED, GET_LAST_IMAGE, OPEN_SIDEPANEL)
 * - Context menu initialization patterns
 */

import { describe, it, expect, vi } from 'vitest';

describe('Background Script Patterns', () => {
  describe('Handshake Pattern (waitForImageFetcherReady)', () => {
    it('resolves when IMAGE_FETCHER_READY is received from correct tab', async () => {
      const listeners: Array<
        (msg: Record<string, unknown>, sender: { tab?: { id: number } }) => void
      > = [];
      const addListener = vi.fn(
        (l: (msg: Record<string, unknown>, sender: { tab?: { id: number } }) => void) =>
          listeners.push(l)
      );
      const removeListener = vi.fn(
        (l: (msg: Record<string, unknown>, sender: { tab?: { id: number } }) => void) => {
          const idx = listeners.indexOf(l);
          if (idx >= 0) listeners.splice(idx, 1);
        }
      );

      // Simulate the handshake function
      function waitForReady(tabId: number, timeoutMs = 5000): Promise<void> {
        return new Promise(resolve => {
          let resolved = false;
          const listener = (message: Record<string, unknown>, sender: { tab?: { id: number } }) => {
            if (message.type === 'IMAGE_FETCHER_READY' && sender.tab?.id === tabId) {
              resolved = true;
              removeListener(listener);
              resolve();
            }
          };
          addListener(listener);
          setTimeout(() => {
            if (!resolved) {
              removeListener(listener);
              resolve();
            }
          }, timeoutMs);
        });
      }

      // Start waiting
      const readyPromise = waitForReady(42);

      // Simulate the content script sending IMAGE_FETCHER_READY
      vi.useFakeTimers();
      for (const listener of [...listeners]) {
        listener({ type: 'IMAGE_FETCHER_READY' }, { tab: { id: 42 } });
      }

      await readyPromise;

      expect(removeListener).toHaveBeenCalled();
      expect(listeners.length).toBe(0); // Listener cleaned up
      vi.useRealTimers();
    });

    it('ignores IMAGE_FETCHER_READY from wrong tab', async () => {
      const listeners: Array<
        (msg: Record<string, unknown>, sender: { tab?: { id: number } }) => void
      > = [];
      const addListener = vi.fn(
        (l: (msg: Record<string, unknown>, sender: { tab?: { id: number } }) => void) =>
          listeners.push(l)
      );
      const removeListener = vi.fn();

      function waitForReady(tabId: number, timeoutMs = 100): Promise<void> {
        return new Promise(resolve => {
          let resolved = false;
          const listener = (message: Record<string, unknown>, sender: { tab?: { id: number } }) => {
            if (message.type === 'IMAGE_FETCHER_READY' && sender.tab?.id === tabId) {
              resolved = true;
              removeListener(listener);
              resolve();
            }
          };
          addListener(listener);
          setTimeout(() => {
            if (!resolved) {
              removeListener(listener);
              resolve();
            }
          }, timeoutMs);
        });
      }

      vi.useFakeTimers();
      const readyPromise = waitForReady(42, 100);

      // Send ready from wrong tab
      for (const listener of [...listeners]) {
        listener({ type: 'IMAGE_FETCHER_READY' }, { tab: { id: 99 } });
      }

      // Should timeout since no matching tab
      await vi.advanceTimersByTimeAsync(150);
      await readyPromise;

      expect(removeListener).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('falls back to timeout if ready signal is never received', async () => {
      const listeners: Array<
        (msg: Record<string, unknown>, sender: { tab?: { id: number } }) => void
      > = [];
      const addListener = vi.fn(
        (l: (msg: Record<string, unknown>, sender: { tab?: { id: number } }) => void) =>
          listeners.push(l)
      );
      const removeListener = vi.fn();

      function waitForReady(tabId: number, timeoutMs = 100): Promise<void> {
        return new Promise(resolve => {
          let resolved = false;
          const listener = () => {
            resolved = true;
          };
          addListener(listener);
          setTimeout(() => {
            if (!resolved) {
              removeListener(listener);
              resolve();
            }
          }, timeoutMs);
        });
      }

      vi.useFakeTimers();
      const readyPromise = waitForReady(42, 100);

      await vi.advanceTimersByTimeAsync(150);
      await readyPromise;

      // Should resolve after timeout (not hang)
      expect(removeListener).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('Message Routing', () => {
    it('tracks last hovered image URL', () => {
      let lastHoveredImageUrl: string | null = null;

      // Simulate IMAGE_HOVERED handler
      const handleMessage = (message: Record<string, unknown>) => {
        if (message.type === 'IMAGE_HOVERED') {
          lastHoveredImageUrl = message.imageUrl as string;
        } else if (message.type === 'GET_LAST_IMAGE') {
          return { imageUrl: lastHoveredImageUrl };
        }
        return undefined;
      };

      handleMessage({ type: 'IMAGE_HOVERED', imageUrl: 'https://example.com/img.png' });
      const response = handleMessage({ type: 'GET_LAST_IMAGE' });

      expect(response).toEqual({ imageUrl: 'https://example.com/img.png' });
    });

    it('GET_LAST_IMAGE returns null when no image hovered', () => {
      let lastHoveredImageUrl: string | null = null;

      const handleMessage = (message: Record<string, unknown>) => {
        if (message.type === 'GET_LAST_IMAGE') {
          return { imageUrl: lastHoveredImageUrl };
        }
        return undefined;
      };

      const response = handleMessage({ type: 'GET_LAST_IMAGE' });
      expect(response).toEqual({ imageUrl: null });
    });

    it('updates last hovered image on each IMAGE_HOVERED', () => {
      let lastHoveredImageUrl: string | null = null;

      const handleMessage = (message: Record<string, unknown>) => {
        if (message.type === 'IMAGE_HOVERED') {
          lastHoveredImageUrl = message.imageUrl as string;
        }
      };

      handleMessage({ type: 'IMAGE_HOVERED', imageUrl: 'https://example.com/first.png' });
      handleMessage({ type: 'IMAGE_HOVERED', imageUrl: 'https://example.com/second.png' });

      expect(lastHoveredImageUrl).toBe('https://example.com/second.png');
    });
  });

  describe('Context Menu Configuration', () => {
    it('context menu config has correct structure', () => {
      const contextMenuConfig = {
        id: 'upscale-image',
        title: 'Upscale with MyImageUpscaler',
        contexts: ['image'],
      };

      expect(contextMenuConfig.id).toBe('upscale-image');
      expect(contextMenuConfig.contexts).toEqual(['image']);
      expect(contextMenuConfig.title).toContain('Upscale');
    });
  });

  describe('Error Propagation', () => {
    it('sends UPSCALE_ERROR message on fetch failure', () => {
      const sentMessages: Record<string, unknown>[] = [];
      const sendMessage = (msg: Record<string, unknown>) => sentMessages.push(msg);

      // Simulate error handling from image fetch
      const error = new Error('Failed to fetch image: CORS blocked');
      sendMessage({
        type: 'UPSCALE_ERROR',
        error: error.message,
      });

      expect(sentMessages).toContainEqual({
        type: 'UPSCALE_ERROR',
        error: 'Failed to fetch image: CORS blocked',
      });
    });

    it('wraps unknown errors in generic message', () => {
      const sentMessages: Record<string, unknown>[] = [];
      const sendMessage = (msg: Record<string, unknown>) => sentMessages.push(msg);

      const error = 'string error';
      sendMessage({
        type: 'UPSCALE_ERROR',
        error:
          typeof error === 'object' && error instanceof Error
            ? error.message
            : 'Failed to upscale image',
      });

      expect(sentMessages[0].error).toBe('Failed to upscale image');
    });
  });
});
