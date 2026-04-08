/** Persisted preference for automatically resizing oversized images. */
export const AUTO_RESIZE_STORAGE_KEY = 'image-upscaler-auto-resize';

/** Check if auto-resize preference is enabled (defaults to true). */
export function isAutoResizeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(AUTO_RESIZE_STORAGE_KEY);
  return stored === null ? true : stored === 'true';
}

/** Persist the auto-resize preference. */
export function setAutoResizePreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTO_RESIZE_STORAGE_KEY, String(enabled));
}
