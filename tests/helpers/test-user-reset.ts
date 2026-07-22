import { createClient } from '@supabase/supabase-js';

/**
 * Fixed test user for all tests - reuses the same account
 */
const FIXED_TEST_USER = {
  email: 'fixed-test-user@myimageupscaler.test',
  password: 'TestPassword123!SecureForTests',
};

/**
 * Reset the fixed test user to initial state before each test
 * This replaces creating new users for every test
 */
export async function resetTestUser(): Promise<{
  id: string;
  email: string;
  access_token: string;
}> {
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

  // Try to get existing user
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  let user = existingUsers.users.find(u => u.email === FIXED_TEST_USER.email);

  // Create user if doesn't exist
  if (!user) {
    const { data: adminData, error: adminError } = await supabase.auth.admin.createUser({
      email: FIXED_TEST_USER.email,
      password: FIXED_TEST_USER.password,
      email_confirm: true,
    });

    if (adminError) {
      throw new Error(`Failed to create fixed test user: ${adminError.message}`);
    }

    user = adminData.user;
  }

  if (!user) {
    throw new Error('Failed to get/create test user');
  }

  // Reset credits to 10 (default starting amount)
  const { error: resetError } = await supabase.rpc('increment_credits_with_log', {
    target_user_id: user.id,
    amount: 10 - (await getCurrentCredits(supabase, user.id)),
    transaction_type: 'bonus',
    description: 'Test reset to initial state',
  });

  if (resetError) {
    console.warn(`Could not reset credits: ${resetError.message}`);
  }

  // Clear subscription status
  await supabase
    .from('profiles')
    .update({
      subscription_status: null,
      subscription_tier: null,
      stripe_customer_id: null,
    })
    .eq('id', user.id);

  // Delete any subscription records
  await supabase.from('subscriptions').delete().eq('user_id', user.id);

  // Sign in to get fresh token
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: FIXED_TEST_USER.email,
    password: FIXED_TEST_USER.password,
  });

  if (signInError || !signInData.session) {
    throw new Error(`Failed to sign in test user: ${signInError?.message}`);
  }

  return {
    id: user.id,
    email: user.email!,
    access_token: signInData.session.access_token,
  };
}

/**
 * Get current credits for a user
 */
async function getCurrentCredits(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<number> {
  const { data } = await supabase
    .from('profiles')
    .select('credits_balance')
    .eq('id', userId)
    .single();

  return data?.credits_balance || 0;
}

/**
 * Clean up old test users (those with email pattern test-*@test.local or @test.pool.local)
 * Run this manually or in a maintenance script to clean up pollution
 */
export async function cleanupOldTestUsers(): Promise<number> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let deletedCount = 0;
  let page = 1;
  const perPage = 100;

  // Paginate through all users
  while (true) {
    const { data: usersPage } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (!usersPage || usersPage.users.length === 0) break;

    for (const user of usersPage.users) {
      // Delete users with test email patterns (but keep the fixed test user)
      const isTestUser =
        user.email &&
        (user.email.includes('@test.local') || user.email.includes('@test.pool.local')) &&
        user.email !== FIXED_TEST_USER.email;

      if (isTestUser) {
        const [grantResult, transactionResult] = await Promise.all([
          supabase.from('free_credit_grants').delete().eq('user_id', user.id),
          supabase.from('credit_transactions').delete().eq('user_id', user.id),
        ]);
        if (grantResult.error || transactionResult.error) {
          throw new Error(
            `Failed to clean up test credit data: ${grantResult.error?.message ?? transactionResult.error?.message}`
          );
        }

        await supabase.auth.admin.deleteUser(user.id);
        deletedCount++;

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    // If we got fewer users than perPage, we've reached the end
    if (usersPage.users.length < perPage) break;
    page++;
  }

  return deletedCount;
}
