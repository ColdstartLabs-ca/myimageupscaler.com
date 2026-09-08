import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/locales/en/workspace.json';
import { PreviewArea } from '@client/components/features/workspace/PreviewArea';
import { ActionPanel } from '@client/components/features/workspace/BatchSidebar/ActionPanel';
import { ProcessingStage, ProcessingStatus, type IBatchItem } from '@shared/types/coreflow.types';

vi.mock('@client/analytics', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@client/components/stripe/InsufficientCreditsModal', () => ({
  InsufficientCreditsModal: () => null,
}));
vi.mock('@client/components/features/image-processing/ImageComparison', () => ({
  default: () => null,
}));

const item: IBatchItem = {
  id: 'recovered',
  jobId: '11111111-1111-4111-8111-111111111111',
  file: new File([], 'original.png', { type: 'image/png' }),
  previewUrl: 'data:image/png;base64,',
  processedUrl: null,
  status: ProcessingStatus.PROCESSING,
  stage: ProcessingStage.ENHANCING,
  progress: 55,
};
function showPreview(value: IBatchItem) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ workspace: messages }}>
      <PreviewArea activeItem={value} onRetry={vi.fn()} onDownload={vi.fn()} />
    </NextIntlClientProvider>
  );
}
function showActions(value: IBatchItem) {
  return render(
    <ActionPanel
      queue={[value]}
      isProcessing={false}
      batchProgress={null}
      completedCount={0}
      totalCost={3}
      currentBalance={0}
      onProcess={vi.fn()}
      onDownloadAll={vi.fn()}
      onClear={vi.fn()}
      onUpgrade={vi.fn()}
      showInsufficientModal={false}
      setShowInsufficientModal={vi.fn()}
    />
  );
}

describe('durable recovery workspace controls', () => {
  it('displays reconnecting without claiming a processing failure or a new attempt', () => {
    showPreview({ ...item, reconnecting: true });
    expect(screen.getByText(messages.previewArea.recovery.reconnecting)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument();
    expect(screen.queryByText(/remaining$/)).not.toBeInTheDocument();
  });

  it('explains the refund and asks for the source when a recovered failed job has no file', () => {
    showPreview({ ...item, status: ProcessingStatus.ERROR, refunded: true, retryable: false });
    expect(screen.getByText(messages.previewArea.recovery.refunded)).toBeInTheDocument();
    expect(screen.getByText(messages.previewArea.recovery.sourceRequired)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument();
  });

  it('disables batch admission and purchase prompts for a recovered running job', () => {
    showActions(item);
    expect(screen.getByRole('button', { name: /Processing/ })).toBeDisabled();
    expect(screen.queryByText(/Cost:/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Get credits to upscale today' })
    ).not.toBeInTheDocument();
  });

  it('disables new attempts for a recovered failed job without source bytes', () => {
    showActions({ ...item, status: ProcessingStatus.ERROR, retryable: false });
    expect(screen.getByRole('button', { name: /Process All/ })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Get credits to upscale today' })
    ).not.toBeInTheDocument();
  });
});
