import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import {
  CheckoutExitSurvey,
  shouldShowExitSurvey,
  markExitSurveyShown,
} from '@client/components/stripe/CheckoutExitSurvey';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  MessageSquare: () => <span data-testid="message-square-icon">MessageSquare</span>,
  X: () => <span data-testid="x-icon">X</span>,
}));

// Mock analytics
const mockTrack = vi.fn();
vi.mock('@client/analytics', () => ({
  analytics: {
    track: (...args: unknown[]) => mockTrack(...args),
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock translations
const mockTranslations = {
  exitSurvey: {
    title: 'Quick question',
    question: 'What stopped you from completing your purchase?',
    options: {
      price_too_high: 'Price was higher than expected',
      payment_method_not_accepted: 'Payment method not accepted',
      not_sure_needed: 'Not sure I need this right now',
      technical_issue: 'Technical issue / page was not working',
      just_browsing: 'Just browsing, not ready to buy',
      other: 'Other',
    },
    otherPlaceholder: 'Tell us more...',
    submit: 'Submit',
    skip: 'Skip',
    thanks: 'Thanks for your feedback!',
  },
};

function renderWithTranslations(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{
        stripe: mockTranslations,
      }}
    >
      {ui}
    </NextIntlClientProvider>
  );
}

describe('CheckoutExitSurvey', () => {
  const defaultProps = {
    priceId: 'price_test_123',
    timeSpentMs: 10000,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should render the survey with all options', () => {
      renderWithTranslations(<CheckoutExitSurvey {...defaultProps} />);

      expect(screen.getByText('Quick question')).toBeInTheDocument();
      expect(
        screen.getByText('What stopped you from completing your purchase?')
      ).toBeInTheDocument();

      // Check all options are rendered
      expect(screen.getByText('Price was higher than expected')).toBeInTheDocument();
      expect(screen.getByText('Payment method not accepted')).toBeInTheDocument();
      expect(screen.getByText('Not sure I need this right now')).toBeInTheDocument();
      expect(screen.getByText('Technical issue / page was not working')).toBeInTheDocument();
      expect(screen.getByText('Just browsing, not ready to buy')).toBeInTheDocument();
      expect(screen.getByText('Other')).toBeInTheDocument();

      // Check buttons
      expect(screen.getByText('Submit')).toBeInTheDocument();
      expect(screen.getByText('Skip')).toBeInTheDocument();
    });

    it('should show text field when Other is selected', async () => {
      renderWithTranslations(<CheckoutExitSurvey {...defaultProps} />);

      // Initially no text field
      expect(screen.queryByPlaceholderText('Tell us more...')).not.toBeInTheDocument();

      // Select "Other" option
      const otherLabel = screen.getByText('Other').closest('label');
      if (otherLabel) {
        const radio = otherLabel.querySelector('input[type="radio"]') as HTMLInputElement;
        fireEvent.click(radio);
      }

      // Text field should appear
      expect(screen.getByPlaceholderText('Tell us more...')).toBeInTheDocument();
    });
  });

  describe('Submission', () => {
    it('should track analytics event on submit', async () => {
      renderWithTranslations(<CheckoutExitSurvey {...defaultProps} />);

      // Select an option
      const priceLabel = screen.getByText('Price was higher than expected').closest('label');
      if (priceLabel) {
        const radio = priceLabel.querySelector('input[type="radio"]') as HTMLInputElement;
        fireEvent.click(radio);
      }

      // Submit
      fireEvent.click(screen.getByText('Submit'));

      expect(mockTrack).toHaveBeenCalledWith('checkout_exit_survey_response', {
        reason: 'price_too_high',
        otherReason: undefined,
        priceId: 'price_test_123',
        timeSpentMs: 10000,
      });
    });

    it('should include otherReason when Other is selected', async () => {
      renderWithTranslations(<CheckoutExitSurvey {...defaultProps} />);

      // Select Other
      const otherLabel = screen.getByText('Other').closest('label');
      if (otherLabel) {
        const radio = otherLabel.querySelector('input[type="radio"]') as HTMLInputElement;
        fireEvent.click(radio);
      }

      // Type custom reason
      const textField = screen.getByPlaceholderText('Tell us more...');
      fireEvent.change(textField, { target: { value: 'My custom reason' } });

      // Submit
      fireEvent.click(screen.getByText('Submit'));

      expect(mockTrack).toHaveBeenCalledWith('checkout_exit_survey_response', {
        reason: 'other',
        otherReason: 'My custom reason',
        priceId: 'price_test_123',
        timeSpentMs: 10000,
      });
    });

    it('should show thanks message after submission', async () => {
      renderWithTranslations(<CheckoutExitSurvey {...defaultProps} />);

      // Select and submit
      const priceLabel = screen.getByText('Price was higher than expected').closest('label');
      if (priceLabel) {
        const radio = priceLabel.querySelector('input[type="radio"]') as HTMLInputElement;
        fireEvent.click(radio);
      }
      fireEvent.click(screen.getByText('Submit'));

      // Thanks message should appear
      expect(screen.getByText('Thanks for your feedback!')).toBeInTheDocument();
    });

    it('should auto-close after showing thanks message', async () => {
      vi.useFakeTimers();
      const onClose = vi.fn();

      renderWithTranslations(<CheckoutExitSurvey {...defaultProps} onClose={onClose} />);

      // Select and submit
      const priceLabel = screen.getByText('Price was higher than expected').closest('label');
      if (priceLabel) {
        const radio = priceLabel.querySelector('input[type="radio"]') as HTMLInputElement;
        fireEvent.click(radio);
      }
      fireEvent.click(screen.getByText('Submit'));

      expect(onClose).not.toHaveBeenCalled();

      // Fast-forward 1.5 seconds
      act(() => {
        vi.advanceTimersByTime(1500);
      });

      expect(onClose).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should disable submit button when no option is selected', () => {
      renderWithTranslations(<CheckoutExitSurvey {...defaultProps} />);

      const submitButton = screen.getByText('Submit');
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Skip functionality', () => {
    it('should close survey without tracking on skip', async () => {
      const onClose = vi.fn();
      renderWithTranslations(<CheckoutExitSurvey {...defaultProps} onClose={onClose} />);

      fireEvent.click(screen.getByText('Skip'));

      expect(onClose).toHaveBeenCalled();
      expect(mockTrack).not.toHaveBeenCalled();
    });
  });

  describe('Close functionality', () => {
    it('should close on backdrop click', async () => {
      const onClose = vi.fn();
      const { container } = renderWithTranslations(
        <CheckoutExitSurvey {...defaultProps} onClose={onClose} />
      );

      // Click on the backdrop (first child of container - the outer div)
      const backdrop = container.firstChild as HTMLElement;
      if (backdrop) {
        fireEvent.click(backdrop);
      }

      expect(onClose).toHaveBeenCalled();
    });

    it('should not close when clicking inside the modal', async () => {
      const onClose = vi.fn();
      renderWithTranslations(<CheckoutExitSurvey {...defaultProps} onClose={onClose} />);

      // Click on the modal content (the title is inside the modal)
      const title = screen.getByText('Quick question');
      fireEvent.click(title);

      expect(onClose).not.toHaveBeenCalled();
    });

    it('should close on X button click', async () => {
      const onClose = vi.fn();
      renderWithTranslations(<CheckoutExitSurvey {...defaultProps} onClose={onClose} />);

      const closeButton = screen.getByLabelText('Close');
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });
  });
});

describe('shouldShowExitSurvey', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should return false if time spent is less than 5 seconds', () => {
    expect(shouldShowExitSurvey(4000)).toBe(false);
  });

  it('should return true if time spent is 5 seconds or more and no recent survey', () => {
    expect(shouldShowExitSurvey(5000)).toBe(true);
    expect(shouldShowExitSurvey(10000)).toBe(true);
  });

  it('should return false if survey was shown less than a week ago', () => {
    // Mark survey as shown now
    markExitSurveyShown();

    // Should not show again
    expect(shouldShowExitSurvey(10000)).toBe(false);
  });

  it('should return true if survey was shown more than a week ago', () => {
    // Mark survey as shown 8 days ago
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    localStorageMock.setItem('checkout_survey_last_shown', eightDaysAgo.toString());

    // Should show again
    expect(shouldShowExitSurvey(10000)).toBe(true);
  });
});

describe('markExitSurveyShown', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should store current timestamp in localStorage', () => {
    const before = Date.now();
    markExitSurveyShown();
    const after = Date.now();

    const stored = localStorageMock.getItem('checkout_survey_last_shown');
    expect(stored).not.toBeNull();

    const timestamp = parseInt(stored!, 10);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});
