import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { DeferredSection } from '@client/components/landing/DeferredSection';

describe('DeferredSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the crawlable fallback until the section intersects the viewport', () => {
    let intersectionCallback: IntersectionObserverCallback | undefined;
    const observeMock = vi.fn();
    const disconnectMock = vi.fn();

    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }

      observe = observeMock;
      disconnect = disconnectMock;
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    render(
      <DeferredSection fallback={<p>server fallback</p>}>
        <p>interactive section</p>
      </DeferredSection>
    );

    expect(screen.getByText('server fallback')).toBeInTheDocument();
    expect(screen.queryByText('interactive section')).not.toBeInTheDocument();
    expect(observeMock).toHaveBeenCalledTimes(1);

    act(() => {
      intersectionCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(screen.getByText('interactive section')).toBeInTheDocument();
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });
});
