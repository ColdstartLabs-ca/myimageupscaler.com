/**
 * The one real database the harness may use: the disposable local Supabase that
 * `scripts/test-db.sh up` starts (project `miu-test`, schema-only copy of production).
 *
 * A URL or flag in the environment cannot prove a database is the test database, so
 * `isOwnedTestDatabaseRunning` asks Docker: the kong container of exactly this project
 * must be running and publishing exactly this port. A production or remote URL can never
 * satisfy that, and the keys below are the public Supabase local-development demo keys,
 * which grant nothing outside that container.
 */
import { spawnSync } from 'node:child_process';

export const TEST_DB_PROJECT_ID = 'miu-test';
export const TEST_DB_API_PORT = 55421;
export const TEST_DB_URL = `http://127.0.0.1:${TEST_DB_API_PORT}`;

// Supabase CLI local-development defaults (iss "supabase-demo", no project ref), valid until 2033.
export const TEST_DB_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
export const TEST_DB_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export const TEST_DB_DEFAULTS = {
  NEXT_PUBLIC_SUPABASE_URL: TEST_DB_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: TEST_DB_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: TEST_DB_SERVICE_ROLE_KEY,
};

/** True only when every non-empty key is one of the demo keys (never a production credential). */
export function areTestDatabaseKeys(keys: Array<string | undefined>): boolean {
  return keys.every(key => !key || key === TEST_DB_ANON_KEY || key === TEST_DB_SERVICE_ROLE_KEY);
}

/** Asks Docker whether this project's kong container is running and publishes the API port. */
export function isOwnedTestDatabaseRunning(): boolean {
  const result = spawnSync(
    'docker',
    [
      'ps',
      '--filter',
      `name=^supabase_kong_${TEST_DB_PROJECT_ID}$`,
      '--filter',
      'status=running',
      '--format',
      '{{.Names}} {{.Ports}}',
    ],
    { encoding: 'utf8', timeout: 5000 }
  );
  if (result.status !== 0 || typeof result.stdout !== 'string') return false;
  return (
    result.stdout.includes(`supabase_kong_${TEST_DB_PROJECT_ID} `) &&
    result.stdout.includes(`:${TEST_DB_API_PORT}->8000/tcp`)
  );
}
