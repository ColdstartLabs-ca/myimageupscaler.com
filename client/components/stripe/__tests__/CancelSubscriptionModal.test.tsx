import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CancelSubscriptionModal } from '@client/components/stripe/CancelSubscriptionModal';

describe('CancelSubscriptionModal', () => {
  const mockOnClose = vi.fn();
  const mockOnConfirm = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onConfirm: mockOnConfirm,
    planName: 'Professional',
    periodEnd: '2025-03-01',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should render modal when open', () => {
    render(<CancelSubscriptionModal {...defaultProps} />);

    expect(screen.getByText('Cancel Subscription')).toBeInTheDocument();
    expect(
      screen.getByText(/Your Professional plan will remain active until March 1, 2025/i)
    ).toBeInTheDocument();
  });

  test('should not render modal when closed', () => {
    render(<CancelSubscriptionModal {...defaultProps} isOpen={false} />);

    expect(screen.queryByText('Cancel Subscription')).not.toBeInTheDocument();
  });

  test('should show cancellation reasons', () => {
    render(<CancelSubscriptionModal {...defaultProps} />);

    expect(screen.getByText('Too expensive')).toBeInTheDocument();
    expect(screen.getByText('Not using it enough')).toBeInTheDocument();
    expect(screen.getByText('Missing features I need')).toBeInTheDocument();
    expect(screen.getByText('Switching to a competitor')).toBeInTheDocument();
    expect(screen.getByText('Technical issues')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  test('should show custom reason input when Other is selected', () => {
    render(<CancelSubscriptionModal {...defaultProps} />);

    const otherOption = screen.getByLabelText('Other');
    fireEvent.click(otherOption);

    expect(
      screen.getByPlaceholderText("Please tell us why you're canceling...")
    ).toBeInTheDocument();
  });

  test('should show confirmation step when Continue is clicked', () => {
    render(<CancelSubscriptionModal {...defaultProps} />);

    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(screen.getByText('Go Back')).toBeInTheDocument();
    expect(screen.getByText('Yes, Cancel Subscription')).toBeInTheDocument();
  });

  test('should call onConfirm with reason when cancellation is confirmed', async () => {
    const mockReason = 'Too expensive';
    mockOnConfirm.mockResolvedValue(undefined);

    render(<CancelSubscriptionModal {...defaultProps} />);

    // Select a reason
    const reasonOption = screen.getByLabelText(mockReason);
    fireEvent.click(reasonOption);

    // Click continue to show confirmation
    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    // Confirm cancellation
    const confirmButton = screen.getByText('Yes, Cancel Subscription');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledWith(mockReason);
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  test('should call onConfirm with custom reason when Other is selected with text', async () => {
    const customReasonText = 'Found a better alternative with more features';
    mockOnConfirm.mockResolvedValue(undefined);

    render(<CancelSubscriptionModal {...defaultProps} />);

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
    const confirmButton = screen.getByText('Yes, Cancel Subscription');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledWith(customReasonText);
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  test('should call onConfirm with undefined when no reason is selected', async () => {
    mockOnConfirm.mockResolvedValue(undefined);

    render(<CancelSubscriptionModal {...defaultProps} />);

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
    render(<CancelSubscriptionModal {...defaultProps} />);

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
    render(<CancelSubscriptionModal {...defaultProps} />);

    const keepButton = screen.getByText('Keep Subscription');
    fireEvent.click(keepButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  test('should close modal when X button is clicked', () => {
    render(<CancelSubscriptionModal {...defaultProps} />);

    const closeButton = screen.getByRole('button', { name: '' }); // X button
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  test('should show loading state during cancellation', async () => {
    mockOnConfirm.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    render(<CancelSubscriptionModal {...defaultProps} />);

    // Click continue to show confirmation
    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    // Confirm cancellation
    const confirmButton = screen.getByText('Yes, Cancel Subscription');
    fireEvent.click(confirmButton);

    // Should show loading state
    expect(screen.getByText('Canceling...')).toBeInTheDocument();
    expect(confirmButton).toBeDisabled();
  });

  test('should handle cancellation error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockOnConfirm.mockRejectedValue(new Error('Cancellation failed'));

    render(<CancelSubscriptionModal {...defaultProps} />);

    // Click continue to show confirmation
    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    // Confirm cancellation
    const confirmButton = screen.getByText('Yes, Cancel Subscription');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Error canceling subscription:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });
});
