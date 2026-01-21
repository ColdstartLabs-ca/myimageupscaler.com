# Test Coverage Gap Finder Skill

Find test coverage gaps in the codebase and spawn parallel agents to write missing tests.

## Overview

This skill orchestrates test coverage improvement by:
1. Analyzing the codebase to find files without tests
2. Identifying critical services, components, and utilities lacking coverage
3. Spawning multiple agents in parallel to write tests for each gap

## Workflow

### Phase 1: Analyze Coverage Gaps

Run the coverage analysis first:

```bash
# Generate coverage report
yarn test:coverage --reporter=json --outputFile=coverage/coverage-summary.json

# Or if that fails, analyze structure directly
```

Then identify gaps by category:

#### Server Services (Priority: High)

```bash
# Find services without tests
find server/services -name "*.ts" -not -name "*.test.ts" -not -name "*.spec.ts" -not -path "*/__tests__/*" | while read f; do
  base=$(basename "$f" .ts)
  # Check for corresponding test file
  if ! find tests/unit/server/services -name "*${base}*" 2>/dev/null | grep -q .; then
    echo "MISSING: $f"
  fi
done
```

#### API Routes (Priority: High)

```bash
# Find API routes without tests
find app/api -name "route.ts" | while read f; do
  route_dir=$(dirname "$f" | sed 's|app/api/||' | tr '/' '-')
  if ! find tests/api -name "*${route_dir}*" 2>/dev/null | grep -q .; then
    echo "MISSING: $f"
  fi
done
```

#### Client Components (Priority: Medium)

```bash
# Find complex components without tests (over 50 lines)
find client/components -name "*.tsx" -not -name "*.test.tsx" | while read f; do
  lines=$(wc -l < "$f")
  if [ "$lines" -gt 50 ]; then
    base=$(basename "$f" .tsx)
    if ! find client/components -path "*/__tests__/*" -name "*${base}*" 2>/dev/null | grep -q .; then
      echo "MISSING ($lines lines): $f"
    fi
  fi
done
```

#### Shared Utilities (Priority: Medium)

```bash
# Find utilities without tests
find shared -name "*.ts" -not -name "*.test.ts" -not -name "*.d.ts" -not -name "types.ts" | while read f; do
  base=$(basename "$f" .ts)
  if ! find tests/unit -name "*${base}*" 2>/dev/null | grep -q .; then
    echo "MISSING: $f"
  fi
done
```

### Phase 2: Prioritize Gaps

Categorize findings into priorities:

| Priority | Category | Criteria |
|----------|----------|----------|
| **Critical** | Payment/Auth | Stripe webhooks, auth handlers, credit operations |
| **High** | Server Services | Business logic, data processing, external APIs |
| **High** | API Routes | User-facing endpoints, validation logic |
| **Medium** | Components | Complex interactive components, forms |
| **Medium** | Utilities | Shared utilities with complex logic |
| **Low** | Simple Utils | Type definitions, constants, simple wrappers |

### Phase 3: Spawn Agents in Parallel

Use the Task tool to spawn multiple agents **in a single message** for parallel execution.

**CRITICAL**: Call multiple Task tools in the same response to run agents in parallel.

---

## Agent Templates

### Unit Test Agent (for services/utilities)

Use subagent_type: `general-purpose`

**Prompt template:**

```
## Task: Write Unit Tests for [SERVICE_NAME]

**Target File**: [FILE_PATH]
**Test Output**: tests/unit/server/services/[service-name].unit.spec.ts

### Instructions

1. Read the skill file: .claude/skills/unit-testing/SKILL.md
2. Read the target file to understand its functionality
3. Write comprehensive unit tests following the skill patterns:
   - Mock all external dependencies (Supabase, Stripe, external APIs)
   - Use dynamic imports after mocking
   - Test happy paths AND error cases
   - Use AAA pattern (Arrange, Act, Assert)
   - Clear mocks in beforeEach/afterEach

### Test Coverage Requirements
- All exported functions
- All error conditions
- Edge cases (empty inputs, nulls, boundaries)
- Mock failures for external dependencies

### Verification
After writing tests, run:
yarn test:unit tests/unit/server/services/[service-name].unit.spec.ts

Fix any failures before completing.
```

### API Test Agent (for routes)

Use subagent_type: `general-purpose`

**Prompt template:**

```
## Task: Write API Tests for [ROUTE_NAME]

**Target Route**: [ROUTE_PATH]
**Test Output**: tests/api/[route-name].api.spec.ts

### Instructions

1. Read the skill file: .claude/skills/api-testing/SKILL.md
2. Read the target route handler to understand endpoints
3. Write comprehensive API tests following the skill patterns:
   - Use ApiClient fluent assertions
   - Use TestContext for user factory
   - Test authentication/authorization
   - Test validation errors
   - Test rate limiting if applicable

### Test Coverage Requirements
- All HTTP methods (GET, POST, etc.)
- Authentication: unauthorized, wrong user, correct user
- Validation: missing fields, invalid formats
- Business logic: success cases, edge cases
- Error handling: 4xx and 5xx responses

### Verification
After writing tests, run:
yarn test:api tests/api/[route-name].api.spec.ts

Fix any failures before completing.
```

### Component Test Agent (for React components)

Use subagent_type: `general-purpose`

**Prompt template:**

```
## Task: Write Component Tests for [COMPONENT_NAME]

**Target Component**: [FILE_PATH]
**Test Output**: client/components/[path]/__tests__/[ComponentName].test.tsx

### Instructions

1. Read the skill file: .claude/skills/unit-testing/SKILL.md
2. Read the target component to understand its behavior
3. Write comprehensive component tests using React Testing Library:
   - Test rendering with different props
   - Test user interactions (clicks, typing)
   - Test loading/error states
   - Test accessibility (ARIA attributes)

### Test Coverage Requirements
- Default rendering
- All prop variations
- User interactions
- Error boundaries if applicable
- Accessibility checks

### Verification
After writing tests, run:
yarn test:unit [test-file-path]

Fix any failures before completing.
```

### E2E Test Agent (for user flows)

Use subagent_type: `e2e-test-writer`

**Prompt template:**

```
## Task: Write E2E Tests for [FEATURE_NAME]

**Feature**: [DESCRIPTION]
**Test Output**: tests/e2e/[feature-name].e2e.spec.ts

### Instructions

1. Read the skill file: .claude/skills/e2e-testing/SKILL.md
2. Create page objects if needed following BasePage pattern
3. Write E2E tests covering the user flow:
   - Use role-based selectors
   - Include accessibility checks
   - Test on multiple viewport sizes
   - Handle loading states properly

### Verification
After writing tests, run:
yarn test:e2e tests/e2e/[feature-name].e2e.spec.ts

Fix any failures before completing.
```

---

## Example: Full Coverage Gap Resolution

### Step 1: Identify Gaps

```bash
# Run gap analysis
find server/services -name "*.ts" -not -name "*.test.ts" -not -path "*/__tests__/*" -type f
```

Output:
```
server/services/replicate.service.ts
server/services/llm-image-analyzer.ts
server/services/openrouter.service.ts
```

### Step 2: Check Existing Tests

```bash
ls tests/unit/server/services/
```

Output:
```
replicate.service.test.ts  # Exists
# llm-image-analyzer - MISSING
# openrouter.service - MISSING
```

### Step 3: Spawn Parallel Agents

Call multiple Task tools in a **single message** to run them in parallel:

**Agent 1**: Write tests for llm-image-analyzer.ts
**Agent 2**: Write tests for openrouter.service.ts

Both agents run concurrently, significantly reducing total time.

---

## Best Practices

### Parallel Agent Guidelines

1. **Group by independence**: Only parallelize agents that don't depend on each other
2. **Limit parallelism**: Spawn 3-5 agents max at once to avoid overwhelming the system
3. **Batch by priority**: Run Critical gaps first, then High, then Medium
4. **Monitor progress**: Use TodoWrite to track which gaps are being addressed

### Gap Analysis Tips

1. **Focus on business logic**: Prioritize services with complex logic over simple wrappers
2. **Check recent changes**: Files changed recently may need updated tests
3. **Coverage thresholds**: Target 80%+ coverage for critical paths
4. **Skip generated files**: Ignore types.ts, index.ts re-exports, etc.

### Quality Checks

After all agents complete:

1. Run full test suite: `yarn test`
2. Check coverage: `yarn test:coverage`
3. Verify no regressions: `yarn verify`

---

## Quick Reference Commands

```bash
# Generate coverage report
yarn test:coverage

# Run all unit tests
yarn test:unit

# Run all API tests
yarn test:api

# Run all E2E tests
yarn test:e2e

# Full verification
yarn verify

# Find untested services
find server/services -name "*.ts" -not -name "*.test.ts" -not -path "*/__tests__/*" | head -20

# Find untested API routes
find app/api -name "route.ts" | wc -l

# Count existing tests
find tests -name "*.spec.ts" -o -name "*.test.ts" | wc -l
```

---

## Related Skills

- `.claude/skills/unit-testing/SKILL.md` - Unit test patterns
- `.claude/skills/api-testing/SKILL.md` - API test patterns
- `.claude/skills/e2e-testing/SKILL.md` - E2E test patterns
- `.claude/skills/test-fixing/SKILL.md` - Debugging failing tests
