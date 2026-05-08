/**
 * Unit tests for Gallery components
 * Tests GalleryImageCard, Gallery, and subcomponents
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

// --- Mocks must be declared before component imports ---

vi.mock('lucide-react', () => ({
  Image: () => null,
  Download: () => null,
  Eye: () => null,
  Trash2: () => null,
  Loader2: () => null,
  ExternalLink: () => null,
  X: () => null,
  RefreshCw: () => null,
  ArrowRight: () => null,
}));

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    fill,
    className,
    unoptimized,
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    className?: string;
    unoptimized?: boolean;
  }) =>
    React.createElement('img', {
      src,
      alt,
      'data-testid': 'next-image',
      'data-fill': fill ? 'true' : undefined,
      className,
      'data-unoptimized': unoptimized ? 'true' : undefined,
    }),
}));

vi.mock('dayjs', () => {
  const mockDayjs = () => ({
    fromNow: () => '2 days ago',
  });
  mockDayjs.extend = vi.fn();
  return {
    default: mockDayjs,
  };
});

vi.mock('@client/store/userStore', () => ({
  useUserData: vi.fn(() => ({
    isFreeUser: true,
    totalCredits: 100,
    profile: null,
    subscription: null,
    isAuthenticated: true,
  })),
}));

vi.mock('@client/store/toastStore', () => ({
  useToastStore: vi.fn(() => ({
    showToast: vi.fn(),
  })),
}));

vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: {
    track: vi.fn(),
  },
}));

vi.mock('@client/hooks/useGallery', () => ({
  useGallery: vi.fn(),
}));

vi.mock('@client/components/stripe/PurchaseModal', () => ({
  PurchaseModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen
      ? React.createElement(
          'div',
          { 'data-testid': 'purchase-modal' },
          React.createElement('button', { onClick: onClose }, 'Close')
        )
      : null,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => React.createElement('a', { href, className }, children),
}));

// Mock translations
vi.mock('next-intl', async () => {
  const actual = await vi.importActual<typeof import('next-intl')>('next-intl');
  return {
    ...actual,
    useTranslations: () => (key: string, params?: Record<string, string>) => {
      const map: Record<string, string> = {
        title: 'Gallery',
        subtitle: 'Your saved upscaled images',
        emptyTitle: 'No saved images yet',
        emptyDescription: 'Images you save during processing will appear here.',
        saveFirstImage: 'Save your first image',
        usageLabel: 'Gallery usage',
        images: 'images',
        limitReached: "You've reached your gallery limit.",
        upgradeTitle: 'Gallery full',
        upgradeDescription: 'Upgrade to save unlimited images',
        upgradeNow: 'Upgrade Now',
        refresh: 'Refresh',
        loading: 'Loading...',
        loadMore: 'Load More',
        viewFullSize: 'View full size',
        download: 'Download',
        delete: 'Delete',
        deleteImage: 'Delete Image',
        deleteConfirm: 'Are you sure you want to delete this image?',
        deleteWarning: `This will permanently delete ${params?.filename ?? 'file'}. This action cannot be undone.`,
        cancel: 'Cancel',
      };
      return map[key] ?? key;
    },
  };
});

// Import after mocks are set up
import { useGallery } from '@client/hooks/useGallery';
import { GalleryImageCard } from '@client/components/dashboard/GalleryImageCard';
import { Gallery } from '@client/components/dashboard/Gallery';
import type { IGalleryImage, IGalleryStats, IGalleryListState } from '@shared/types/gallery.types';

const mockUseGallery = vi.mocked(useGallery);

// Test data helpers
function createMockImage(overrides: Partial<IGalleryImage> = {}): IGalleryImage {
  return {
    id: 'img-1',
    user_id: 'user-1',
    original_filename: 'test-image.jpg',
    storage_path: 'gallery/user-1/test-image.jpg',
    signed_url: 'https://example.com/signed-url',
    width: 1024,
    height: 1024,
    model_used: 'Real-ESRGAN',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function createMockListState(
  images: IGalleryImage[] = [],
  overrides: Partial<IGalleryListState> = {}
): IGalleryListState {
  return {
    images,
    total: images.length,
    page: 1,
    pageSize: 12,
    hasMore: false,
    ...overrides,
  };
}

function createMockUsage(overrides: Partial<IGalleryStats> = {}): IGalleryStats {
  return {
    current_count: 5,
    max_allowed: 10,
    ...overrides,
  };
}

function renderWithIntl(component: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={{}}>
      {component}
    </NextIntlClientProvider>
  );
}

describe('GalleryImageCard', () => {
  const mockOnDelete = vi.fn().mockResolvedValue(true);
  const mockImage = createMockImage();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders image card with correct information', () => {
    renderWithIntl(<GalleryImageCard image={mockImage} onDelete={mockOnDelete} />);

    expect(screen.getByText('test-image.jpg')).toBeInTheDocument();
    expect(screen.getByText('Real-ESRGAN')).toBeInTheDocument();
    expect(screen.getByTestId('next-image')).toBeInTheDocument();
  });

  it('shows truncated filename for long filenames', () => {
    const longNameImage = createMockImage({
      original_filename: 'this-is-a-very-long-filename-that-should-be-truncated.jpg',
    });

    renderWithIntl(<GalleryImageCard image={longNameImage} onDelete={mockOnDelete} />);

    // Should show truncated version
    expect(screen.getByText(/this-is-a-very-lon...jpg/)).toBeInTheDocument();
  });

  it('shows delete confirmation modal when delete button is clicked', async () => {
    renderWithIntl(<GalleryImageCard image={mockImage} onDelete={mockOnDelete} />);

    // Hover overlay buttons are only visible on hover, but we can trigger the delete
    const deleteButton = screen.getByTitle('Delete');
    fireEvent.click(deleteButton);

    // Delete modal should appear
    expect(screen.getByText('Delete Image')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this image?')).toBeInTheDocument();
  });

  it('calls onDelete when delete is confirmed', async () => {
    renderWithIntl(<GalleryImageCard image={mockImage} onDelete={mockOnDelete} />);

    // Open delete modal
    const deleteButton = screen.getByTitle('Delete');
    fireEvent.click(deleteButton);

    // Confirm delete
    const confirmButton = screen.getByText('Delete');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockOnDelete).toHaveBeenCalledWith('img-1');
    });
  });

  it('shows image preview modal when view button is clicked', async () => {
    renderWithIntl(<GalleryImageCard image={mockImage} onDelete={mockOnDelete} />);

    const viewButton = screen.getByTitle('View full size');
    fireEvent.click(viewButton);

    // Preview modal should appear with the image
    expect(screen.getByLabelText('Close preview')).toBeInTheDocument();
  });

  it('handles download action', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['image data'])),
    });
    global.fetch = mockFetch;

    // Mock URL.createObjectURL and related methods
    const mockCreateObjectURL = vi.fn(() => 'blob:test');
    const mockRevokeObjectURL = vi.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;

    renderWithIntl(<GalleryImageCard image={mockImage} onDelete={mockOnDelete} />);

    const downloadButton = screen.getByTitle('Download');
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/signed-url');
    });
  });
});

describe('Gallery', () => {
  const mockFetchImages = vi.fn().mockResolvedValue(undefined);
  const mockLoadMore = vi.fn().mockResolvedValue(undefined);
  const mockRefresh = vi.fn().mockResolvedValue(undefined);
  const mockDeleteImage = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGallery.mockReturnValue({
      saveImage: vi.fn().mockResolvedValue(true),
      deleteImage: mockDeleteImage,
      fetchUsage: vi.fn().mockResolvedValue(undefined),
      fetchImages: mockFetchImages,
      loadMore: mockLoadMore,
      refresh: mockRefresh,
      usage: createMockUsage(),
      listState: createMockListState(),
      isSaving: false,
      isDeleting: false,
      isLoadingUsage: false,
      isLoadingImages: false,
      error: null,
      lastSavedImageId: null,
    });
  });

  it('shows empty state when no images', () => {
    renderWithIntl(<Gallery />);

    expect(screen.getByText('No saved images yet')).toBeInTheDocument();
    expect(screen.getByText('Save your first image')).toBeInTheDocument();
  });

  it('shows loading skeleton while loading', () => {
    mockUseGallery.mockReturnValue({
      saveImage: vi.fn().mockResolvedValue(true),
      deleteImage: mockDeleteImage,
      fetchUsage: vi.fn().mockResolvedValue(undefined),
      fetchImages: mockFetchImages,
      loadMore: mockLoadMore,
      refresh: mockRefresh,
      usage: null,
      listState: createMockListState(),
      isSaving: false,
      isDeleting: false,
      isLoadingUsage: false,
      isLoadingImages: true,
      error: null,
      lastSavedImageId: null,
    });

    renderWithIntl(<Gallery />);

    // Should show skeleton (animated pulse elements)
    const skeletonCards = document.querySelectorAll('.animate-pulse');
    expect(skeletonCards.length).toBeGreaterThan(0);
  });

  it('shows images in grid when available', () => {
    const images = [
      createMockImage({ id: 'img-1', original_filename: 'image1.jpg' }),
      createMockImage({ id: 'img-2', original_filename: 'image2.jpg' }),
    ];

    mockUseGallery.mockReturnValue({
      saveImage: vi.fn().mockResolvedValue(true),
      deleteImage: mockDeleteImage,
      fetchUsage: vi.fn().mockResolvedValue(undefined),
      fetchImages: mockFetchImages,
      loadMore: mockLoadMore,
      refresh: mockRefresh,
      usage: createMockUsage(),
      listState: createMockListState(images),
      isSaving: false,
      isDeleting: false,
      isLoadingUsage: false,
      isLoadingImages: false,
      error: null,
      lastSavedImageId: null,
    });

    renderWithIntl(<Gallery />);

    expect(screen.getByText('image1.jpg')).toBeInTheDocument();
    expect(screen.getByText('image2.jpg')).toBeInTheDocument();
  });

  it('shows usage bar with correct count', () => {
    mockUseGallery.mockReturnValue({
      saveImage: vi.fn().mockResolvedValue(true),
      deleteImage: mockDeleteImage,
      fetchUsage: vi.fn().mockResolvedValue(undefined),
      fetchImages: mockFetchImages,
      loadMore: mockLoadMore,
      refresh: mockRefresh,
      usage: createMockUsage({ current_count: 5, max_allowed: 10 }),
      listState: createMockListState(),
      isSaving: false,
      isDeleting: false,
      isLoadingUsage: false,
      isLoadingImages: false,
      error: null,
      lastSavedImageId: null,
    });

    renderWithIntl(<Gallery />);

    expect(screen.getByText('5 / 10 images')).toBeInTheDocument();
  });

  it('shows upgrade banner when free user at limit', () => {
    mockUseGallery.mockReturnValue({
      saveImage: vi.fn().mockResolvedValue(true),
      deleteImage: mockDeleteImage,
      fetchUsage: vi.fn().mockResolvedValue(undefined),
      fetchImages: mockFetchImages,
      loadMore: mockLoadMore,
      refresh: mockRefresh,
      usage: createMockUsage({ current_count: 10, max_allowed: 10 }),
      listState: createMockListState(),
      isSaving: false,
      isDeleting: false,
      isLoadingUsage: false,
      isLoadingImages: false,
      error: null,
      lastSavedImageId: null,
    });

    renderWithIntl(<Gallery />);

    expect(screen.getByText('Gallery full')).toBeInTheDocument();
    expect(screen.getByText('Upgrade Now')).toBeInTheDocument();
  });

  it('shows load more button when hasMore is true', () => {
    mockUseGallery.mockReturnValue({
      saveImage: vi.fn().mockResolvedValue(true),
      deleteImage: mockDeleteImage,
      fetchUsage: vi.fn().mockResolvedValue(undefined),
      fetchImages: mockFetchImages,
      loadMore: mockLoadMore,
      refresh: mockRefresh,
      usage: createMockUsage(),
      listState: createMockListState([createMockImage()], { hasMore: true }),
      isSaving: false,
      isDeleting: false,
      isLoadingUsage: false,
      isLoadingImages: false,
      error: null,
      lastSavedImageId: null,
    });

    renderWithIntl(<Gallery />);

    expect(screen.getByText('Load More')).toBeInTheDocument();
  });

  it('calls loadMore when load more button is clicked', async () => {
    mockUseGallery.mockReturnValue({
      saveImage: vi.fn().mockResolvedValue(true),
      deleteImage: mockDeleteImage,
      fetchUsage: vi.fn().mockResolvedValue(undefined),
      fetchImages: mockFetchImages,
      loadMore: mockLoadMore,
      refresh: mockRefresh,
      usage: createMockUsage(),
      listState: createMockListState([createMockImage()], { hasMore: true }),
      isSaving: false,
      isDeleting: false,
      isLoadingUsage: false,
      isLoadingImages: false,
      error: null,
      lastSavedImageId: null,
    });

    renderWithIntl(<Gallery />);

    const loadMoreButton = screen.getByText('Load More');
    fireEvent.click(loadMoreButton);

    await waitFor(() => {
      expect(mockLoadMore).toHaveBeenCalled();
    });
  });

  it('calls refresh when refresh button is clicked', async () => {
    renderWithIntl(<Gallery />);

    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});
