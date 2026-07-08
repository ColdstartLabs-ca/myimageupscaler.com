#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checkRemote = process.argv.includes('--remote');
const cronDir = path.join(root, 'workers', 'cron');
const wranglerPath = path.join(cronDir, 'wrangler.toml');
const workerPath = path.join(cronDir, 'index.ts');
const triggerPath = path.join(cronDir, 'scripts', 'test-trigger.js');

const fail = (message) => {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
};

const read = (filePath) => fs.readFileSync(filePath, 'utf8');

const endpointRoutePath = (endpoint) => {
  const pathname = new URL(endpoint, 'https://cron.local').pathname;
  return path.join(root, 'app', pathname.replace(/^\//, ''), 'route.ts');
};

const parseWranglerCrons = (toml) => {
  const match = toml.match(/crons\s*=\s*\[([\s\S]*?)\]/);
  if (!match) return [];

  return [...match[1].matchAll(/"([^"]+)"/g)].map(([, cron]) => cron);
};

const parseWorkerName = (toml) => {
  const match = toml.match(/^name\s*=\s*"([^"]+)"/m);
  return match?.[1] ?? '';
};

const parseWorkerRoutes = (source) => {
  const routes = new Map();
  const routeRegex =
    /cronPattern\s*===\s*'([^']+)'[\s\S]*?endpoint\s*=\s*'([^']+)'[\s\S]*?jobName\s*=\s*'([^']+)'/g;

  for (const [, cron, endpoint, jobName] of source.matchAll(routeRegex)) {
    routes.set(cron, { endpoint, jobName });
  }

  return routes;
};

const parseManualTriggerJobs = (source) => {
  const match = source.match(/const JOBS\s*=\s*\{([\s\S]*?)\};/);
  if (!match) return new Map();

  const jobs = new Map();
  const jobRegex = /['"]?([a-zA-Z0-9_-]+)['"]?\s*:\s*'([^']+)'/g;
  for (const [, name, cron] of match[1].matchAll(jobRegex)) {
    jobs.set(cron, name);
  }

  return jobs;
};

const assertUnique = (items, label) => {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item)) fail(`Duplicate ${label}: ${item}`);
    seen.add(item);
  }
};

const wranglerConfig = read(wranglerPath);
const cronPatterns = parseWranglerCrons(wranglerConfig);
const cronWorkerName = parseWorkerName(wranglerConfig);
const workerRoutes = parseWorkerRoutes(read(workerPath));
const manualJobs = parseManualTriggerJobs(read(triggerPath));

assertUnique(cronPatterns, 'cron pattern in workers/cron/wrangler.toml');
assertUnique([...workerRoutes.keys()], 'cron pattern in workers/cron/index.ts');
assertUnique([...workerRoutes.values()].map(({ endpoint }) => endpoint), 'cron endpoint in workers/cron/index.ts');

for (const cron of cronPatterns) {
  const route = workerRoutes.get(cron);
  if (!route) {
    fail(`Cron pattern ${cron} is configured in wrangler.toml but not routed in workers/cron/index.ts`);
    continue;
  }

  const routePath = endpointRoutePath(route.endpoint);
  if (!fs.existsSync(routePath)) {
    fail(`Cron pattern ${cron} routes to ${route.endpoint}, but ${routePath} does not exist`);
    continue;
  }

  const endpointSource = read(routePath);
  if (!endpointSource.includes("request.headers.get('x-cron-secret')")) {
    fail(`${route.endpoint} does not validate the x-cron-secret request header`);
  }

  if (!endpointSource.includes('serverEnv.CRON_SECRET')) {
    fail(`${route.endpoint} does not compare against serverEnv.CRON_SECRET`);
  }

  if (!manualJobs.has(cron)) {
    fail(`Cron pattern ${cron} (${route.jobName}) is missing from workers/cron/scripts/test-trigger.js`);
  }
}

for (const [cron, route] of workerRoutes.entries()) {
  if (!cronPatterns.includes(cron)) {
    fail(`Cron pattern ${cron} routes to ${route.endpoint}, but is missing from workers/cron/wrangler.toml`);
  }
}

if (!cronWorkerName) {
  fail('workers/cron/wrangler.toml is missing a top-level worker name');
}

const assertRemoteSchedules = async () => {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  if (!apiToken || !accountId) {
    fail('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required for --remote cron checks');
    return;
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${cronWorkerName}/schedules`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    fail(`Cloudflare schedule lookup failed for ${cronWorkerName}: HTTP ${response.status} ${body}`);
    return;
  }

  const payload = await response.json();
  if (payload.success === false) {
    fail(`Cloudflare schedule lookup failed for ${cronWorkerName}: ${JSON.stringify(payload.errors)}`);
    return;
  }

  const result = payload.result?.schedules ?? payload.result ?? [];
  const remoteSchedules = result
    .map((item) => {
      if (typeof item === 'string') return item;
      return item.cron ?? item.pattern ?? item.schedule;
    })
    .filter(Boolean);

  assertUnique(remoteSchedules, `deployed Cloudflare schedule on ${cronWorkerName}`);

  for (const cron of cronPatterns) {
    if (!remoteSchedules.includes(cron)) {
      fail(`Cloudflare worker ${cronWorkerName} is missing active cron schedule: ${cron}`);
    }
  }

  for (const cron of remoteSchedules) {
    if (!cronPatterns.includes(cron)) {
      fail(`Cloudflare worker ${cronWorkerName} has unexpected active cron schedule: ${cron}`);
    }
  }
};

if (checkRemote) {
  await assertRemoteSchedules();
}

if (!process.exitCode) {
  const scope = checkRemote ? 'local and deployed cron setup' : 'cron setup';
  console.log(`OK: ${scope} valid (${cronPatterns.length} jobs)`);
}
