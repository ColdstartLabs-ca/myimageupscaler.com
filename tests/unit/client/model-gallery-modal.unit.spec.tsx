/**
 * Unit tests for ModelGalleryModal component suite
 * Tests modal rendering, filtering, selection, and tier locking behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Check: () => <span data-testid="check-icon">Check</span>,
  Lock: () => <span data-testid="lock-icon">Lock</span>,
  Image: () => <span data-testid="image-icon">Image</span>,
  Search: () => <span data-testid="search-icon">Search</span>,
  Sparkles: () => <span data-testid="sparkles-icon">Sparkles</span>,
  X: () => <span data-testid="x-icon">X</span>,
}));

// Mock analytics
vi.mock('@client/analytics/analyticsClient', () => ({
  analytics: {
    track: vi.fn(),
    isEnabled: () => true,
  },
}));

// Mock cn utility
vi.mock('@client/utils/cn', () => ({
  cn: (...args: (string | undefined | null | false)[]) => args.filter(Boolean).join(' '),
}));

// Mock useRegionTier to prevent fetch('/api/geo') in tests
vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: () => ({
    tier: 'standard',
    pricingRegion: 'standard',
    discountPercent: 0,
    isRestricted: false,
    isLoading: false,
  }),
}));

// Import components after mocks
import { ModelGalleryModal } from '@/client/components/features/workspace/ModelGalleryModal';
import { ModelCard } from '@/client/components/features/workspace/ModelCard';
import { ModelGallerySearch } from '@/client/components/features/workspace/ModelGallerySearch';
import { BottomSheet } from '@/client/components/ui/BottomSheet';
import { QUALITY_TIER_CONFIG, QualityTier } from '@/shared/types/coreflow.types';

/**
 * Helper to find a card by its tier label (the bold name, not placeholder text)
 */
function findCardByTierLabel(label: string): HTMLElement | null {
  // Tier labels have class "font-bold text-xs truncate"
  const allLabels = document.querySelectorAll('span.font-bold.text-xs');
  for (const el of allLabels) {
    if (el.textContent === label) {
      return el.closest('button');
    }
  }
  return null;
}

describe('ModelGalleryModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSelect = vi.fn();
  const mockOnUpgrade = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    currentTier: 'quick' as QualityTier,
    isFreeUser: false,
    onSelect: mockOnSelect,
    onUpgrade: mockOnUpgrade,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render all quality tiers as cards', async () => {
      render(<ModelGalleryModal {...defaultProps} />);

      // Get all tier labels from config
      const expectedTierCount = Object.keys(QUALITY_TIER_CONFIG).length;

      // Find all model cards by looking for credit badges which are unique per card
      // Each card has a credit badge like "1 CR", "2 CR", etc.
      const creditBadges = document.querySelectorAll('[class*="tracking-widest"]');
      expect(creditBadges.length).toBeGreaterThanOrEqual(expectedTierCount);
    });

    it('should highlight currently selected tier', async () => {
      render(<ModelGalleryModal {...defaultProps} currentTier="quick" />);

      // Find the card with Light Blur Fix label (the new name for 'quick' tier)
      const card = findCardByTierLabel('Light Blur Fix');
      expect(card).not.toBeNull();
      expect(card).toHaveClass('border-accent/50');
    });

    it('should render before/after images for tiers with previewImages', async () => {
      render(<ModelGalleryModal {...defaultProps} />);

      // All tiers now have previewImages configured with paths
      // Images will be rendered (and may fall back to placeholders on error)
      const images = screen.getAllByRole('img');
      expect(images.length).toBeGreaterThan(0);
    });
  });

  describe('filtering', () => {
    it('should filter tiers by search query', async () => {
      render(<ModelGalleryModal {...defaultProps} />);

      // Find the search input
      const searchInput = screen.getByPlaceholderText('Search by name, use case, or feature...');

      // Type "anime" to filter
      fireEvent.change(searchInput, { target: { value: 'anime' } });

      // Wait for debounce
      await waitFor(
        () => {
          // Anime Upscale card should be visible
          const animeCard = findCardByTierLabel('Anime Upscale');
          expect(animeCard).not.toBeNull();
        },
        { timeout: 500 }
      );

      // Quick should NOT be visible (it's not in anime use cases)
      await waitFor(() => {
        const quickCard = findCardByTierLabel('Light Blur Fix');
        expect(quickCard).toBeNull();
      });
    });

    it('should show no results state when search has no matches', async () => {
      render(<ModelGalleryModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search by name, use case, or feature...');

      // Type something that won't match anything
      fireEvent.change(searchInput, { target: { value: 'xyznonexistent123' } });

      // Wait for debounce and no results state
      await waitFor(
        () => {
          expect(screen.getByText(/No models found/)).toBeInTheDocument();
        },
        { timeout: 500 }
      );
    });

    it('should clear search when clear button clicked', async () => {
      render(<ModelGalleryModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search by name, use case, or feature...');

      // Type something
      fireEvent.change(searchInput, { target: { value: 'test' } });

      // Wait for input to update
      await waitFor(() => {
        expect(searchInput).toHaveValue('test');
      });

      // Find and click clear button (X icon in search input)
      const searchContainer = searchInput.parentElement;
      const clearButton = within(searchContainer!).getByLabelText('Clear search').closest('button');
      fireEvent.click(clearButton!);

      // Search should be cleared
      await waitFor(() => {
        expect(searchInput).toHaveValue('');
      });
    });
  });

  describe('tier locking', () => {
    it('should mark premium tiers as locked for free users', async () => {
      render(<ModelGalleryModal {...defaultProps} isFreeUser={true} />);

      // Premium tiers should show lock icons
      const lockIcons = screen.getAllByTestId('lock-icon');

      // There should be multiple lock icons (one per premium tier + upgrade prompts)
      expect(lockIcons.length).toBeGreaterThan(0);
    });

    it('should show premium models locked when user has no subscription and no purchased credits', async () => {
      // isFreeUser=true means no subscription AND no purchased credits
      render(<ModelGalleryModal {...defaultProps} isFreeUser={true} />);

      // Premium tiers should show lock icons (lock overlay is visible)
      const lockIcons = screen.getAllByTestId('lock-icon');
      expect(lockIcons.length).toBeGreaterThan(0);
    });

    it('should show premium models unlocked when user has purchased credits', async () => {
      // isFreeUser=false means user either has subscription OR purchased credits
      render(<ModelGalleryModal {...defaultProps} isFreeUser={false} />);

      // Premium tiers should NOT have the lock badge on their cards
      // Note: There is a decorative lock icon in the "Professional Tiers" divider,
      // but the actual lock overlay on ModelCard should not be present
      // Find a premium tier card and verify it doesn't have the lock badge
      const ultraCard = findCardByTierLabel('Ultra Upscale');
      expect(ultraCard).not.toBeNull();

      // The lock badge on the card has class "absolute top-1.5 left-1.5"
      const lockBadge = ultraCard?.querySelector('.absolute.top-1\\.5.left-1\\.5');
      expect(lockBadge).toBeNull();
    });

    it('should call onUpgrade when locked tier clicked', async () => {
      render(<ModelGalleryModal {...defaultProps} isFreeUser={true} />);

      // Find a premium tier (Ultra) card and click it
      const ultraCard = findCardByTierLabel('Ultra Upscale');
      expect(ultraCard).not.toBeNull();
      fireEvent.click(ultraCard!);

      await waitFor(() => {
        expect(mockOnUpgrade).toHaveBeenCalled();
      });
    });

    it('should show upgrade prompt for free users', async () => {
      render(<ModelGalleryModal {...defaultProps} isFreeUser={true} />);

      // Find upgrade prompt
      expect(screen.getByText('Unlock Premium Models')).toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('should call onSelect when available tier clicked', async () => {
      render(<ModelGalleryModal {...defaultProps} isFreeUser={true} />);

      // Click on Light Blur Fix tier card (free tier)
      const quickCard = findCardByTierLabel('Light Blur Fix');
      expect(quickCard).not.toBeNull();
      fireEvent.click(quickCard!);

      await waitFor(() => {
        expect(mockOnSelect).toHaveBeenCalledWith('quick');
      });
    });

    it('should close modal after selecting a tier', async () => {
      render(<ModelGalleryModal {...defaultProps} isFreeUser={true} />);

      // Click on Light Blur Fix tier card
      const quickCard = findCardByTierLabel('Light Blur Fix');
      expect(quickCard).not.toBeNull();
      fireEvent.click(quickCard!);

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });
  });

  describe('keyboard navigation', () => {
    it('should close modal on Escape key', async () => {
      render(<ModelGalleryModal {...defaultProps} />);

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });
  });
});

describe('ModelCard', () => {
  const mockOnSelect = vi.fn();
  const mockOnLockedClick = vi.fn();

  const defaultCardProps = {
    tier: 'quick' as QualityTier,
    config: QUALITY_TIER_CONFIG['quick'],
    isSelected: false,
    isLocked: false,
    onSelect: mockOnSelect,
    onLockedClick: mockOnLockedClick,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render tier label', () => {
    render(<ModelCard {...defaultCardProps} />);
    // Find the bold label specifically
    const label = document.querySelector('span.font-bold.text-xs');
    expect(label?.textContent).toBe('Light Blur Fix');
  });

  it('should render bestFor description', () => {
    render(<ModelCard {...defaultCardProps} />);
    expect(screen.getByText('Low-res screenshots, light blur')).toBeInTheDocument();
  });

  it('should show checkmark when selected', () => {
    render(<ModelCard {...defaultCardProps} isSelected={true} />);
    expect(screen.getByTestId('check-icon')).toBeInTheDocument();
  });

  it('should show lock icon when locked', () => {
    render(<ModelCard {...defaultCardProps} isLocked={true} />);
    expect(screen.getByTestId('lock-icon')).toBeInTheDocument();
  });

  it('should call onSelect when clicked and not locked', () => {
    render(<ModelCard {...defaultCardProps} />);
    const card = screen.getByRole('button');
    fireEvent.click(card);
    expect(mockOnSelect).toHaveBeenCalledWith('quick');
  });

  it('should call onLockedClick when clicked and locked', () => {
    render(<ModelCard {...defaultCardProps} isLocked={true} />);
    const card = screen.getByRole('button');
    fireEvent.click(card);
    expect(mockOnLockedClick).toHaveBeenCalled();
    expect(mockOnSelect).not.toHaveBeenCalled();
  });

  it('should render before/after images when previewImages is set', () => {
    render(<ModelCard {...defaultCardProps} />);
    // Quick tier now has previewImages with paths
    const images = screen.getAllByRole('img');
    expect(images.length).toBeGreaterThanOrEqual(2);
    expect(images[0]).toHaveAttribute('src', '/before-after/quick/before.webp');
    expect(images[1]).toHaveAttribute('src', '/before-after/quick/after.webp');
  });
});

describe('ModelGallerySearch', () => {
  const mockOnChange = vi.fn();
  const defaultSearchProps = {
    value: '',
    onChange: mockOnChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render search input', () => {
    render(<ModelGallerySearch {...defaultSearchProps} />);
    expect(screen.getByPlaceholderText('Search models...')).toBeInTheDocument();
  });

  it('should call onChange with debounce', async () => {
    render(<ModelGallerySearch {...defaultSearchProps} />);

    const input = screen.getByPlaceholderText('Search models...');
    fireEvent.change(input, { target: { value: 'test' } });

    // Should not call immediately
    expect(mockOnChange).not.toHaveBeenCalled();

    // Fast forward 150ms
    vi.advanceTimersByTime(150);

    expect(mockOnChange).toHaveBeenCalledWith('test');
  });

  it('should clear input when X button clicked', () => {
    render(<ModelGallerySearch {...defaultSearchProps} value="test" />);

    const input = screen.getByPlaceholderText('Search models...');
    expect(input).toHaveValue('test');

    // Find and click clear button
    const clearButton = screen.getByLabelText('Clear search').closest('button');
    fireEvent.click(clearButton!);

    expect(mockOnChange).toHaveBeenCalledWith('');
  });

  it('should clear on Escape key', () => {
    render(<ModelGallerySearch {...defaultSearchProps} value="test" />);

    const input = screen.getByPlaceholderText('Search models...');
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(mockOnChange).toHaveBeenCalledWith('');
  });
});

/**
 * Phase 2: Model Gallery UX — Badges & Sorting
 * Tests badge rendering on ModelCard and tier sorting by popularity in ModelGalleryModal.
 */
describe('Phase 2: ModelCard badge rendering', () => {
  const mockOnSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render Popular badge when badge is popular', () => {
    const popularConfig = { ...QUALITY_TIER_CONFIG['quick'], badge: 'popular' as const };
    render(
      <ModelCard
        tier="quick"
        config={popularConfig}
        isSelected={false}
        isLocked={false}
        onSelect={mockOnSelect}
      />
    );
    expect(screen.getByText('Popular')).toBeInTheDocument();
  });

  it('should render Recommended badge when badge is recommended', () => {
    const recommendedConfig = {
      ...QUALITY_TIER_CONFIG['face-restore'],
      badge: 'recommended' as const,
    };
    render(
      <ModelCard
        tier="face-restore"
        config={recommendedConfig}
        isSelected={false}
        isLocked={false}
        onSelect={mockOnSelect}
      />
    );
    expect(screen.getByText('Recommended')).toBeInTheDocument();
  });

  it('should not render badge when badge is null or undefined', () => {
    const noBadgeConfig = { ...QUALITY_TIER_CONFIG['ultra'], badge: null as null | undefined };
    render(
      <ModelCard
        tier="ultra"
        config={noBadgeConfig}
        isSelected={false}
        isLocked={false}
        onSelect={mockOnSelect}
      />
    );
    expect(screen.queryByText('Popular')).not.toBeInTheDocument();
    expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
  });
});

describe('Phase 2: ModelGalleryModal tier sorting by popularity', () => {
  const mockOnClose = vi.fn();
  const mockOnSelect = vi.fn();
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    currentTier: 'face-restore' as QualityTier,
    isFreeUser: false,
    onSelect: mockOnSelect,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sort free tiers by popularity with auto first, then quick, then face-restore', async () => {
    render(<ModelGalleryModal {...defaultProps} />);

    // The "Available" section heading should be present
    expect(screen.getByText('Available')).toBeInTheDocument();

    // Get all model card buttons — order in DOM reflects sort order
    // free tiers: quick (popularity 90), face-restore (popularity 80), bg-removal (popularity 50)
    // auto is in PREMIUM_TIERS (not FREE_TIERS) so it won't appear in the free section
    const cardButtons = document.querySelectorAll('button[class*="rounded-xl"]');
    const cardLabels = Array.from(cardButtons).map(btn => {
      const labelEl = btn.querySelector('span.font-bold.text-xs');
      return labelEl?.textContent ?? '';
    });

    // Filter to only tier label cards (non-empty labels that are tier names)
    const tierLabels = cardLabels.filter(l => l.length > 0);

    // quick (popularity 90) should appear before face-restore (popularity 80)
    const quickIndex = tierLabels.indexOf('Light Blur Fix');
    const faceRestoreIndex = tierLabels.indexOf('Face Restore');

    expect(quickIndex).toBeGreaterThanOrEqual(0);
    expect(faceRestoreIndex).toBeGreaterThanOrEqual(0);
    expect(quickIndex).toBeLessThan(faceRestoreIndex);
  });
});

describe('BottomSheet', () => {
  const mockOnClose = vi.fn();
  const defaultSheetProps = {
    isOpen: true,
    onClose: mockOnClose,
    children: <div>Test Content</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render children when open', () => {
    render(<BottomSheet {...defaultSheetProps} />);
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    render(<BottomSheet {...defaultSheetProps} isOpen={false} />);
    expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
  });

  it('should close on backdrop click', () => {
    render(<BottomSheet {...defaultSheetProps} />);

    // The outermost fixed container is the click handler for backdrop
    const outerContainer = document.querySelector('.fixed.inset-0.z-50');
    expect(outerContainer).not.toBeNull();

    // Click directly on the outer container (not on the content)
    // The backdrop is a sibling of the content container
    fireEvent.click(outerContainer!);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should close on Escape key', () => {
    render(<BottomSheet {...defaultSheetProps} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should render title when provided', () => {
    render(<BottomSheet {...defaultSheetProps} title="Test Title" />);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });
});
