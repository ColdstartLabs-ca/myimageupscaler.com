import { describe, it, expect } from 'vitest';
import { isFreeleaderBlocked } from '@/lib/anti-freeloader/check-freeloader';

describe('isFreeleaderBlocked', () => {
  it('should block flagged free user with no purchased credits', () => {
    const profile = {
      is_flagged_freeloader: true,
      subscription_tier: 'free',
      purchased_credits_balance: 0,
    };
    expect(isFreeleaderBlocked(profile)).toBe(true);
  });

  it('should allow non-flagged free user', () => {
    const profile = {
      is_flagged_freeloader: false,
      subscription_tier: 'free',
      purchased_credits_balance: 0,
    };
    expect(isFreeleaderBlocked(profile)).toBe(false);
  });

  it('should allow flagged paid subscriber', () => {
    const profile = {
      is_flagged_freeloader: true,
      subscription_tier: 'hobby',
      purchased_credits_balance: 0,
    };
    expect(isFreeleaderBlocked(profile)).toBe(false);
  });

  it('should allow flagged free user who purchased credits', () => {
    // A free-tier user who bought credits is a legitimate paying customer
    const profile = {
      is_flagged_freeloader: true,
      subscription_tier: 'free',
      purchased_credits_balance: 5,
    };
    expect(isFreeleaderBlocked(profile)).toBe(false);
  });

  it('should allow user with null is_flagged_freeloader', () => {
    const profile = {
      is_flagged_freeloader: null,
      subscription_tier: 'free',
      purchased_credits_balance: 0,
    };
    expect(isFreeleaderBlocked(profile)).toBe(false);
  });

  it('should allow null profile', () => {
    expect(isFreeleaderBlocked(null)).toBe(false);
  });

  it('should allow flagged pro subscriber', () => {
    const profile = {
      is_flagged_freeloader: true,
      subscription_tier: 'pro',
      purchased_credits_balance: 0,
    };
    expect(isFreeleaderBlocked(profile)).toBe(false);
  });

  it('should allow flagged business subscriber', () => {
    const profile = {
      is_flagged_freeloader: true,
      subscription_tier: 'business',
      purchased_credits_balance: 0,
    };
    expect(isFreeleaderBlocked(profile)).toBe(false);
  });
});
