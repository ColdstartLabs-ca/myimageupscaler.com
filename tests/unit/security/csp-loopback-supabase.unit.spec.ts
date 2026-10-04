import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseUrl = vi.hoisted(() => ({ value: 'https://abcdefghijklmnopqrst.supabase.co' }));
vi.mock('@shared/config/env', () => ({
  clientEnv: {
    get SUPABASE_URL() {
      return supabaseUrl.value;
    },
  },
  isDevelopment: () => false,
}));

import { buildCspHeader } from '@shared/config/security';

const connectSrc = () =>
  buildCspHeader()
    .match(/connect-src ([^;]*)/)![1]
    .split(' ');

describe('CSP connect-src and a loopback Supabase', () => {
  beforeEach(() => {
    supabaseUrl.value = 'https://abcdefghijklmnopqrst.supabase.co';
  });
  afterEach(() => vi.clearAllMocks());

  it('adds only the configured http loopback origin (the disposable test database)', () => {
    supabaseUrl.value = 'http://127.0.0.1:55421';
    expect(connectSrc()).toContain('http://127.0.0.1:55421');
    supabaseUrl.value = 'http://localhost:55421';
    expect(connectSrc()).toContain('http://localhost:55421');
  });

  it.each([
    ['a hosted project', 'https://abcdefghijklmnopqrst.supabase.co'],
    ['https loopback', 'https://127.0.0.1:55421'],
    ['a remote http host', 'http://db.example.com:55421'],
    ['a malformed value', 'not a url'],
  ])('leaves production-shaped output unchanged for %s', (_label, value) => {
    const baseline = buildCspHeader();
    supabaseUrl.value = value;
    expect(buildCspHeader()).toBe(baseline);
    expect(connectSrc()).not.toContain(value);
  });

  it('only touches connect-src', () => {
    const before = buildCspHeader().replace(/connect-src [^;]*/, '');
    supabaseUrl.value = 'http://127.0.0.1:55421';
    expect(buildCspHeader().replace(/connect-src [^;]*/, '')).toBe(before);
  });
});
