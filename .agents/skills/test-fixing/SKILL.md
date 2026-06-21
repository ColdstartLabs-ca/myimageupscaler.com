# Test Fixing Methodology

## Overview

This skill provides a systematic approach to fixing failing tests by running tests in the background and spawning parallel workers to address failures in different areas.

## When to Use

Use this methodology when:

- A large number of tests are failing (>10)
- Failures span multiple test files or functional areas
- Tests can be logically grouped by file, module, or functionality

## The 4-Step Process

### Step 1: Run Tests and Capture Failures

```bash
# Run tests in background to capture all failures
yarn test 2>&1
```

Analyze the output to:

1. Count total failures
2. Identify affected test files
3. Group failures by logical area (file, module, functionality)

### Step 2: Create a Todo List

Track progress with todos for each area:

```typescript
TodoWriteTool({
  todos: [
    {
      content: 'Fix tests/api/upscale.api.spec.ts failures (13 tests)',
      status: 'in_progress',
      activeForm: 'Fixing upscale.api.spec.ts failures',
    },
    {
      content: 'Fix tests/api/webhooks.api.spec.ts failures (4 tests)',
      status: 'pending',
      activeForm: 'Fixing webhooks.api.spec.ts failures',
    },
    {
      content: 'Run full test suite to verify all fixes',
      status: 'pending',
      activeForm: 'Running full test suite',
    },
  ],
});
```

### Step 3: Spawn Parallel Workers

Use the `bug-hunter` subagent type for each failure area. Launch all workers in a **single message** for maximum parallelism:

```typescript
TaskTool({ subagent_type: 'bug-hunter', prompt: 'Fix area 1...', description: 'Fix area 1' });
TaskTool({ subagent_type: 'bug-hunter', prompt: 'Fix area 2...', description: 'Fix area 2' });
TaskTool({ subagent_type: 'bug-hunter', prompt: 'Fix area 3...', description: 'Fix area 3' });
```

### Step 4: Verify and Re-run

After all workers complete:

1. Update todo list to mark items completed
2. Run the full test suite again
3. If any failures remain, iterate

## Bug Hunter Prompt Template

When spawning workers, use this template for consistent results:

```
Fix the N failing tests in <test-file-path>:

[List each failing test with the specific error]

First read <test-file-path> to understand the test expectations, then read the relevant source code at <source-path> to identify the issues.

Root cause analysis:
- What is the common pattern across failures?
- Is it test data (wrong IDs, outdated payload format)?
- Is it implementation (validation logic, error handling)?
- Is it environment (test mode vs production behavior)?

Fix any bugs causing these failures. Run `yarn test <test-file-path>` after fixing to verify all tests pass.
```

## Common Root Causes

### 1. Outdated Test Data

- **Symptom**: Tests expecting specific values (price IDs, user IDs) that don't match current config
- **Fix**: Update test data to use actual values from configuration files

### 2. API Schema Mismatch

- **Symptom**: Tests returning 400 Bad Request with unexpected validation errors
- **Fix**: Update test payloads to match current API schema

### 3. Test Mode vs Production Behavior

- **Symptom**: Tests expecting 200/202 but getting 500 due to missing data
- **Fix**: Add `isTest()` checks in handlers to gracefully handle test mode

### 4. Image/Asset Validation

- **Symptom**: Tests failing due to minimum size requirements
- **Fix**: Create valid test assets (e.g., 64x64 PNG minimum for image APIs)

## Verification Checklist

After fixing tests:

- [ ] Run specific test file: `yarn test <test-file>`
- [ ] Run TypeScript check: `yarn tsc`
- [ ] Run linter: `yarn lint`
- [ ] Run full test suite: `yarn test`
- [ ] Run verify command: `yarn verify`

## Example: Fixing 23 Tests in Parallel

### Failures by Area:

- `upscale.api.spec.ts`: 13 tests (400 status errors)
- `webhooks.api.spec.ts`: 4 tests (500/expectation errors)
- `billing-workflow.api.spec.ts`: 6 tests (500 status errors)
- `middleware-security.api.spec.ts`: 1 test (400 status error)

### Worker Assignments:

1. **Worker 1** (upscale): Fix API schema mismatch - update test payloads from old config format to new quality-tier format
2. **Worker 2** (webhooks): Add `isTest()` graceful handling for unknown customers
3. **Worker 3** (billing): Update hardcoded price IDs to actual config values
4. **Worker 4** (middleware): Fix test payload structure to match validation schema

### Result:

- All 23 tests fixed
- Workers completed in parallel (faster than sequential)
- Each worker verified their own fixes before completion
- Full test suite passed: 196/196 API tests

## Key Principles

1. **Parallelize When Possible**: Launch all workers in a single message for maximum speed
2. **Logical Grouping**: Group by test file, module, or failure pattern
3. **Clear Prompts**: Provide specific file paths and error context to each worker
4. **Verify Before Completing**: Each worker should run tests for their area before reporting done
5. **Track Progress**: Use TodoWrite to show real-time status to the user
