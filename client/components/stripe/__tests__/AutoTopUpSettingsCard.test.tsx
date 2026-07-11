import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AutoTopUpSettingsCard } from '../AutoTopUpSettingsCard';

vi.mock('@server/supabase/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));

describe('AutoTopUpSettingsCard', () => {
  beforeEach(() => vi.restoreAllMocks());

  test('shows the precise rule and disables it in one click', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({
          data: {
            enabled: true,
            pending_enabled: false,
            threshold_credits: 25,
            pack_key: 'medium',
            last_refill_at: null,
            failure_reason: null,
          },
        })
      )
      .mockResolvedValueOnce(Response.json({ data: { enabled: false, pending_enabled: false } }));
    render(<AutoTopUpSettingsCard />);
    expect(await screen.findByText(/buys the medium pack below 25 credits/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /disable auto top-up/i }));
    await waitFor(() => expect(screen.getByText('Disabled')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/auto-top-up/settings',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ enabled: false }) })
    );
  });

  test('shows pending consent and still allows immediate disable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        data: {
          enabled: false,
          pending_enabled: true,
          threshold_credits: 10,
          pack_key: 'small',
          last_refill_at: null,
          failure_reason: null,
        },
      })
    );
    render(<AutoTopUpSettingsCard />);
    expect(await screen.findByText('Pending small pack below 10 credits')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disable auto top-up/i })).toBeEnabled();
  });

  test('shows accessible loading and a retryable GET failure', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ data: null }));
    render(<AutoTopUpSettingsCard />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading auto top-up settings');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load auto top-up settings'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  test('keeps a paused failure reason visible while disabled', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        data: {
          enabled: false,
          pending_enabled: false,
          threshold_credits: 25,
          pack_key: 'medium',
          last_refill_at: null,
          failure_reason: 'payment_declined',
        },
      })
    );
    render(<AutoTopUpSettingsCard />);
    expect(
      await screen.findByText(
        'Status: The last top-up could not be completed. Please check your payment method.'
      )
    ).toBeInTheDocument();
  });
});
