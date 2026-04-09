import { describe, it, expect, afterEach } from 'vitest';
import { detectDeviceType } from '@client/utils/detectDeviceType';

describe('detectDeviceType', () => {
  const originalInnerWidth = window.innerWidth;
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: originalUserAgent,
    });
  });

  function setWidth(width: number) {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width,
    });
  }

  function setUserAgent(ua: string) {
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: ua,
    });
  }

  it('should return "desktop" when window.innerWidth >= 1024', () => {
    setWidth(1280);
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    const result = detectDeviceType();
    expect(result).toBe('desktop');
  });

  it('should return "mobile" when width < 768', () => {
    setWidth(375);
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    const result = detectDeviceType();
    expect(result).toBe('mobile');
  });

  it('should return "tablet" for tablet user agents', () => {
    setWidth(1024);
    setUserAgent('Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15');
    const result = detectDeviceType();
    expect(result).toBe('tablet');
  });

  it('should return "tablet" for Android tablet user agent', () => {
    setWidth(800);
    setUserAgent(
      'Mozilla/5.0 (Linux; Android 9; SM-T510) AppleWebKit/537.36 (like Gecko) Chrome/67.0.3396.87 Safari/537.36'
    );
    const result = detectDeviceType();
    expect(result).toBe('tablet');
  });

  it('should return "mobile" for iPhone user agent', () => {
    setWidth(375);
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15');
    const result = detectDeviceType();
    expect(result).toBe('mobile');
  });

  it('should return "desktop" when window is undefined (SSR)', () => {
    const originalWindow = global.window;
    // @ts-expect-error - simulate SSR
    delete global.window;
    const result = detectDeviceType();
    expect(result).toBe('desktop');
    global.window = originalWindow;
  });
});
