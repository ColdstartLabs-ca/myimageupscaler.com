import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { mockTrack, mockSave, mockPush, authState } = vi.hoisted(() => ({
  mockTrack: vi.fn(),
  mockSave: vi.fn().mockResolvedValue(undefined),
  mockPush: vi.fn(),
  authState: { isAuthenticated: false },
}));

vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: { track: mockTrack },
}));

vi.mock('@client/utils/tool-image-handoff', () => ({
  saveToolHandoffImage: mockSave,
  takeToolHandoffImage: vi.fn(),
}));

vi.mock('@client/store/userStore', () => ({
  useUserStore: (selector: (state: { isAuthenticated: boolean }) => unknown) => selector(authState),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { InteractiveTool } from '@/app/(pseo)/_components/tools/InteractiveTool';

const UPSELL_NAME = /upscale this image 4/i;
const TOOL_ID = 'resize-your-image';

function renderTool(outputType: string) {
  const onProcess = vi.fn().mockResolvedValue(new Blob(['out'], { type: outputType }));
  render(
    <InteractiveTool title="Resize Your Image" description="Resize an image" onProcess={onProcess}>
      {({ markResultStale }) => (
        <button type="button" onClick={markResultStale}>
          Change settings
        </button>
      )}
    </InteractiveTool>
  );
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: [new File(['in'], 'photo.jpg', { type: 'image/jpeg' })] },
  });
  return onProcess;
}

async function processImage(outputType = 'image/png') {
  renderTool(outputType);
  fireEvent.click(screen.getByRole('button', { name: 'Process Image' }));
  await waitFor(() =>
    expect(mockTrack).toHaveBeenCalledWith('interactive_tool_processed', expect.anything())
  );
}

describe('interactive tool upsell handoff', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
  });

  test('upsell hides while the result is stale and uses the gradient CTA style', async () => {
    await processImage();
    const upsell = screen.getByRole('button', { name: UPSELL_NAME });
    expect(upsell.className).toContain('gradient-cta');

    fireEvent.click(screen.getByRole('button', { name: 'Change settings' }));

    expect(screen.queryByRole('button', { name: UPSELL_NAME })).toBeNull();
  });

  test('upsell appears only after processing and fires processed event', async () => {
    renderTool('image/png');

    expect(screen.queryByRole('button', { name: UPSELL_NAME })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Process Image' }));

    const upsell = await screen.findByRole('button', { name: UPSELL_NAME });
    expect(upsell).toBeVisible();
    expect(mockTrack).toHaveBeenCalledWith('interactive_tool_processed', {
      tool: TOOL_ID,
      outputType: 'image/png',
      outputBytes: 3,
    });
  });

  test('logged-out click saves the handoff and opens register with a dashboard return path', async () => {
    await processImage();

    fireEvent.click(screen.getByRole('button', { name: UPSELL_NAME }));

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith(expect.any(Blob), 'photo-processed.png', TOOL_ID)
    );
    expect(mockTrack).toHaveBeenCalledWith('post_tool_upsell_clicked', {
      tool: TOOL_ID,
      outputType: 'image/png',
      outputBytes: 3,
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/?signup=1'));
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'auth_redirect_intent',
      expect.stringContaining('/dashboard?handoff=tool')
    );
  });

  test('logged-in click navigates straight to the dashboard handoff', async () => {
    authState.isAuthenticated = true;
    await processImage();

    fireEvent.click(screen.getByRole('button', { name: UPSELL_NAME }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard?handoff=tool'));
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  test('download click fires downloaded event', async () => {
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await processImage();

    fireEvent.click(screen.getByRole('button', { name: 'Download Result' }));

    expect(mockTrack).toHaveBeenCalledWith('interactive_tool_downloaded', {
      tool: TOOL_ID,
      outputType: 'image/png',
      outputBytes: 3,
    });
    anchorClick.mockRestore();
  });

  test('non-image output shows no upsell', async () => {
    await processImage('application/pdf');

    expect(screen.queryByRole('button', { name: UPSELL_NAME })).toBeNull();
    expect(mockTrack).toHaveBeenCalledWith('interactive_tool_processed', {
      tool: TOOL_ID,
      outputType: 'application/pdf',
      outputBytes: 3,
    });
  });
});

describe('tool image handoff', () => {
  test('takeToolHandoffImage returns null when IndexedDB is unavailable', async () => {
    const scope = globalThis as { indexedDB?: IDBFactory };
    const original = scope.indexedDB;
    delete scope.indexedDB;

    try {
      const actual = await vi.importActual<typeof import('@client/utils/tool-image-handoff')>(
        '@client/utils/tool-image-handoff'
      );
      await expect(actual.takeToolHandoffImage()).resolves.toBeNull();
    } finally {
      if (original) scope.indexedDB = original;
    }
  });
});
