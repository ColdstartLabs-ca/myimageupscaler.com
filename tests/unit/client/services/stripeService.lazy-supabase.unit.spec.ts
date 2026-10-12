import { describe, it, expect, vi } from 'vitest';
import { StripeService } from '@client/services/stripeService';

// vitest.setup.tsx clears vi.fn() calls before each test. Use a plain counter instead.
const { supabaseModuleLoads } = vi.hoisted(() => ({ supabaseModuleLoads: { count: 0 } }));

vi.mock('@server/supabase/supabaseClient', () => {
  supabaseModuleLoads.count += 1;
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: null } }) },
    },
  };
});

describe('StripeService lazy Supabase loading', () => {
  it('does not evaluate the Supabase client until a method needs it', async () => {
    expect(supabaseModuleLoads.count).toBe(0);

    await expect(StripeService.getUserProfile()).resolves.toBeNull();

    expect(supabaseModuleLoads.count).toBe(1);
  });
});
