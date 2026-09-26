#!/usr/bin/env node
/**
 * Manual Cron Trigger Script
 *
 * Triggers cron jobs manually for testing without waiting for schedule.
 * Works with both local dev and deployed workers.
 *
 * Usage:
 *   CRON_SECRET=... node scripts/test-trigger.js <job-name> [worker-url]
 *   node scripts/test-trigger.js webhook-recovery
 *   node scripts/test-trigger.js expiration-check
 *   node scripts/test-trigger.js reconciliation
 *   node scripts/test-trigger.js refresh-3kings-sitemap
 *   node scripts/test-trigger.js gallery-cleanup
 *   node scripts/test-trigger.js upscale-input-cleanup
 *   node scripts/test-trigger.js database-retention
 *   node scripts/test-trigger.js upscale-completion-health
 *   node scripts/test-trigger.js email-lifecycle
 *   node scripts/test-trigger.js email-lifecycle-catch-up
 */

const JOBS = {
  'provider-health': '*/5 * * * *',
  'webhook-recovery': '*/15 * * * *',
  'expiration-check': '5 * * * *',
  reconciliation: '5 3 * * *',
  'refresh-3kings-sitemap': '30 4 * * *',
  'gallery-cleanup': '0 0 * * *',
  'upscale-input-cleanup': '20 * * * *',
  'database-retention': '25 * * * *',
  'upscale-completion-health': '15 1 * * *',
  'email-lifecycle': '10 * * * *',
  'email-lifecycle-catch-up': '40 * * * *',
};

async function triggerCron(jobName, workerUrl = 'http://localhost:8787') {
  const pattern = JOBS[jobName];
  // Standalone Node script runs outside the app config module.
  // eslint-disable-next-line no-restricted-syntax
  const cronSecret = process.env.CRON_SECRET;

  if (!pattern) {
    console.error(`Unknown job: ${jobName}`);
    console.log('Available jobs:', Object.keys(JOBS).join(', '));
    process.exit(1);
  }

  if (!cronSecret) {
    console.error('CRON_SECRET is required to authenticate manual triggers.');
    process.exit(1);
  }

  const encodedPattern = encodeURIComponent(pattern);
  const url = `${workerUrl}/trigger?pattern=${encodedPattern}`;

  console.log(`Triggering ${jobName} (${pattern})...`);
  console.log(`URL: ${url}\n`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'x-cron-secret': cronSecret },
    });
    const data = await response.json();

    if (response.ok) {
      console.log('✅ Success:', data);
    } else {
      console.error('❌ Failed:', data);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const jobName = process.argv[2];
const workerUrl = process.argv[3] || 'http://localhost:8787';

if (!jobName) {
  console.log('Usage: node test-trigger.js <job-name> [worker-url]');
  console.log('\nAvailable jobs:');
  Object.entries(JOBS).forEach(([name, pattern]) => {
    console.log(`  ${name.padEnd(20)} ${pattern}`);
  });
  console.log('\nExamples:');
  console.log('  node scripts/test-trigger.js webhook-recovery');
  console.log(
    '  node scripts/test-trigger.js reconciliation https://pixelperfect-cron.workers.dev'
  );
  process.exit(1);
}

triggerCron(jobName, workerUrl);
