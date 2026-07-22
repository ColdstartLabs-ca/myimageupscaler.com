import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateClient, mockDeleteUser, mockFrom, mockListUsers } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockDeleteUser: vi.fn(),
  mockFrom: vi.fn(),
  mockListUsers: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

import { cleanupOldTestUsers } from '../../helpers/test-user-reset';

describe('cleanupOldTestUsers', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test-project.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('deletes free-credit records before deleting each throwaway test user', async () => {
    const calls: string[] = [];
    const testUser = { id: 'test-user-id', email: 'account-creation-e2e@test.local' };
    const deletedTables = new Map<string, ReturnType<typeof vi.fn>>();

    mockListUsers.mockResolvedValue({ data: { users: [testUser] } });
    mockFrom.mockImplementation((table: string) => {
      const eq = vi.fn().mockImplementation(() => {
        calls.push(table);
        return Promise.resolve({ error: null });
      });
      deletedTables.set(table, eq);
      return { delete: vi.fn(() => ({ eq })) };
    });
    mockDeleteUser.mockImplementation(async () => {
      calls.push('auth.users');
      return { error: null };
    });
    mockCreateClient.mockReturnValue({
      auth: { admin: { listUsers: mockListUsers, deleteUser: mockDeleteUser } },
      from: mockFrom,
    });

    await expect(cleanupOldTestUsers()).resolves.toBe(1);

    expect(deletedTables.get('free_credit_grants')).toHaveBeenCalledWith('user_id', testUser.id);
    expect(deletedTables.get('credit_transactions')).toHaveBeenCalledWith('user_id', testUser.id);
    expect(mockDeleteUser).toHaveBeenCalledWith(testUser.id);
    expect(calls).toEqual(['free_credit_grants', 'credit_transactions', 'auth.users']);
  });
});
