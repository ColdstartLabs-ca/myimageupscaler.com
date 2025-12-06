/**
 * Script to manually fix missing subscription records
 * This retrieves subscription data from Stripe and creates the database record
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import dayjs from 'dayjs';
import * as dotenv from 'dotenv';
import { resolvePlanOrPack, assertKnownPriceId } from '../shared/config/stripe';

// Load environment variables from .env.api
dotenv.config({ path: '.env.api' });
dotenv.config({ path: '.env.client' });

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables:');
  console.error('  STRIPE_SECRET_KEY:', !!STRIPE_SECRET_KEY);
  console.error('  NEXT_PUBLIC_SUPABASE_URL:', !!SUPABASE_URL);
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', !!SUPABASE_SERVICE_ROLE_KEY);
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function fixSubscription(customerId: string, dryRun: boolean = false) {
  console.log(`Fetching subscriptions for customer: ${customerId}`);

  // Get all subscriptions for the customer
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    limit: 10,
  });

  console.log(`Found ${subscriptions.data.length} subscriptions`);

  for (const subscription of subscriptions.data) {
    console.log(`\nProcessing subscription: ${subscription.id}`);
    console.log(`  Status: ${subscription.status}`);
    console.log(`  Price ID: ${subscription.items.data[0]?.price.id}`);
    console.log(`  Current period: ${new Date(subscription.current_period_start * 1000)} - ${new Date(subscription.current_period_end * 1000)}`);

    // Get the user_id from profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, subscription_tier, subscription_status')
      .eq('stripe_customer_id', customerId)
      .single();

    if (profileError || !profile) {
      console.error('  ❌ No profile found for customer');
      continue;
    }

    const userId = profile.id;
    const priceId = subscription.items.data[0]?.price.id || '';

    console.log(`  User ID: ${userId}`);

    // Convert timestamps
    const currentPeriodStartISO = dayjs.unix(subscription.current_period_start).toISOString();
    const currentPeriodEndISO = dayjs.unix(subscription.current_period_end).toISOString();
    const canceledAtISO = subscription.canceled_at
      ? dayjs.unix(subscription.canceled_at).toISOString()
      : null;

    // Upsert subscription
    if (dryRun) {
      console.log(`  🔍 DRY RUN: Would upsert subscription ${subscription.id} for user ${userId}`);
    } else {
      const { error: subError } = await supabase.from('subscriptions').upsert({
        id: subscription.id,
        user_id: userId,
        status: subscription.status,
        price_id: priceId,
        current_period_start: currentPeriodStartISO,
        current_period_end: currentPeriodEndISO,
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: canceledAtISO,
      });

      if (subError) {
        console.error('  ❌ Error upserting subscription:', subError);
        continue;
      }

      console.log('  ✅ Subscription record created/updated');
    }

    // Determine plan name using unified resolver
    let planName = 'Unknown';
    try {
      const resolved = assertKnownPriceId(priceId);
      if (resolved.type === 'plan') {
        planName = resolved.name;
        console.log(`  📋 Resolved plan: ${planName} (${resolved.credits} credits)`);
      } else {
        console.log(`  ⚠️  Price ID ${priceId} resolved to credit pack, not subscription plan`);
        planName = 'Credit Purchase';
      }
    } catch (error) {
      console.log(`  ❌ Could not resolve price ID ${priceId} with unified resolver`);
      console.log(`  📝 Fallback: Using price ID fragments for plan detection`);

      // Fallback to legacy detection for unknown price IDs
      if (priceId.includes('hobby') || priceId.includes('Hobby')) {
        planName = 'Hobby';
      } else if (priceId.includes('pro') || priceId.includes('Pro')) {
        planName = 'Professional';
      } else if (priceId.includes('business') || priceId.includes('Business')) {
        planName = 'Business';
      } else {
        // Use price ID itself as last resort
        planName = `Plan (${priceId.substring(0, 12)}...)`;
      }
    }

    // Update profile
    if (dryRun) {
      console.log(`  🔍 DRY RUN: Would update profile ${userId} - tier: ${planName}, status: ${subscription.status}`);
    } else {
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({
          subscription_status: subscription.status,
          subscription_tier: planName,
        })
        .eq('id', userId);

      if (profileUpdateError) {
        console.error('  ❌ Error updating profile:', profileUpdateError);
      } else {
        console.log(`  ✅ Profile updated - tier: ${planName}, status: ${subscription.status}`);
      }
    }
  }
}

// Bulk function to fix all subscriptions
async function fixAllSubscriptions(dryRun: boolean = false) {
  console.log('🔍 Fetching all Stripe customers...');

  let allCustomers: Stripe.Customer[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const customers = await stripe.customers.list({
      limit: 100,
      starting_after: startingAfter,
    });

    allCustomers = allCustomers.concat(customers.data);
    hasMore = customers.has_more;
    startingAfter = customers.data[customers.data.length - 1]?.id;
  }

  console.log(`📊 Found ${allCustomers.length} total customers`);

  const dryRunPrefix = dryRun ? 'DRY RUN: ' : '';
  let processedCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (const customer of allCustomers) {
    try {
      console.log(`\n${dryRunPrefix}🔄 Processing customer: ${customer.id} (${customer.email})`);
      await fixSubscription(customer.id, dryRun);
      processedCount++;
    } catch (error) {
      console.error(`❌ Error processing customer ${customer.id}:`, error);
      errorCount++;
    }
  }

  console.log(`\n${dryRunPrefix}📈 Summary:`);
  console.log(`  - Total customers: ${allCustomers.length}`);
  console.log(`  - Successfully processed: ${processedCount}`);
  console.log(`  - Errors: ${errorCount}`);
  console.log(`  - Skipped: ${skippedCount}`);
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const customerId = args[0];
  const dryRun = args.includes('--dry-run') || args.includes('-d');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: tsx scripts/fix-subscription.ts [options] [customer_id]

Options:
  --dry-run, -d    Show what would be changed without making changes
  --all, -a       Process all customers (useful for bulk repair)
  --help, -h      Show this help message

Examples:
  tsx scripts/fix-subscription.ts cus_1234567890           # Fix single customer
  tsx scripts/fix-subscription.ts cus_1234567890 --dry-run  # Preview changes
  tsx scripts/fix-subscription.ts --all                    # Fix all customers
  tsx scripts/fix-subscription.ts --all --dry-run          # Preview all changes
    `);
    return;
  }

  if (args.includes('--all') || args.includes('-a')) {
    await fixAllSubscriptions(dryRun);
  } else if (customerId) {
    await fixSubscription(customerId, dryRun);
  } else {
    console.error('❌ Error: Please provide a customer ID or use --all flag');
    console.error('Use --help for usage information');
    process.exit(1);
  }
}

// Run the script
main()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
