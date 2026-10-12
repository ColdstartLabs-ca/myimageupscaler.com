/**
 * Test environment boundary. Every Playwright run, the `yarn dev:test` server and every
 * helper that can build a Supabase client goes through here first, so no test can reach
 * production no matter what the invoking shell (e.g. deploy.sh after `load-env.sh --prod`)
 * or `.env.test` contains. There is deliberately no "allow production" switch.
 *
 * Real-database tests are BLOCKED: no independently provisioned and verified MIU test
 * database exists, and a URL/flag in the environment cannot prove ownership. Only the
 * mock-only target is accepted; every helper that needs a real database refuses before
 * any network request. Opening that path needs a separately reviewed provisioning change.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';

type IEnv = Record<string, string | undefined>;

// Public project id of the production Supabase project (not a secret).
const PRODUCTION_SUPABASE_REF = 'xqysaylskffsfwunczbd';

// Hyphenated ref: real Supabase refs are 20 lowercase letters, so this is never a project and
// does not resolve (NXDOMAIN). It must sit under https://*.supabase.co or the app CSP (connect-src)
// blocks browser requests before Playwright route mocks see them.
export const MOCK_SUPABASE_URL = 'https://miu-test-mock.supabase.co';

const SUPABASE_KEY_VARS = ['SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];

// Exact names only (no prefixes): shell basics plus the Playwright runner/worker keys.
const INHERITED_NAMES = new Set([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'COLORTERM',
  'TMPDIR',
  'TZ',
  'CI',
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'XDG_RUNTIME_DIR',
  'FORCE_COLOR',
  'NO_COLOR',
  'DEBUG',
  'DEBUG_COLORS',
  'NODE_OPTIONS',
  'NODE_EXTRA_CA_CERTS',
  'NW_QA_ARTIFACTS',
  'PWDEBUG',
  'PW_DISABLE_TS_ESM',
  'PLAYWRIGHT_BROWSERS_PATH',
  'TEST_WORKER_INDEX',
  'TEST_PARALLEL_INDEX',
  'TEST_PORT',
  'TEST_WRANGLER_PORT',
]);

// Non-secret `.env.test` keys. Supabase values are kept only to be validated (mock only).
const ENV_TEST_FILE_NAMES = new Set([
  'NEXT_PUBLIC_SUPABASE_URL',
  ...SUPABASE_KEY_VARS,
  'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
  'NEXT_PUBLIC_FACEBOOK_CLIENT_ID',
  'NEXT_PUBLIC_AZURE_CLIENT_ID',
  'NEXT_PUBLIC_ENABLE_GOOGLE_OAUTH',
  'NEXT_PUBLIC_ENABLE_AZURE_OAUTH',
  'NEXT_PUBLIC_ADMIN_EMAIL',
  'NEXT_PUBLIC_APP_NAME',
]);

const FORCED = {
  // `next dev` would load .env.test(.local) under NODE_ENV=test; development files are refused below.
  NODE_ENV: 'development',
  ENV: 'test',
  NEXT_PUBLIC_ENV: 'test',
  PLAYWRIGHT_TEST: 'true',
  STRIPE_SECRET_KEY: 'sk_test_dummy_key',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
  // Shared by the runner (tests/helpers/auth.ts) and the server (lib/middleware/auth.ts).
  TEST_AUTH_TOKEN: 'test_auth_token_for_testing_only',
  // Public canonical origin the SEO guard asserts; previously leaked in from the deploy shell.
  NEXT_PUBLIC_BASE_URL: 'https://myimageupscaler.com',
};

const MOCK_DEFAULTS = {
  NEXT_PUBLIC_SUPABASE_URL: MOCK_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'miu-test-mock-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'miu-test-mock-service-role-key',
};

// Every file `@next/env` loadEnvConfig can pick up for any NODE_ENV, except `.env.test`,
// which only NODE_ENV=test selects (NODE_ENV is forced to development).
const NEXT_AUTO_ENV_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.test.local',
  '.env.production',
  '.env.production.local',
];

function unsafe(reason: string): Error {
  return new Error(
    `Unsafe test environment: ${reason}. Refusing before any database client exists.`
  );
}

function productionClaim(value: string): string | null {
  if (value.includes(PRODUCTION_SUPABASE_REF)) return 'references the production Supabase project';
  if (/^(sb_secret_|sb_publishable_|sk_live_|rk_live_)/.test(value))
    return 'is a hosted/live credential';
  if (/^eyJ[\w-]*\.[\w-]+\.[\w-]*$/.test(value)) {
    try {
      const claims = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'));
      if (claims && typeof claims === 'object' && 'ref' in claims) {
        return 'is a key for a hosted Supabase project';
      }
    } catch {
      // Not a JWT payload; nothing to inspect.
    }
  }
  return null;
}

export const REAL_TEST_DATABASE_BLOCKED =
  'Real-database test helpers are disabled: no independently provisioned and verified ' +
  'MIU test database exists. Only mock-only suites (e.g. yarn test:seo-guard) can run.';

/** Throws unless the Supabase target is the mock-only sentinel (the only accepted target). */
export function assertSafeTestDatabaseTarget(env: IEnv = process.env): void {
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', ...SUPABASE_KEY_VARS]) {
    const claim = env[name] ? productionClaim(env[name]!) : null;
    if (claim) throw unsafe(`${name} ${claim}`);
  }

  const raw = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) throw unsafe('NEXT_PUBLIC_SUPABASE_URL is missing');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw unsafe('NEXT_PUBLIC_SUPABASE_URL is malformed');
  }
  if (url.origin !== MOCK_SUPABASE_URL) {
    throw unsafe(
      `Supabase target ${url.host} is not the mock-only sentinel; real-database tests are blocked`
    );
  }
}

/**
 * Call with the EXACT url and keys about to be passed to createClient (not a re-read of
 * process.env, which can differ from cached config). Always throws while no verified
 * MIU test database exists; production-looking values are reported as unsafe first.
 */
export function assertRealTestDatabase(
  url: string | undefined,
  keys: Array<string | undefined>
): void {
  for (const value of [url, ...keys]) {
    const claim = value ? productionClaim(value) : null;
    if (claim) throw unsafe(`a Supabase client value ${claim}`);
  }
  throw new Error(REAL_TEST_DATABASE_BLOCKED);
}

/**
 * One deterministic test environment: allowlisted shell/runner keys + allowlisted
 * `.env.test` keys + forced test flags. Everything else is dropped, never merged.
 */
export function buildIsolatedTestEnv(inherited: IEnv, envTestFile: IEnv | undefined): IEnv {
  const pick = (source: IEnv, names: Set<string>) =>
    Object.fromEntries(
      Object.entries(source).filter(([name, value]) => value !== undefined && names.has(name))
    );
  const env: IEnv = {
    ...MOCK_DEFAULTS,
    ...pick(inherited, INHERITED_NAMES),
    ...pick(envTestFile ?? {}, ENV_TEST_FILE_NAMES),
    ...FORCED,
  };

  // A production value anywhere in .env.test (even a dropped key) means the file is unsafe.
  for (const [name, value] of [...Object.entries(envTestFile ?? {}), ...Object.entries(env)]) {
    const claim = value ? productionClaim(value) : null;
    if (claim) throw unsafe(`${name} ${claim}`);
  }
  assertSafeTestDatabaseTarget(env);
  return env;
}

/**
 * Final check of an already-built environment before `next dev` starts. Next.js would
 * silently fill missing keys from its auto-loaded files, breaking the sanitized env.
 */
export function assertIsolatedRuntimeEnv(env: IEnv = process.env, cwd = process.cwd()): void {
  for (const file of NEXT_AUTO_ENV_FILES) {
    if (existsSync(path.join(cwd, file))) throw unsafe(`${file} would be auto-loaded by Next.js`);
  }
  if (env.NODE_ENV !== 'development') throw unsafe('NODE_ENV must be development');
  for (const [name, value] of Object.entries(env)) {
    const claim = value ? productionClaim(value) : null;
    if (claim) throw unsafe(`${name} ${claim}`);
  }
  assertSafeTestDatabaseTarget(env);
}

/** Replaces `target` (process.env by default) in place with the isolated environment. */
export function applyIsolatedTestEnv(target: IEnv = process.env, envTestPath = '.env.test'): void {
  const fileEnv = existsSync(envTestPath) ? parse(readFileSync(envTestPath)) : undefined;
  const env = buildIsolatedTestEnv(target, fileEnv);
  assertIsolatedRuntimeEnv(env, path.dirname(path.resolve(envTestPath)));
  for (const name of Object.keys(target)) delete target[name];
  Object.assign(target, env);
}

// CLI used by scripts/dev-test.sh: `tsx test-env-isolation.ts [command...]` builds the same
// isolated environment as playwright.config.ts, then runs `command` only inside it.
if (process.argv[1]?.endsWith('test-env-isolation.ts')) {
  try {
    applyIsolatedTestEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const [command, ...args] = process.argv.slice(2);
  if (command) {
    const child = spawnSync(command, args, { stdio: 'inherit', env: process.env });
    process.exit(child.status ?? 1);
  }
}
