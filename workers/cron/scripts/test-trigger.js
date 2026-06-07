#!/usr/bin/env node
/**
 * Manual Cron Trigger Script
 *
 * Triggers cron jobs manually for testing without waiting for schedule.
 * Works with both local dev and deployed workers.
 *
 * Usage:
 *   node scripts/test-trigger.js webhook-recovery
 *   node scripts/test-trigger.js expiration-check
 *   node scripts/test-trigger.js reconciliation
 *   node scripts/test-trigger.js refresh-3kings-sitemap
 *   node scripts/test-trigger.js gallery-cleanup
 *   node scripts/test-trigger.js email-lifecycle
 */

const JOBS = {
  'webhook-recovery': '*/15 * * * *',
  'expiration-check': '5 * * * *',
  reconciliation: '5 3 * * *',
  'refresh-3kings-sitemap': '30 4 * * *',
  'gallery-cleanup': '0 0 * * *',
  'email-lifecycle': '15 5 * * *',
};

async function triggerCron(jobName, workerUrl = 'http://localhost:8787') {
  const pattern = JOBS[jobName];

  if (!pattern) {
    console.error(`Unknown job: ${jobName}`);
    console.log('Available jobs:', Object.keys(JOBS).join(', '));
    process.exit(1);
  }

  const encodedPattern = encodeURIComponent(pattern);
  const url = `${workerUrl}/trigger?pattern=${encodedPattern}`;

  console.log(`Triggering ${jobName} (${pattern})...`);
  console.log(`URL: ${url}\n`);

  try {
    const response = await fetch(url, { method: 'POST' });
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
