import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CancelSubscriptionModal } from '@client/components/stripe/CancelSubscriptionModal';
import { resolveCancellationRetentionOffer } from '@shared/config/cancellation-retention';
import React from 'react';

vi.mock('@server/supabase/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }),
    },
  },
}));

// Mock translations for stripe.cancelSubscription
const mockTranslations = {
  title: 'Cancel Subscription',
  info: 'Your {planName} plan will remain active until {formattedEndDate}.',
  keepAccess: 'You will keep access to all features until the end of your billing period.',
  helpUsImprove: 'Help us improve (optional)',
  reasons: {
    tooExpensive: 'Too expensive',
    notUsingEnough: 'Not using it enough',
    missingFeatures: 'Missing features I need',
    switchingCompetitor: 'Switching to a competitor',
    technicalIssues: 'Technical issues',
    other: 'Other',
  },
  otherPlaceholder: "Please tell us why you're canceling...",
  continue: 'Continue',
  processing: 'Checking...',
  keepSubscription: 'Keep Subscription',
  confirmationTitle: 'Are you sure?',
  confirmationText:
    'Once canceled, you will lose access to all premium features on {formattedEndDate}.',
  goBack: 'Go Back',
  yesCancel: 'Yes, Cancel Subscription',
  canceling: 'Canceling...',
};

function renderWithTranslations(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{
        dashboard: {
          billing: {
            subscriptionBetterValue: 'A smaller plan may fit better.',
            changePlan: 'Change Plan',
            cancelSubscription: 'Cancel Subscription',
            error: 'Failed to load billing information',
          },
        },
        stripe: {
          cancelSubscription: mockTranslations,
        },
      }}
    >
      {ui}
    </NextIntlClientProvider>
  );
}

describe('CancelSubscriptionModal', () => {
  const mockOnClose = vi.fn();
  const mockOnConfirm = vi.fn();
  const mockOnAcceptRetentionOffer = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onConfirm: mockOnConfirm,
    planName: 'Professional',
    periodEnd: '2025-03-01',
    onAcceptRetentionOffer: mockOnAcceptRetentionOffer,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url, init) => {
        const reason = JSON.parse(String(init?.body)).reason;
        const offer = ['too_expensive', 'not_using_enough'].includes(reason)
          ? { targetPlanKey: 'hobby', targetPlanName: 'Hobby' }
          : null;
        return { ok: true, json: async () => ({ data: { offer } }) };
      })
    );
  });

  test('should resolve one lower-plan offer for price and usage reasons', () => {
    expect(resolveCancellationRetentionOffer('too_expensive', 'business')).toMatchObject({
      type: 'downgrade',
      targetPlanKey: 'pro',
    });
    expect(resolveCancellationRetentionOffer('not_using_enough', 'pro')).toMatchObject({
      type: 'downgrade',
      targetPlanKey: 'hobby',
    });
  });

  test('should not offer retention for starter or product-quality reasons', () => {
    expect(resolveCancellationRetentionOffer('too_expensive', 'starter')).toBeNull();
    expect(resolveCancellationRetentionOffer('missing_features', 'pro')).toBeNull();
    expect(resolveCancellationRetentionOffer('technical_issues', 'business')).toBeNull();
  });

  test('should show downgrade offer and preserve continue cancellation action', async () => {
    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('Too expensive'));
    fireEvent.click(screen.getByText('Continue'));

    expect(await screen.findByText('A smaller plan may fit better.')).toBeInTheDocument();
    expect(screen.getByText('Change Plan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel Subscription' })).toBeInTheDocument();
  });

  test('contains keyboard focus and prevents duplicate offer requests while pending', async () => {
    let resolveRequest!: (value: unknown) => void;
    const pending = new Promise(resolve => {
      resolveRequest = resolve;
    });
    const fetchMock = vi.fn(() => pending);
    vi.stubGlobal('fetch', fetchMock);
    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    const buttons = dialog.querySelectorAll('button');
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(buttons[buttons.length - 1]).toHaveFocus();
    fireEvent.keyDown(buttons[buttons.length - 1], { key: 'Tab' });
    expect(buttons[0]).toHaveFocus();
    fireEvent.click(screen.getByLabelText('Too expensive'));
    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);
    fireEvent.click(continueButton);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveRequest({ ok: true, json: async () => ({ data: { offer: null } }) });
    await waitFor(() => expect(screen.getByText('Are you sure?')).toBeInTheDocument());
  });

  test('should accept downgrade offer without canceling', async () => {
    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('Not using it enough'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(await screen.findByText('Change Plan'));

    await waitFor(() => expect(mockOnAcceptRetentionOffer).toHaveBeenCalledTimes(1));
    expect(mockOnConfirm).not.toHaveBeenCalled();
  });

  test('should preserve the offer and cancellation choice when Stripe execution fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url, init) => {
        if (init?.method === 'PUT') return { ok: false, json: async () => ({}) };
        return {
          ok: true,
          json: async () => ({
            data: { offer: { targetPlanKey: 'hobby', targetPlanName: 'Hobby' } },
          }),
        };
      })
    );
    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Too expensive'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(await screen.findByText('Change Plan'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to load billing information'
    );
    expect(screen.getByText('Change Plan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel Subscription' })).toBeEnabled();
  });

  test('should keep cancellation available and ignore a late retention response', async () => {
    let resolveRetention!: (value: unknown) => void;
    const pendingRetention = new Promise(resolve => {
      resolveRetention = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url, init) => {
        if (init?.method === 'PUT') return pendingRetention;
        return {
          ok: true,
          json: async () => ({
            data: { offer: { targetPlanKey: 'hobby', targetPlanName: 'Hobby' } },
          }),
        };
      })
    );
    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Too expensive'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(await screen.findByText('Change Plan'));
    const continueCancellation = screen.getByRole('button', { name: 'Cancel Subscription' });
    expect(continueCancellation).toBeEnabled();
    fireEvent.click(continueCancellation);
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    resolveRetention({ ok: true, json: async () => ({}) });
    await waitFor(() => expect(mockOnAcceptRetentionOffer).not.toHaveBeenCalled());
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  test('should allow direct cancellation after declining offer', async () => {
    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('Too expensive'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel Subscription' }));

    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  test('should render modal when open', () => {
    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} />);

    expect(screen.getByText('Cancel Subscription')).toBeInTheDocument();
    // The description is rendered with the template string - actual interpolation
    // happens in the component with next-intl
    expect(screen.getByText(/plan will remain active until/i)).toBeInTheDocument();
  });

  test('should not render modal when closed', () => {
    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} isOpen={false} />);

    expect(screen.queryByText('Cancel Subscription')).not.toBeInTheDocument();
  });

  test('should show cancellation reasons', () => {
    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} />);

    expect(screen.getByText('Too expensive')).toBeInTheDocument();
    expect(screen.getByText('Not using it enough')).toBeInTheDocument();
    expect(screen.getByText('Missing features I need')).toBeInTheDocument();
    expect(screen.getByText('Switching to a competitor')).toBeInTheDocument();
    expect(screen.getByText('Technical issues')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  test('should show custom reason input when Other is selected', () => {
    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} />);

    const otherOption = screen.getByLabelText('Other');
    fireEvent.click(otherOption);

    expect(
      screen.getByPlaceholderText("Please tell us why you're canceling...")
    ).toBeInTheDocument();
  });

  test('should show confirmation step when Continue is clicked', () => {
    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} />);

    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(screen.getByText('Go Back')).toBeInTheDocument();
    expect(screen.getByText('Yes, Cancel Subscription')).toBeInTheDocument();
  });

  test('should call onConfirm with reason when cancellation is confirmed', async () => {
    const mockReason = 'Too expensive';
    mockOnConfirm.mockResolvedValue(undefined);

    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} />);

    // Select a reason
    const reasonOption = screen.getByLabelText(mockReason);
    fireEvent.click(reasonOption);

    // Click continue to show confirmation
    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel Subscription' }));

    // Confirm cancellation
    const confirmButton = await screen.findByText('Yes, Cancel Subscription');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledWith(mockReason);
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  test('should call onConfirm with custom reason when Other is selected with text', async () => {
    const customReasonText = 'Found a better alternative with more features';
    mockOnConfirm.mockResolvedValue(undefined);

    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} />);

    // Select Other
    const otherOption = screen.getByLabelText('Other');
    fireEvent.click(otherOption);

    // Enter custom reason
    const customInput = screen.getByPlaceholderText("Please tell us why you're canceling...");
    fireEvent.change(customInput, { target: { value: customReasonText } });

    // Click continue to show confirmation
    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    // Confirm cancellation
    const confirmButton = await screen.findByText('Yes, Cancel Subscription');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledWith(customReasonText);
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  test('should call onConfirm with undefined when no reason is selected', async () => {
    mockOnConfirm.mockResolvedValue(undefined);

    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} />);

    // Click continue without selecting a reason
    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    // Confirm cancellation
    const confirmButton = screen.getByText('Yes, Cancel Subscription');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledWith(undefined);
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  test('should go back from confirmation step', () => {
    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} />);

    // Click continue to show confirmation
    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    // Click go back
    const goBackButton = screen.getByText('Go Back');
    fireEvent.click(goBackButton);

    // Should be back to initial step
    expect(screen.getByText('Help us improve (optional)')).toBeInTheDocument();
    expect(screen.getByText('Continue')).toBeInTheDocument();
    expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument();
  });

  test('should close modal when Keep Subscription is clicked', () => {
    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} />);

    const keepButton = screen.getByText('Keep Subscription');
    fireEvent.click(keepButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  test('should close modal when X button is clicked', () => {
    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} />);

    const closeButton = screen.getByRole('button', { name: '' }); // X button
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  test('should show loading state during cancellation', async () => {
    mockOnConfirm.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} />);

    // Click continue to show confirmation
    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    // Confirm cancellation
    const confirmButton = screen.getByText('Yes, Cancel Subscription');
    fireEvent.click(confirmButton);

    // Should show loading state
    expect(screen.getByText('Canceling...')).toBeInTheDocument();
    expect(confirmButton).toBeDisabled();

    await waitFor(() => expect(mockOnClose).toHaveBeenCalled());
  });

  test('should handle cancellation error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockOnConfirm.mockRejectedValue(new Error('Cancellation failed'));

    renderWithTranslations(<CancelSubscriptionModal {...defaultProps} />);

    // Click continue to show confirmation
    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    // Confirm cancellation
    const confirmButton = screen.getByText('Yes, Cancel Subscription');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Error canceling subscription:', expect.any(Error));
    });
    await waitFor(() => expect(screen.getByText('Yes, Cancel Subscription')).toBeEnabled());

    consoleSpy.mockRestore();
  });
});
