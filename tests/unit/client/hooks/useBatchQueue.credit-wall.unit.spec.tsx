import { act, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ENHANCEMENT_SETTINGS,
  ProcessingStatus,
  type IBatchItem,
  type IUpscaleConfig,
} from '@/shared/types/coreflow.types';

const mocks = vi.hoisted(() => ({
  processImage: vi.fn(),
  showToast: vi.fn(),
  track: vi.fn(),
  BatchLimitError: class BatchLimitError extends Error {
    public readonly current: number;
    public readonly limit: number;

    constructor({ current, limit }: { current: number; limit: number }) {
      super('Batch limit exceeded');
      this.name = 'BatchLimitError';
      this.current = current;
      this.limit = limit;
    }
  },
  FreeLimitExceededError: class FreeLimitExceededError extends Error {
    public readonly requiredCredits?: number;
    public readonly availableCredits?: number;
  },
  ProviderUnavailableError: class ProviderUnavailableError extends Error {
    public readonly retryAt?: Date;
    public readonly suppressPurchaseCtas = true;
  },
}));

vi.mock('@client/analytics', () => ({
  analytics: { track: mocks.track },
}));

vi.mock('@client/store/toastStore', () => ({
  useToastStore: (selector: (state: { showToast: typeof mocks.showToast }) => unknown) =>
    selector({ showToast: mocks.showToast }),
}));

vi.mock('@client/store/userStore', () => {
  const useUserStore = vi.fn();
  useUserStore.getState = () => ({ updateCreditsFromProcessing: vi.fn() });

  return {
    useUserData: () => ({ profile: { id: 'user-1' }, totalCredits: 0 }),
    useUserStore,
  };
});

vi.mock('@client/utils/api-client', () => ({
  BatchLimitError: mocks.BatchLimitError,
  FreeLimitExceededError: mocks.FreeLimitExceededError,
  ProviderUnavailableError: mocks.ProviderUnavailableError,
  processImage: mocks.processImage,
}));

vi.mock('@client/utils/upscale-file-preprocessing', () => ({
  prepareFileForProcessing: (file: File) => Promise.resolve({ file, resized: false }),
}));

vi.mock('@client/utils/file-validation', () => ({
  loadImageDimensions: () => Promise.resolve({ width: 100, height: 100 }),
}));

vi.mock('@shared/config/subscription.utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@shared/config/subscription.utils')>();
  return {
    ...actual,
    getBatchLimit: () => 5,
  };
});

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { useBatchQueue } from '@/client/hooks/useBatchQueue';
import { BatchLimitModal } from '@/client/components/features/workspace/BatchLimitModal';
import { ProviderUnavailableModal } from '@/client/components/features/workspace/ProviderUnavailableModal';

const config: IUpscaleConfig = {
  qualityTier: 'quick',
  scale: 2,
  additionalOptions: DEFAULT_ENHANCEMENT_SETTINGS,
};

async function addAndProcessOne(
  result: ReturnType<typeof renderHook<ReturnType<typeof useBatchQueue>, unknown>>['result'],
  error: Error
): Promise<void> {
  mocks.processImage.mockRejectedValueOnce(error);

  await act(async () => {
    result.current.addFiles([
      new File(['image'], 'image.png', {
        type: 'image/png',
      }),
    ]);
  });

  await act(async () => {
    await result.current.processSingleItem(result.current.queue[0], config);
  });
}

describe('useBatchQueue credit wall analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should track the midbatch wall with its credit deficit', async () => {
    mocks.processImage.mockRejectedValue(
      new Error('You have insufficient credits. This operation requires 1 credit.')
    );
    const item: IBatchItem = {
      id: 'item-1',
      file: new File(['image'], 'image.png', { type: 'image/png' }),
      previewUrl: 'blob:test',
      processedUrl: null,
      status: ProcessingStatus.IDLE,
      progress: 0,
      inputDimensions: { width: 100, height: 100 },
    };
    const { result } = renderHook(() => useBatchQueue());

    await act(async () => {
      await result.current.processSingleItem(item, config);
    });

    expect(mocks.track).toHaveBeenCalledWith('credit_wall_shown', {
      source: 'midbatch',
      requiredCredits: 1,
      currentBalance: 0,
      deficit: 1,
    });
  });

  it.each([
    ['free limit', new mocks.FreeLimitExceededError('Free limit exceeded')],
    ['batch limit', new mocks.BatchLimitError({ current: 5, limit: 5 })],
    ['provider outage', new mocks.ProviderUnavailableError('Temporarily unavailable')],
    ['insufficient credits', new Error('insufficient credits')],
    ['timeout', new Error('request timeout')],
    ['unknown failure', new Error('provider exploded')],
  ])('should leave no item processing after the %s catch branch', async (_name, error) => {
    const { result } = renderHook(() => useBatchQueue());

    await addAndProcessOne(result, error);

    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0]).toMatchObject({
      status: ProcessingStatus.ERROR,
      stage: undefined,
    });
  });

  it('should render the actionable batch-limit modal after a server 429', async () => {
    const { result } = renderHook(() => useBatchQueue());

    await addAndProcessOne(result, new mocks.BatchLimitError({ current: 5, limit: 5 }));

    render(
      <BatchLimitModal
        isOpen={!!result.current.batchLimitExceeded}
        onClose={vi.fn()}
        limit={result.current.batchLimitExceeded?.limit ?? 0}
        attempted={result.current.batchLimitExceeded?.attempted ?? 0}
        currentCount={result.current.queue.length}
        onAddPartial={vi.fn()}
        onUpgrade={vi.fn()}
        serverEnforced={result.current.batchLimitExceeded?.serverEnforced}
      />
    );

    expect(screen.getByText('securityMessage')).toBeInTheDocument();
    expect(screen.getByText('quickBuyButton')).toBeInTheDocument();
  });

  it('should render a support-only modal for a provider failure', async () => {
    const { result } = renderHook(() => useBatchQueue());

    await addAndProcessOne(
      result,
      new mocks.ProviderUnavailableError('Provider processing is temporarily unavailable')
    );

    render(
      <ProviderUnavailableModal
        isOpen={!!result.current.providerUnavailable}
        onClose={result.current.clearProviderUnavailable}
      />
    );

    expect(screen.getByTestId('provider-unavailable-modal')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'support@myimageupscaler.com' })).toHaveAttribute(
      'href',
      'mailto:support@myimageupscaler.com'
    );
    expect(screen.queryByText(/buy|purchase|get credits/i)).not.toBeInTheDocument();
  });

  it('should keep purchase CTAs suppressed after closing the outage modal until processing recovers', async () => {
    const { result } = renderHook(() => useBatchQueue());

    await addAndProcessOne(
      result,
      new mocks.ProviderUnavailableError('Provider processing is temporarily unavailable')
    );

    expect(result.current.providerUnavailable).toMatchObject({
      isModalOpen: true,
      suppressPurchaseCtas: true,
    });

    act(() => result.current.clearProviderUnavailable());

    expect(result.current.providerUnavailable).toMatchObject({
      isModalOpen: false,
      suppressPurchaseCtas: true,
    });

    mocks.processImage.mockResolvedValueOnce({
      imageData: 'data:image/png;base64,processed',
      creditsRemaining: 4,
      creditsUsed: 1,
    });
    await act(async () => {
      await result.current.processSingleItem(result.current.queue[0], config);
    });

    expect(result.current.providerUnavailable).toBeNull();
  });
});
