# PRD: Quality Tier Custom Prompts

**Complexity: 2 → LOW mode**

## 1. Context

**Problem:** Quality tiers use hardcoded model-default prompts. There's no way to define a tier-specific prompt that overrides the model default while still allowing user custom instructions to take top priority.

**Files Analyzed:**

- `shared/types/coreflow.types.ts` — `QUALITY_TIER_CONFIG`, `IAdditionalOptions`
- `server/services/replicate/utils/prompt.builder.ts` — `PromptBuilder`, `DEFAULT_PROMPTS`
- `server/services/replicate/builders/model-input.types.ts` — `IModelInputContext`, `createModelInputContext`
- `server/services/image-generation.service.ts` — Gemini `generatePrompt()`
- `client/utils/prompt-utils.ts` — client-side `generatePrompt()`

**Current Behavior:**

- User custom instructions (`customInstructions`) fully override all prompt logic
- Without custom instructions, prompts fall back to hardcoded `DEFAULT_PROMPTS` per model ID
- No intermediate layer exists between "user wrote something" and "model default"
- `QUALITY_TIER_CONFIG` has `useCases: string[]` for gallery search, but no prompt data

## 2. Solution

**Approach:**

- Add an optional `customPrompt?: string` field to `QUALITY_TIER_CONFIG`
- Wire it through the prompt pipeline as an intermediate priority: **User customInstructions > Tier customPrompt > Model default**
- The tier prompt acts as a `basePrompt` override — enhancement modifiers (faces, text, clarity, etc.) still get appended
- No tiers are populated with custom prompts yet — this is infrastructure only

**Priority Chain:**

```
1. User customInstructions  → return as-is (no modifiers, full override)
2. Tier customPrompt        → use as base prompt + apply modifiers
3. Model DEFAULT_PROMPTS    → use as base prompt + apply modifiers (current behavior)
```

**Key Decisions:**

- `customPrompt` is optional and `undefined` for all tiers initially — zero behavior change
- Tier prompt replaces the model default but still receives enhancement suffixes (enhanceFaces, preserveText, etc.)
- On the client side (Gemini prompt), tier prompt replaces the hardcoded switch/case logic when present

**Data Changes:** None — purely additive type change.

**Integration Points:**

- [x] Entry point: `QUALITY_TIER_CONFIG` in `coreflow.types.ts` (already exists, adding field)
- [x] Caller: `createModelInputContext()` reads tier config and passes `tierPrompt` downstream
- [x] Wiring: `PromptBuilder.build()` checks `tierPrompt` before model default
- [x] Not user-facing: no UI changes needed (tiers ARE the UI, and the field is just a config property)

## 3. Execution Phases

### Phase 1: Add type + wire through prompt pipeline

**Files (5):**

- `shared/types/coreflow.types.ts` — add `customPrompt?: string` to tier config type
- `server/services/replicate/utils/prompt.builder.ts` — add `tierPrompt` to `IPromptBuildContext`, use in priority chain
- `server/services/replicate/builders/model-input.types.ts` — add `tierPrompt` to `IModelInputContext`, populate from `QUALITY_TIER_CONFIG`
- `server/services/image-generation.service.ts` — check tier `customPrompt` before building default Gemini prompt
- `client/utils/prompt-utils.ts` — check tier `customPrompt` before hardcoded prompt logic

**Implementation:**

- [ ] **`coreflow.types.ts`**: Add `customPrompt?: string` to the config record type (alongside `label`, `credits`, `modelId`, etc.)
- [ ] **`prompt.builder.ts`**: Add `tierPrompt?: string` to `IPromptBuildContext`. In `build()`, change base prompt resolution: `options.basePrompt ?? tierPrompt ?? this.getDefaultPrompt(modelId, context)`
- [ ] **`model-input.types.ts`**: Add `tierPrompt?: string` to `IModelInputContext`. In `createModelInputContext()`, look up `QUALITY_TIER_CONFIG[config.qualityTier]?.customPrompt` and pass it through
- [ ] **`image-generation.service.ts`**: In `generatePrompt()`, after the customInstructions check, add: if tier has `customPrompt`, return it (with constraint segments appended)
- [ ] **`prompt-utils.ts`** (client): After the customInstructions check, add: if `QUALITY_TIER_CONFIG[config.qualityTier].customPrompt` exists, return it

**Tests Required:**

| Test File                                | Test Name                                                         | Assertion                                         |
| ---------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| `tests/unit/prompt-builder.unit.spec.ts` | `should use tier customPrompt when no user instructions provided` | Tier prompt used as base, modifiers appended      |
| `tests/unit/prompt-builder.unit.spec.ts` | `should prefer user customInstructions over tier customPrompt`    | User instructions returned, tier prompt ignored   |
| `tests/unit/prompt-builder.unit.spec.ts` | `should fall back to model default when tier has no customPrompt` | Existing behavior unchanged                       |
| `tests/unit/prompt-builder.unit.spec.ts` | `should apply enhancement modifiers to tier customPrompt`         | enhanceFaces/preserveText appended to tier prompt |

**Verification Plan:**

1. **Unit Tests:**
   - File: `tests/unit/prompt-builder.unit.spec.ts`
   - Full priority chain coverage (user > tier > default)
   - Modifier application on tier prompts

2. **Evidence Required:**
   - [ ] All tests pass (`yarn test`)
   - [ ] `yarn verify` passes
   - [ ] No existing tests break (zero behavior change for unpopulated tiers)

## 4. Acceptance Criteria

- [ ] `customPrompt?: string` exists in `QUALITY_TIER_CONFIG` type
- [ ] All existing tiers have `customPrompt: undefined` (or omitted) — no behavior change
- [ ] Prompt priority chain works: user instructions > tier customPrompt > model default
- [ ] Tier customPrompt receives enhancement modifiers (not a raw override like user instructions)
- [ ] All tests pass, `yarn verify` passes
