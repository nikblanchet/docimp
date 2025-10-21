# Manual Test Plan: Prompt Wording Options to Prevent Markdown Responses

**Issue:** #234
**Related Bug:** #231
**Branch:** `issue-234-test-prompt-wordings`

## Objective

Test three prompt wording options to determine which most effectively prevents Claude from wrapping docstring responses in markdown code fences.

## Three Prompt Wording Options

### Option A: Explicit Instruction About Code Fences

```python
"5. IMPORTANT: Return the raw docstring text only. Do NOT wrap your entire response in markdown code fences (```python, ```javascript, etc.)",
"6. Code examples WITHIN the docstring are fine and encouraged - just don't wrap the whole docstring in backticks"
```

**Strategy:** Direct prohibition of markdown wrappers
**Risk:** Might be too specific, could confuse about internal code examples

### Option B: Output Format Focused

```python
"5. Your response will be inserted directly into the source file as-is",
"6. Return only the documentation text that should appear in the file (e.g., triple-quoted string for Python, JSDoc comment for JavaScript)"
```

**Strategy:** Explain the context and purpose
**Risk:** Less explicit, relies on Claude understanding intent

### Option C: Example-Based (Show Correct Format)

```python
"5. Response format - return ONLY the docstring content:",
"   Python: \"\"\"Your documentation here\"\"\"",
"   JavaScript/TypeScript: /** Your documentation here */",
"6. Do NOT wrap your response in markdown code blocks like ```python or ```javascript"
```

**Strategy:** Show expected output format with examples
**Risk:** More verbose, language-specific

## Test Matrix

### Functions to Test (Minimum 8-10 per wording option)

#### Python Files (`test-samples/example-project/src/python/`)

| File | Function | Complexity | Current State | Why Test |
|------|----------|------------|---------------|----------|
| `calculator.py` | `multiply` | Simple | No docs | Simple case baseline |
| `calculator.py` | `power` | Complex | Previously broken | Complex with examples |
| `validator.py` | `validate_username` | Medium | Previously broken | Medium complexity |
| `validator.py` | `sanitize_input` | Simple | No docs | Simple case |

#### JavaScript Files (`test-samples/example-project/src/javascript/`)

| File | Function | Complexity | Current State | Why Test |
|------|----------|------------|---------------|----------|
| `helpers.cjs` | `clone` | Simple | Minimal docs | Simple case |
| `helpers.cjs` | `merge` | Complex | Previously broken | Complex recursive |
| `helpers.cjs` | `generateRandomString` | Simple | No docs | Simple case |
| `api.js` | `post` | Medium | Minimal docs | Async function |

#### TypeScript Files (`test-samples/example-project/src/typescript/`)

| File | Function | Complexity | Current State | Why Test |
|------|----------|------------|---------------|----------|
| `service.ts` | `createUser` | Medium | No docs | Async method |
| `service.ts` | `deleteUser` | Simple | No docs | Simple async |
| `service.ts` | `validateUser` | Medium | Previously broken | Previously damaged |

## Test Procedure

### Setup (One-time per wording option)

1. **Verify clean state:**
   ```bash
   cd test-samples/example-project
   git status  # Should be clean
   ```

2. **Set API key:**
   ```bash
   export ANTHROPIC_API_KEY=your-key-here
   ```

3. **Choose wording option** (A, B, or C)

4. **Update PromptBuilder:**
   - Edit `analyzer/src/claude/prompt_builder.py`
   - Modify lines 267-327 to add the chosen wording
   - See `PROMPT_MODIFICATIONS.md` for exact changes

### Testing Loop (For each function)

1. **Run workflow:**
   ```bash
   cd test-samples/example-project
   docimp analyze .
   docimp plan .
   docimp improve .
   ```

2. **Navigate to target function** and press `A` to accept

3. **Record observation immediately** in results table

4. **Check file syntax:**
   ```bash
   # Python
   python -m py_compile src/python/calculator.py

   # JavaScript/TypeScript
   npx tsc --noEmit
   ```

5. **Inspect docstring visually** - Look for markdown code fences

### After Testing All Functions for One Wording

1. **Commit results:**
   ```bash
   git add test-samples/RESULTS_OPTION_A.md  # or B/C
   git commit -m "test: results for prompt wording option A"
   ```

2. **Restore files for next round:**
   ```bash
   git restore src/
   ```

3. **Move to next wording option**

## Results Template

Create separate files for each option: `RESULTS_OPTION_A.md`, `RESULTS_OPTION_B.md`, `RESULTS_OPTION_C.md`

```markdown
# Results: Option A - Explicit Code Fence Prohibition

**Tester:** [Your name]
**Date:** [YYYY-MM-DD]
**API Model:** claude-sonnet-4-5-20250929

## Summary

- Total functions tested: X
- Clean responses (no markdown): X
- Markdown-wrapped responses: X
- Syntax errors: X
- Success rate: X%

## Detailed Results

| Language | File | Function | Has Markdown? | Syntax Valid? | Has Code Example? | Notes |
|----------|------|----------|---------------|---------------|-------------------|-------|
| Python | calculator.py | multiply | No | Yes | No | Clean, simple |
| Python | calculator.py | power | No | Yes | Yes | Includes example, no wrapper |
| ... | ... | ... | ... | ... | ... | ... |

## Notable Observations

[Free-form notes about patterns, edge cases, or issues]

## Recommendation

[Should this wording be adopted? Why or why not?]
```

## Success Criteria

A wording option is successful if:

- **Zero** markdown code fences wrapping entire responses (across all 8-10 tests)
- Files remain syntactically valid after insertion
- Code examples within docstrings are preserved
- Works consistently across all three languages

## Decision Making

After testing all three options:

1. **Compare success rates** - Which had fewest markdown wrappers?
2. **Check consistency** - Which worked across all languages?
3. **Evaluate readability** - Which produces best docstrings?
4. **Consider edge cases** - Which handled complex functions with examples best?

## Next Steps After Testing

1. **Document results** in issue #234
2. **Choose winning option** based on criteria above
3. **Update issue #232** with chosen wording
4. **Implement in PromptBuilder** (if not already done during testing)
5. **Add automated tests** (issue #235)
6. **Decide on defensive parser** (issue #233) - only if no option works well

## Notes

- Take your time - quality data is more valuable than speed
- Record ALL observations, even unexpected ones
- If you see ANY markdown wrappers, that option likely fails
- Document any cases where Claude includes helpful code examples (this is GOOD)
