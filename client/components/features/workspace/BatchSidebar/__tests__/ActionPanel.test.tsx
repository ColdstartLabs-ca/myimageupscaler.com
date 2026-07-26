import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessingStatus } from '@/shared/types/coreflow.types';
import { ActionPanel } from '../ActionPanel';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('@client/analytics', () => ({
  analytics: { track },
}));

vi.mock('@client/components/stripe/InsufficientCreditsModal', () => ({
  InsufficientCreditsModal: () => null,
}));

describe('ActionPanel credit wall analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should track the preflight action panel wall when credits are insufficient', () => {
    const setShowInsufficientModal = vi.fn();
    const onProcess = vi.fn();

    render(
      <ActionPanel
        queue={[
          {
            id: 'item-1',
            file: new File(['image'], 'image.png', { type: 'image/png' }),
            previewUrl: 'blob:test',
            processedUrl: null,
            status: ProcessingStatus.IDLE,
            progress: 0,
          },
        ]}
        isProcessing={false}
        batchProgress={null}
        completedCount={0}
        totalCost={3}
        currentBalance={1}
        onProcess={onProcess}
        onDownloadAll={vi.fn()}
        onClear={vi.fn()}
        onUpgrade={vi.fn()}
        showInsufficientModal={false}
        setShowInsufficientModal={setShowInsufficientModal}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Process All/ }));

    expect(onProcess).not.toHaveBeenCalled();
    expect(setShowInsufficientModal).toHaveBeenCalledWith(true);
    expect(track).toHaveBeenCalledWith('credit_wall_shown', {
      source: 'preflight_action_panel',
      requiredCredits: 3,
      currentBalance: 1,
      deficit: 2,
    });
  });
});
