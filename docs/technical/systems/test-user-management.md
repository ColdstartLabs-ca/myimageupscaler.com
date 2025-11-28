# Test User Management System

## Problem

The test suite was creating **254 new user profiles in 24 hours**, polluting the Supabase database with test data. Every test run created unique users with timestamps:

```typescript
`test-${Date.now()}-${Math.random().toString(36).substring(7)}@test.local`;
```

## Solution

### 1. Fixed Test User Pattern

Instead of creating new users for every test, use a **single fixed test user** that gets reset before each test:

```typescript
const FIXED_TEST_USER = {
  email: 'fixed-test-user@pixelperfect.test',
  password: 'TestPassword123!SecureForTests',
};
```

### 2. Reset Function

The `resetTestUser()` function in `/tests/helpers/test-user-reset.ts`:

- Creates the fixed user if it doesn't exist
- Resets credits to 10 (default starting amount)
- Clears subscription status
- Deletes processing jobs and subscriptions
- Returns fresh auth token

### 3. Usage in Tests

**Before (creates new user every time):**

```typescript
beforeEach(async () => {
  const testUser = await dataManager.createTestUser(); // ❌ Creates new user
  testUserId = testUser.id;
});
```

**After (reuses same user):**

```typescript
import { resetTestUser } from '../helpers/test-user-reset';

beforeEach(async () => {
  const testUser = await resetTestUser(); // ✅ Resets existing user
  testUserId = testUser.id;
});
```

### 4. Cleanup Old Test Users

Run the cleanup script to remove the 254 polluted test accounts:

```bash
tsx scripts/cleanup-test-users.ts
```

This will:

- Delete all users matching pattern `*@test.local`
- Keep the fixed test user `fixed-test-user@pixelperfect.test`
- Avoid rate limiting with delays between deletions

## Migration Plan

1. **Run cleanup script first:**

   ```bash
   tsx scripts/cleanup-test-users.ts
   ```

2. **Update test files to use resetTestUser:**

   - Replace `dataManager.createTestUser()` with `resetTestUser()`
   - Remove `dataManager.cleanupUser()` calls in `afterEach` (not needed anymore)

3. **Benefits:**
   - ✅ No database pollution
   - ✅ Faster test execution (no user creation overhead)
   - ✅ Consistent test state
   - ✅ Easier to debug (same user ID every time)

## Files Modified

- ✅ Created `/tests/helpers/test-user-reset.ts` - Reset utility
- ✅ Created `/scripts/cleanup-test-users.ts` - Cleanup script
- ⏳ TODO: Update test files to use new pattern

## Current Test Files to Update

1. `/tests/integration/credit-management.test.ts` - 13 test cases
2. `/tests/api/checkout.test.ts` - 15+ test cases

## Note

The old `TestDataManager` class can remain for tests that specifically need multiple users or complex scenarios, but 95% of tests should use the simpler `resetTestUser()` approach.
