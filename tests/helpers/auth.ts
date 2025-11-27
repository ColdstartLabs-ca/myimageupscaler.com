import { test as base } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

type AuthFixtures = {
  authenticatedRequest: ReturnType<typeof base.use>;
  testUser: { id: string; email: string; token: string };
};

export const test = base.extend<AuthFixtures>({
  testUser: async ({ }, use) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required'
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Create test user with unique email using admin API
    const testEmail = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@test.local`;
    const testPassword = 'test-password-123';

    // Use admin API to create user (bypasses email confirmation)
    const { data: adminData, error: adminError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true, // Auto-confirm email
    });

    if (adminError) throw adminError;
    if (!adminData.user) {
      throw new Error('Failed to create test user');
    }

    // Ensure profile exists (wait for trigger or create manually)
    let retries = 0;
    let profile = null;
    while (retries < 5 && !profile) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', adminData.user.id)
        .single();

      profile = profileData;
      if (!profile) {
        // Wait for the trigger to create the profile
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }
    }

    // If profile still doesn't exist, create it manually
    if (!profile) {
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: adminData.user.id,
          credits_balance: 10,
        });

      if (insertError) {
        console.warn('Failed to create profile manually:', insertError);
      }
    }

    // Now sign in to get a session token
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

    if (signInError) throw signInError;
    if (!signInData.session) {
      throw new Error('Failed to sign in test user');
    }

    await use({
      id: adminData.user.id,
      email: adminData.user.email!,
      token: signInData.session.access_token,
    });

    // Cleanup: Delete test user after test completes
    try {
      await supabase.auth.admin.deleteUser(adminData.user.id);
    } catch (cleanupError) {
      console.warn('Failed to cleanup test user:', cleanupError);
    }
  },

  authenticatedRequest: async ({ testUser }, use) => {
    // This fixture provides authenticated request context
    await use({ testUser });
  },
});

export { expect } from '@playwright/test';
