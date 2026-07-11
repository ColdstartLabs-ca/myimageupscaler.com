import { describe, expect, it, vi } from 'vitest';

vi.mock('@server/supabase/supabaseClient', () => ({ supabase: {} }));
import { getAutoTopUpFailureMessage } from '@client/components/stripe/AutoTopUpSettingsCard';

describe('auto top-up failure copy', () => {
  it('does not expose internal failure details to customers', () => {
    const message = getAutoTopUpFailureMessage('payment_intent_persistence_failed:db timeout');
    expect(message).not.toContain('payment_intent_persistence_failed');
    expect(message).toContain('could not be completed');
  });
});
