import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useModalBehavior } from '@client/hooks/useModalBehavior';

describe('useModalBehavior', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('should call onEscape when Escape key is pressed', () => {
    const onEscape = vi.fn();
    renderHook(() => useModalBehavior(onEscape));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('should NOT call onEscape for non-Escape keys', () => {
    const onEscape = vi.fn();
    renderHook(() => useModalBehavior(onEscape));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));

    expect(onEscape).not.toHaveBeenCalled();
  });

  it('should lock body scroll on mount', () => {
    renderHook(() => useModalBehavior(vi.fn()));
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('should restore original overflow on unmount', () => {
    document.body.style.overflow = 'scroll';
    const { unmount } = renderHook(() => useModalBehavior(vi.fn()));
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('should remove event listener on unmount', () => {
    const spy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useModalBehavior(vi.fn()));
    unmount();
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
