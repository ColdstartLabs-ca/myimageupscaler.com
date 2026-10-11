import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mockCreateClient }));

import {
  applyIsolatedTestEnv,
  assertSafeTestDatabaseTarget,
  buildIsolatedTestEnv,
  MOCK_SUPABASE_URL,
} from '../../helpers/test-env-isolation';
import { cleanupOldTestUsers, resetTestUser } from '../../helpers/test-user-reset';
import { TestDataManager } from '../../helpers/test-data-manager';

// Synthetic values only. The production ref is the public project id, not a secret.
const PROD_URL = 'https://xqysaylskffsfwunczbd.supabase.co';
const jwt = (payload: object) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
const PROD_SERVICE_JWT = jwt({
  iss: 'supabase',
  ref: 'xqysaylskffsfwunczbd',
  role: 'service_role',
});
const OTHER_PROJECT_JWT = jwt({ iss: 'supabase', ref: 'abcdefghijklmnopqrst', role: 'anon' });
const LOCAL_DEMO_JWT = jwt({ iss: 'supabase-demo', role: 'service_role' });
const OWNED_LOCAL = 'http://127.0.0.1:55421';

const maliciousInherited = {
  PATH: '/usr/bin',
  HOME: '/home/tester',
  TEST_PORT: '3456',
  ENV: 'production',
  NEXT_PUBLIC_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
  SUPABASE_SERVICE_ROLE_KEY: PROD_SERVICE_JWT,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: PROD_SERVICE_JWT,
  STRIPE_SECRET_KEY: 'sk_live_synthetic',
  REPLICATE_API_TOKEN: 'r8_synthetic',
  BREVO_API_KEY: 'xkeysib-synthetic',
  CLOUDFLARE_API_TOKEN: 'cf-synthetic',
  ALLOW_PRODUCTION_TESTS: 'true',
};

function dbEnv(url: string | undefined, extra: Record<string, string> = {}) {
  return {
    ENV: 'test',
    NEXT_PUBLIC_ENV: 'test',
    NEXT_PUBLIC_SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon-key',
    ...extra,
  };
}

describe('assertSafeTestDatabaseTarget', () => {
  it.each([
    ['missing', dbEnv(undefined)],
    ['malformed', dbEnv('not a url')],
    ['canonical production', dbEnv(PROD_URL)],
    ['production even with an explicit override', dbEnv(PROD_URL, { MIU_TEST_DB_URL: PROD_URL })],
    ['another remote project', dbEnv('https://test-project.supabase.co')],
    ['undeclared loopback', dbEnv(OWNED_LOCAL)],
    ['declaration mismatch', dbEnv(OWNED_LOCAL, { MIU_TEST_DB_URL: 'http://127.0.0.1:55422' })],
    [
      'the unrelated local Supabase stack',
      dbEnv('http://127.0.0.1:54321', { MIU_TEST_DB_URL: 'http://127.0.0.1:54321' }),
    ],
    [
      'loopback with a production key claim',
      dbEnv(OWNED_LOCAL, {
        MIU_TEST_DB_URL: OWNED_LOCAL,
        SUPABASE_SERVICE_ROLE_KEY: PROD_SERVICE_JWT,
      }),
    ],
    [
      'loopback with a hosted-project key claim',
      dbEnv(OWNED_LOCAL, {
        MIU_TEST_DB_URL: OWNED_LOCAL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: OTHER_PROJECT_JWT,
      }),
    ],
    [
      'loopback with a new-format secret key',
      dbEnv(OWNED_LOCAL, {
        MIU_TEST_DB_URL: OWNED_LOCAL,
        SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_synthetic',
      }),
    ],
  ])('refuses a %s target', (_label, env) => {
    expect(() => assertSafeTestDatabaseTarget(env)).toThrow(/Unsafe test environment/);
  });

  it('accepts only the harness mock sentinel', () => {
    expect(() => assertSafeTestDatabaseTarget(dbEnv(MOCK_SUPABASE_URL))).not.toThrow();
    expect(() =>
      assertSafeTestDatabaseTarget(
        dbEnv(OWNED_LOCAL, { MIU_TEST_DB_URL: OWNED_LOCAL, SUPABASE_SERVICE_ROLE_KEY: LOCAL_DEMO_JWT })
      )
    ).toThrow(/real-database tests are blocked/);
  });
});

describe('buildIsolatedTestEnv', () => {
  it('drops every inherited production credential and provider key', () => {
    const env = buildIsolatedTestEnv(maliciousInherited, undefined);

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(MOCK_SUPABASE_URL);
    expect(Object.values(env).join('\n')).not.toMatch(/xqysaylskffsfwunczbd|sk_live_|r8_|xkeysib/);
    for (const key of [
      'REPLICATE_API_TOKEN',
      'BREVO_API_KEY',
      'CLOUDFLARE_API_TOKEN',
      'ALLOW_PRODUCTION_TESTS',
    ]) {
      expect(env).not.toHaveProperty(key);
    }
    expect(env).toMatchObject({
      PATH: '/usr/bin',
      HOME: '/home/tester',
      TEST_PORT: '3456',
      ENV: 'test',
      NEXT_PUBLIC_ENV: 'test',
      PLAYWRIGHT_TEST: 'true',
      STRIPE_SECRET_KEY: 'sk_test_dummy_key',
      NEXT_PUBLIC_BASE_URL: 'https://myimageupscaler.com',
    });
    expect(() => assertSafeTestDatabaseTarget(env)).not.toThrow();
  });

  it.each([
    ['a production URL', { NEXT_PUBLIC_SUPABASE_URL: PROD_URL }],
    ['a production key claim', { SUPABASE_SERVICE_ROLE_KEY: PROD_SERVICE_JWT }],
    [
      'a production ref in any variable',
      { DATABASE_URL: 'postgres://db.xqysaylskffsfwunczbd.supabase.co' },
    ],
    ['a live Stripe key', { STRIPE_WEBHOOK_SECRET: 'sk_live_synthetic' }],
    ['a remote project URL', { NEXT_PUBLIC_SUPABASE_URL: 'https://test-project.supabase.co' }],
  ])(
    'fails closed when .env.test contains %s, even with ENV=test and an override',
    (_l, unsafe) => {
      expect(() =>
        buildIsolatedTestEnv(maliciousInherited, {
          ENV: 'test',
          ALLOW_PRODUCTION_TESTS: 'true',
          ...unsafe,
        })
      ).toThrow(/Unsafe test environment/);
    }
  );

  it('never lets .env.test override the forced test-mode flags', () => {
    const env = buildIsolatedTestEnv({}, { ENV: 'development', STRIPE_SECRET_KEY: 'sk_test_real' });
    expect(env.ENV).toBe('test');
    expect(env.STRIPE_SECRET_KEY).toBe('sk_test_dummy_key');
  });
});

describe('applyIsolatedTestEnv', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'miu-env-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('replaces the target environment in place', () => {
    const target: Record<string, string | undefined> = { ...maliciousInherited };
    applyIsolatedTestEnv(target, path.join(dir, '.env.test'));
    expect(target.SUPABASE_SERVICE_ROLE_KEY).not.toBe(PROD_SERVICE_JWT);
    expect(target).not.toHaveProperty('REPLICATE_API_TOKEN');
    expect(target.NEXT_PUBLIC_SUPABASE_URL).toBe(MOCK_SUPABASE_URL);
  });

  it('refuses an unsafe .env.test file before mutating anything', () => {
    const file = path.join(dir, '.env.test');
    writeFileSync(file, `NEXT_PUBLIC_SUPABASE_URL=${PROD_URL}\nENV=test\n`);
    const target: Record<string, string | undefined> = { PATH: '/usr/bin' };
    expect(() => applyIsolatedTestEnv(target, file)).toThrow(/Unsafe test environment/);
    expect(target).toEqual({ PATH: '/usr/bin' });
  });

  // The same CLI scripts/dev-test.sh runs right before `next dev`.
  const runServerGuard = (env: Record<string, string>, cwd = dir) =>
    spawnSync(
      path.resolve('node_modules/.bin/tsx'),
      [path.resolve('tests/helpers/test-env-isolation.ts')],
      {
        cwd,
        env: { PATH: process.env.PATH ?? '', HOME: dir, ...env },
        encoding: 'utf8',
      }
    );

  it('dev server entrypoint guard exits non-zero for production and Next-auto-loaded env files', () => {
    writeFileSync(path.join(dir, '.env.test'), `ENV=test\nNEXT_PUBLIC_SUPABASE_URL=${PROD_URL}\n`);
    const prod = runServerGuard({ ENV: 'test' });
    expect(prod.status).toBe(1);
    expect(prod.stderr).toMatch(/Unsafe test environment/);

    rmSync(path.join(dir, '.env.test'));
    writeFileSync(path.join(dir, '.env.local'), 'REPLICATE_API_TOKEN=r8_synthetic\n');
    const autoLoaded = runServerGuard({ NEXT_PUBLIC_SUPABASE_URL: MOCK_SUPABASE_URL });
    expect(autoLoaded.status).toBe(1);
    expect(autoLoaded.stderr).toMatch(/\.env\.local would be auto-loaded/);
  });

  // Exit status + no safety error; benign runtime warnings (e.g. Node 26 DEP0205) are allowed.
  it('dev server entrypoint guard passes the isolated mock environment', () => {
    const mock = runServerGuard(maliciousInherited);
    expect(mock.stderr).not.toMatch(/Unsafe test environment|refused/i);
    expect(mock.status).toBe(0);
  });
});

describe('destructive helpers refuse unsafe targets before any client exists', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  function stub(env: Record<string, string | undefined>) {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value ?? '');
  }

  it('cleanupOldTestUsers refuses production even with ENV=test and an override', async () => {
    stub({
      ...dbEnv(PROD_URL),
      SUPABASE_SERVICE_ROLE_KEY: PROD_SERVICE_JWT,
      MIU_TEST_DB_URL: PROD_URL,
    });
    await expect(cleanupOldTestUsers()).rejects.toThrow(/Unsafe test environment/);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('cleanupOldTestUsers does nothing against the mock-only target', async () => {
    stub({ ...dbEnv(MOCK_SUPABASE_URL), MIU_TEST_DB_URL: '' });
    await expect(cleanupOldTestUsers()).resolves.toBe(0);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('resetTestUser refuses production and the mock-only target', async () => {
    stub({ ...dbEnv(PROD_URL), MIU_TEST_DB_URL: '' });
    await expect(resetTestUser()).rejects.toThrow(/Unsafe test environment/);
    stub({ NEXT_PUBLIC_SUPABASE_URL: MOCK_SUPABASE_URL });
    await expect(resetTestUser()).rejects.toThrow(/Real-database test helpers are disabled/);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('TestDataManager refuses production outside test mode', () => {
    stub({ ...dbEnv(PROD_URL), ENV: 'development', MIU_TEST_DB_URL: '' });
    expect(() => new TestDataManager()).toThrow(/Unsafe test environment/);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});

describe('review blockers (2026-10-03)', () => {
  const DECLARED_LOOPBACK = { ...dbEnv(OWNED_LOCAL), MIU_TEST_DB_URL: OWNED_LOCAL };
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  function stub(env: Record<string, string | undefined>) {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value ?? '');
  }

  // Blocker 1: a self-declared loopback URL is not a provisioned, verified MIU test DB.
  it('keeps every real-database helper closed for a self-declared loopback target', async () => {
    expect(() => assertSafeTestDatabaseTarget(DECLARED_LOOPBACK)).toThrow(
      /Unsafe test environment/
    );
    stub(DECLARED_LOOPBACK);
    await expect(resetTestUser()).rejects.toThrow(/Real-database test helpers are disabled/);
    await expect(cleanupOldTestUsers()).rejects.toThrow(/Real-database test helpers are disabled/);
    stub({ ...DECLARED_LOOPBACK, ENV: 'development' });
    expect(() => new TestDataManager()).toThrow(/Real-database test helpers are disabled/);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  // Blockers 2 + 6: helpers build clients from the cached @shared/config/env snapshot.
  async function importWithCachedEnv(cached: Record<string, string | undefined>) {
    vi.resetModules();
    stub(cached);
    await import('@shared/config/env');
    vi.unstubAllEnvs();
    stub({ ...DECLARED_LOOPBACK });
    const [{ AccountCreationHarness }, { uploadUpscaleInput }] = await Promise.all([
      import('../../helpers/account-creation-e2e'),
      import('../../helpers/upscale-input'),
    ]);
    return { AccountCreationHarness, uploadUpscaleInput };
  }

  it.each([
    ['production', { ...dbEnv(PROD_URL), SUPABASE_SERVICE_ROLE_KEY: PROD_SERVICE_JWT }],
    ['the mock sentinel', dbEnv(MOCK_SUPABASE_URL)],
  ])(
    'refuses the cached %s client config before any request, even when process.env looks safe',
    async (_label, cached) => {
      const { AccountCreationHarness, uploadUpscaleInput } = await importWithCachedEnv(cached);
      const api = { post: vi.fn() };

      expect(() => new AccountCreationHarness()).toThrow(
        /Unsafe test environment|Real-database test helpers are disabled/
      );
      await expect(
        uploadUpscaleInput(api as never, { dataUrl: 'data:image/png;base64,AA==', mimeType: 'image/png' })
      ).rejects.toThrow(/Unsafe test environment|Real-database test helpers are disabled/);
      expect(api.post).not.toHaveBeenCalled();
      expect(mockCreateClient).not.toHaveBeenCalled();
    }
  );

  it('uploadUpscaleInput requests no upload grant when its storage client config is unsafe', async () => {
    const { uploadUpscaleInput } = await importWithCachedEnv({
      ...dbEnv(PROD_URL),
      SUPABASE_SERVICE_ROLE_KEY: PROD_SERVICE_JWT,
    });
    const api = { post: vi.fn().mockResolvedValue({ status: 500, raw: { ok: () => false }, json: async () => ({}) }) };
    await expect(
      uploadUpscaleInput(api as never, { dataUrl: 'data:image/png;base64,AA==', mimeType: 'image/png' })
    ).rejects.toThrow(/Unsafe test environment/);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('cached production config is reported as unsafe, not merely disabled', async () => {
    const { AccountCreationHarness } = await importWithCachedEnv({
      ...dbEnv(PROD_URL),
      SUPABASE_SERVICE_ROLE_KEY: PROD_SERVICE_JWT,
    });
    expect(() => new AccountCreationHarness()).toThrow(/Unsafe test environment/);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  // Blockers 3 + 5: explicit allowlists, no prefix or token-pattern trust.
  it('drops opaque provider/auth keys from .env.test and from inherited runner prefixes', () => {
    const env = buildIsolatedTestEnv(
      {
        PATH: '/usr/bin',
        TEST_WORKER_INDEX: '1',
        TEST_PARALLEL_INDEX: '0',
        TEST_AUTH_TOKEN: 'opaque-inherited-synthetic',
        PW_OPAQUE_TOKEN: 'opaque-inherited-synthetic',
        PLAYWRIGHT_SERVICE_ACCESS_TOKEN: 'opaque-inherited-synthetic',
        DEBUG_TOKEN: 'opaque-inherited-synthetic',
        LC_SECRET: 'opaque-inherited-synthetic',
        XDG_TOKEN: 'opaque-inherited-synthetic',
        MIU_TEST_ENV_ISOLATED: '1',
      },
      {
        NEXT_PUBLIC_APP_NAME: 'MyImageUpscaler',
        REPLICATE_API_TOKEN: 'opaque-file-synthetic',
        CLOUDFLARE_API_TOKEN: 'opaque-file-synthetic',
        GEMINI_API_KEY: 'opaque-file-synthetic',
        STRIPE_WEBHOOK_SECRET: 'opaque-file-synthetic',
        TEST_AUTH_TOKEN: 'opaque-file-synthetic',
        OPAQUE: 'opaque-file-synthetic',
      }
    );
    expect(Object.values(env).join('\n')).not.toMatch(/opaque-/);
    expect(env).toMatchObject({
      PATH: '/usr/bin',
      TEST_WORKER_INDEX: '1',
      TEST_PARALLEL_INDEX: '0',
      NEXT_PUBLIC_APP_NAME: 'MyImageUpscaler',
    });
  });

  // Blocker 4: Next.js must never auto-load an env file the guard did not sanitize.
  it('forces NODE_ENV=development so Next.js never selects the unsanitized .env.test', () => {
    expect(buildIsolatedTestEnv({ NODE_ENV: 'test' }, { NODE_ENV: 'test' }).NODE_ENV).toBe(
      'development'
    );
  });

  describe('dev:test launcher', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(path.join(tmpdir(), 'miu-launch-'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    // Runs the real installed @next/env loader inside the launched child, like `next dev` does.
    const probe = `const { loadEnvConfig } = require(${JSON.stringify(
      path.resolve('node_modules/@next/env')
    )}); const r = loadEnvConfig(process.cwd(), true, { info() {}, error() {} }); console.log('PROBE ' + JSON.stringify({ token: process.env.REPLICATE_API_TOKEN ?? null, inherited: process.env.CLOUDFLARE_API_TOKEN ?? null, nodeEnv: process.env.NODE_ENV, loaded: r.loadedEnvFiles.map(f => f.path) }));`;
    const launch = (inherited: Record<string, string>) =>
      spawnSync(
        path.resolve('node_modules/.bin/tsx'),
        [path.resolve('tests/helpers/test-env-isolation.ts'), process.execPath, '-e', probe],
        {
          cwd: dir,
          env: { PATH: process.env.PATH ?? '', HOME: dir, ...inherited },
          encoding: 'utf8',
        }
      );
    const probed = (stdout: string) => {
      const line = stdout.split('\n').find(l => l.startsWith('PROBE '));
      return line ? JSON.parse(line.slice(6)) : null;
    };

    it('launches the app command only inside the sanitized environment', () => {
      writeFileSync(
        path.join(dir, '.env.test'),
        'NODE_ENV=test\nREPLICATE_API_TOKEN=opaque-file-synthetic\n'
      );
      const run = launch({
        MIU_TEST_ENV_ISOLATED: '1',
        CLOUDFLARE_API_TOKEN: 'opaque-inherited-synthetic',
        NODE_ENV: 'test',
      });
      expect(run.status).toBe(0);
      expect(probed(run.stdout)).toEqual({
        token: null,
        inherited: null,
        nodeEnv: 'development',
        loaded: [],
      });
    });

    it('scripts/dev-test.sh never sources .env.test and guards before cleanup and launch', () => {
      const script = readFileSync(path.resolve('scripts/dev-test.sh'), 'utf8');
      expect(script).not.toMatch(/^\s*(source|\.)\s/m);
      expect(script).not.toContain('MIU_TEST_ENV_ISOLATED');
      const guard = script.indexOf('if ! $ISOLATE; then');
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(script.indexOf('rm -'));
      expect(script).toMatch(/^exec \$ISOLATE npx next dev /m);
      expect(script).toMatch(/^exec \$ISOLATE npx next dev --webpack /m);
      expect(script.match(/next dev/g)).toHaveLength(1);
    });

    it('refuses before launch when a Next.js auto-loaded file such as .env.test.local exists', () => {
      writeFileSync(path.join(dir, '.env.test.local'), 'REPLICATE_API_TOKEN=opaque-file-synthetic\n');
      const run = launch({ NODE_ENV: 'test' });
      expect(run.status).toBe(1);
      expect(run.stderr).toMatch(/\.env\.test\.local would be auto-loaded/);
      expect(probed(run.stdout)).toBeNull();
    });
  });
});
