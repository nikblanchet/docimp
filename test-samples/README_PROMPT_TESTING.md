# Prompt Wording Testing - Issue #234

This directory contains all the infrastructure needed to manually test three prompt
wording options to fix the markdown code fence bug (#231).

## Quick Start

```bash
# Set your API key
export ANTHROPIC_API_KEY=your-key-here

# Run the test script (interactive mode)
cd test-samples
./test-prompt-wordings.sh

# Or test a specific option
./test-prompt-wordings.sh A  # Test Option A only
```

## Files in This Directory

### Test Documentation

| File                             | Purpose                                                              |
| -------------------------------- | -------------------------------------------------------------------- |
| `MANUAL_TEST_PROMPT_WORDINGS.md` | Complete test plan with objectives, procedures, and success criteria |
| `PROMPT_MODIFICATIONS.md`        | Detailed guide for modifying PromptBuilder with each wording option  |
| `README_PROMPT_TESTING.md`       | This file - overview and quick reference                             |

### Test Execution

| File                      | Purpose                                                             |
| ------------------------- | ------------------------------------------------------------------- |
| `test-prompt-wordings.sh` | Interactive test script that guides you through the testing process |

### Results Templates

| File                  | Purpose                                                         |
| --------------------- | --------------------------------------------------------------- |
| `RESULTS_OPTION_A.md` | Results tracking for Option A (Explicit Code Fence Prohibition) |
| `RESULTS_OPTION_B.md` | Results tracking for Option B (Output Format Focused)           |
| `RESULTS_OPTION_C.md` | Results tracking for Option C (Example-Based Format)            |

### Test Codebase

| Directory          | Purpose                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| `example-project/` | Sample codebase with Python, JavaScript, and TypeScript files for testing |

## The Three Prompt Wording Options

### Option A: Explicit Code Fence Prohibition

**Strategy:** Direct prohibition of markdown wrappers

````python
"5. IMPORTANT: Return the raw docstring text only. Do NOT wrap your entire response in markdown code fences (```python, ```javascript, etc.)",
"6. Code examples WITHIN the docstring are fine and encouraged - just don't wrap the whole docstring in backticks"
````

**Pros:** Very explicit, addresses the exact problem **Cons:** Might be too specific,
could confuse about internal code examples

### Option B: Output Format Focused

**Strategy:** Explain the context and purpose

```python
"5. Your response will be inserted directly into the source file as-is",
"6. Return only the documentation text that should appear in the file (e.g., triple-quoted string for Python, JSDoc comment for JavaScript)"
```

**Pros:** Explains the "why", helps Claude understand context **Cons:** Less explicit,
relies on Claude understanding intent

### Option C: Example-Based Format

**Strategy:** Show expected output format with examples

````python
"5. Response format - return ONLY the docstring content:",
"   Python: \"\"\"Your documentation here\"\"\"",
"   JavaScript/TypeScript: /** Your documentation here */",
"6. Do NOT wrap your response in markdown code blocks like ```python or ```javascript"
````

**Pros:** Shows exactly what's expected **Cons:** More verbose, language-specific
examples needed

## Testing Workflow

### 1. Prerequisites

```bash
# API key must be set
export ANTHROPIC_API_KEY=your-key-here

# Verify docimp is installed
docimp --version

# Check example project is clean
cd example-project
git status  # Should show "nothing to commit, working tree clean"
```

### 2. Test One Option

For each option (A, B, C):

1. **Modify PromptBuilder** - Follow `PROMPT_MODIFICATIONS.md`
2. **Run improve workflow** - Use the test script or manually run:
   ```bash
   cd example-project
   docimp analyze .
   docimp plan .
   docimp improve .
   ```
3. **Test 8-10 functions** - Cover Python, JavaScript, TypeScript
4. **Record observations** - Fill in the corresponding `RESULTS_OPTION_X.md`
5. **Check for markdown fences:**
   ````bash
   grep -r '```' src/ || echo "Clean!"
   ````
6. **Verify syntax:**
   ```bash
   python -m py_compile src/python/*.py
   cd src && npx tsc --noEmit
   ```
7. **Restore files** for next test:
   ```bash
   git restore src/
   ```

### 3. Compare and Decide

After testing all three options:

1. **Compare success rates** - Which had zero markdown wrappers?
2. **Check consistency** - Which worked across all languages?
3. **Review docstring quality** - Which produced best documentation?
4. **Consider edge cases** - Which handled code examples correctly?

### 4. Document Findings

1. Update issue #234 with test results
2. Choose winning option
3. Update issue #232 with chosen wording
4. Prepare for implementation

## Functions to Test (Minimum 8-10)

### Python (`example-project/src/python/`)

| File          | Function          | Why                                  |
| ------------- | ----------------- | ------------------------------------ |
| calculator.py | multiply          | Simple baseline                      |
| calculator.py | power             | Complex, previously broken           |
| validator.py  | validate_username | Medium complexity, previously broken |
| validator.py  | sanitize_input    | Simple, no current docs              |

### JavaScript (`example-project/src/javascript/`)

| File        | Function             | Why                                  |
| ----------- | -------------------- | ------------------------------------ |
| helpers.cjs | clone                | Simple case                          |
| helpers.cjs | merge                | Complex recursive, previously broken |
| helpers.cjs | generateRandomString | Simple, no docs                      |
| api.js      | post                 | Async function                       |

### TypeScript (`example-project/src/typescript/`)

| File       | Function     | Why               |
| ---------- | ------------ | ----------------- |
| service.ts | createUser   | Async method      |
| service.ts | deleteUser   | Simple async      |
| service.ts | validateUser | Previously broken |

## Success Criteria

An option passes if:

- ✓ **Zero** markdown code fences wrapping responses
- ✓ All files remain syntactically valid
- ✓ Code examples within docstrings are preserved
- ✓ Works consistently across all three languages

## Troubleshooting

### "ANTHROPIC_API_KEY not set"

```bash
export ANTHROPIC_API_KEY=your-key-here
```

### "docimp command not found"

```bash
cd ../cli
npm link
```

### "Example project has uncommitted changes"

```bash
cd example-project
git restore src/
```

### "Modifications didn't work"

1. Check you edited the correct file: `analyzer/src/claude/prompt_builder.py`
2. Verify you inserted after line 274
3. Check you updated numbering in language-specific sections
4. Test prompt generation with Python snippet in `PROMPT_MODIFICATIONS.md`

## After Testing

1. **Commit results** to branch `issue-234-test-prompt-wordings`:

   ```bash
   git add test-samples/RESULTS_*.md
   git commit -m "test: manual testing results for prompt wording options"
   ```

2. **Restore PromptBuilder** if you made temporary changes:

   ```bash
   mv analyzer/src/claude/prompt_builder.py.backup analyzer/src/claude/prompt_builder.py
   ```

3. **Document in issue #234** - Paste key findings and recommendation

4. **Update issue #232** - Specify which wording to implement

5. **Consider parser (#233)** - Only if no option worked perfectly

## Related Issues

- **#231** - Main bug (markdown code fences breaking files)
- **#232** - PromptBuilder update implementation
- **#233** - Defensive parser (if needed)
- **#234** - This manual testing task
- **#235** - Automated integration tests
- **#236** - Restore damaged files (completed)

## Questions?

If you encounter issues or need clarification, add comments to issue #234.
