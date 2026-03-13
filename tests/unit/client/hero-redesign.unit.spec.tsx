/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { HeroActions } from '@client/components/landing/HeroActions';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      ctaUploadFirst: 'Upload your first image',
      ctaTrySample: 'Try a sample',
    };
    return translations[key] || key;
  },
  useLocale: () => 'en',
}));

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock analytics
vi.mock('@client/analytics', () => ({
  analytics: {
    track: vi.fn(),
  },
}));

// Mock modal store
vi.mock('@client/store/modalStore', () => ({
  useModalStore: () => ({
    openAuthModal: vi.fn(),
  }),
}));

// Mock subscription config
vi.mock('@shared/config/subscription.config', () => ({
  getSubscriptionConfig: () => ({
    plans: [{ trial: { enabled: true } }],
  }),
}));

describe('HeroActions - Phase 1: Hero Redesign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show "Upload your first image" button', () => {
    render(<HeroActions />);

    expect(screen.getByText('Upload your first image')).toBeInTheDocument();
  });

  it('should show "Try a sample" button', () => {
    render(<HeroActions />);

    expect(screen.getByText('Try a sample')).toBeInTheDocument();
  });

  it('should navigate to tool page on primary CTA click', async () => {
    render(<HeroActions />);

    const uploadButton = screen.getByText('Upload your first image');
    fireEvent.click(uploadButton);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/tools/ai-image-upscaler');
    });
  });

  it('should navigate to tool page with sample param on secondary CTA click', async () => {
    render(<HeroActions />);

    const sampleButton = screen.getByText('Try a sample');
    fireEvent.click(sampleButton);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/tools/ai-image-upscaler?sample=true');
    });
  });
});
