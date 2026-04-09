'use client';

/**
 * Detect device type based on viewport and user agent
 */
export function detectDeviceType(): 'mobile' | 'desktop' | 'tablet' {
  if (typeof window === 'undefined') return 'desktop';

  const width = window.innerWidth;
  const ua = navigator.userAgent.toLowerCase();

  // Tablet detection
  const isTablet = /ipad|android(?!.*mobile)|tablet/i.test(ua) || (width >= 768 && width < 1024);
  if (isTablet) return 'tablet';

  // Mobile detection
  const isMobile =
    /iphone|ipod|android.*mobile|blackberry|opera mini|iemobile/i.test(ua) || width < 768;
  if (isMobile) return 'mobile';

  return 'desktop';
}
