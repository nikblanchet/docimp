# DocImp Test Samples

This directory contains test codebases for validating DocImp functionality.

## Purpose

These test samples enable:

1. **Repeatable testing** of complete DocImp workflows
2. **Manual validation** of features from Tasks 1-4
3. **Automated testing** via test-workflows.sh
4. **Known expected outcomes** for regression testing

## Directory Structure

```
test-samples/
├── example-project/         # Sample polyglot codebase
│   ├── src/                # Source files (Python, TypeScript, JavaScript)
│   ├── tests/              # Test files
│   └── node_modules/       # Should be ignored
├── expected-results.json   # Expected analysis outcomes
├── test-workflows.sh       # Automated validation script
└── README.md              # This file
```

## Example Project

The `example-project/` directory contains a realistic polyglot codebase with:

- **18-22 total items** across Python, TypeScript, and JavaScript
- **Varied documentation quality** (none, terrible, ok, good, excellent)
- **Varied complexity** (simple to complex, 1-15+ cyclomatic complexity)
- **Multiple module systems** (Python, ESM, CommonJS)

See `example-project/README.md` for details.

## Expected Results

The `expected-results.json` file documents:

- Expected item counts per language
- Expected coverage percentages
- Expected high-priority items (for workflow A)
- Sample audit ratings for consistent testing
- Expected plan items (for workflow B)

## Restoration

After running interactive commands that modify files (`docimp improve`), restore the
original state:

```bash
git restore test-samples/example-project/
```

This resets all files to their committed state, enabling repeated testing.

## Workflow Testing

### Workflow A: analyze → plan → improve

Test documentation prioritization based on complexity only (no audit):

```bash
cd test-samples/example-project/

# Clean state
rm -rf .docimp/

# Analyze
docimp analyze .
# Expected: ~18-22 items, coverage ~50-60%

# Plan
docimp plan .
# Expected: High-complexity undocumented items in plan

# Improve (optional)
docimp improve .
```

### Workflow B: analyze → audit → plan → improve

Test documentation prioritization with audit quality ratings:

```bash
cd test-samples/example-project/

# Clean state
rm -rf .docimp/

# Analyze
docimp analyze .

# Audit (rate items according to expected-results.json)
docimp audit .
# Rate items as specified in expected-results.json
# This ensures consistent testing across sessions

# Plan
docimp plan .
# Expected: Items rated 1-2 appear in plan
# Expected: Items rated 3-4 do NOT appear (above threshold)
# Expected: Impact scores differ from workflow A

# Improve (optional)
docimp improve .
```

## Deferred Manual Tests

These test samples enable completion of manual validation deferred from previous tasks:

### From Task 1: StateManager Directory Creation

```bash
cd test-samples/example-project/

# Test state directory creation
docimp analyze .
test -d .docimp/session-reports && echo "✓ State directory created"

# Test gitignore
git status | grep -v ".docimp" && echo "✓ State directory ignored by git"

# Verify structure
ls -la .docimp/session-reports/
```

### From Task 2: Auto-Clean Behavior

```bash
cd test-samples/example-project/

# Create old reports
docimp audit .
# (quit early with Q)
test -f .docimp/session-reports/audit.json && echo "✓ Old audit created"

# Run fresh analyze (auto-clean)
docimp analyze .
test ! -f .docimp/session-reports/audit.json && echo "✓ Old audit cleared"
test -f .docimp/session-reports/analyze-latest.json && echo "✓ New analysis saved"

# Test --keep-old-reports
docimp audit .
# (quit early)
docimp analyze . --keep-old-reports
test -f .docimp/session-reports/audit.json && echo "✓ Old audit preserved"
```

### From Task 3: Audit Ratings in Plan Workflow

```bash
cd test-samples/example-project/

# Test workflow: analyze → audit → plan
docimp analyze .
docimp audit .
# Rate items according to expected-results.json

docimp plan .

# Verify audit ratings are applied
cat .docimp/session-reports/plan.json | jq '.items[0].audit_rating'
# Should show actual rating (1, 2, 3, 4), not null

# Compare impact scores with and without audit
docimp analyze .
docimp plan .  # No audit
cat .docimp/session-reports/plan.json | jq '.items[0].impact_score'

docimp analyze .
docimp audit .
# (rate items)
docimp plan .  # With audit
cat .docimp/session-reports/plan.json | jq '.items[0].impact_score'
# Scores should differ
```

### From Task 4: Audit Summary Display

```bash
cd test-samples/example-project/

# Test full audit summary
docimp analyze .
docimp audit .
# Complete all ratings with variety (1s, 2s, 3s, 4s, skips)
# Verify complete summary with breakdown is displayed

# Test early quit summary
docimp analyze .
docimp audit .
# Rate only 5 items, then quit with Q
# Verify partial summary showing "5 / X items audited"
```

## Automated Testing

Run the automated test script to validate both workflows:

```bash
# From repository root
./test-samples/test-workflows.sh

# Or from test-samples directory
cd test-samples/
./test-workflows.sh
```

The script validates:

- **Workflow A** (analyze → plan) works correctly with complexity-only scoring
- **Workflow B** (analyze → audit → plan) works correctly with quality ratings applied
  - Creates audit.json fixture from expected-results.json
  - Converts relative paths to absolute paths for proper matching
  - Validates that audit ratings are applied (non-null in plan items)
  - Checks plan item count is approximately correct (~27 items)
  - Verifies at least 9 items have audit ratings
- Auto-clean prevents stale data
- --keep-old-reports flag works

### How Workflow B Automation Works

The Workflow B test creates a non-interactive audit fixture to simulate user ratings:

1. **Reads expected-results.json**: Contains sample audit ratings for specific items
2. **Converts to audit.json format**: Transforms ratings into the session report format
3. **Path normalization**: Converts relative paths to absolute paths (critical for
   matching with analysis results)
4. **Runs plan command**: Applies audit ratings to impact scores
5. **Validates results**: Checks that ratings are applied and plan item count is correct

This provides regression protection for the audit rating application feature without
requiring interactive user input.

## Testing Improve Command

The improve command is the primary user-facing feature of DocImp, but it requires manual
testing due to:

- Claude API interaction (requires ANTHROPIC_API_KEY)
- Interactive user input (A/E/R/S/Q choices)
- Actual file modifications

### Manual Testing Procedure

Run the documented manual testing procedure:

```bash
cd test-samples/

# Ensure API key is set
export ANTHROPIC_API_KEY=sk-ant-...

# Run manual test procedure
chmod +x test-workflows-improve.sh
./test-workflows-improve.sh
```

The script will:

1. Verify ANTHROPIC_API_KEY is set
2. Clean state and restore files
3. Run analyze → plan workflow
4. Show which item will be improved
5. Provide interactive testing instructions
6. Validate that documentation was inserted
7. Offer to restore files to clean state

### What to Verify

During manual testing, verify:

- Documentation is inserted at the correct location
- Documentation matches expected style (NumPy for Python, JSDoc for
  TypeScript/JavaScript)
- File syntax remains valid (no indentation errors)
- Git diff shows the expected changes
- Multiple user choices work correctly: [A] Accept, [E] Edit, [R] Regenerate, [S] Skip,
  [Q] Quit

### Future Enhancement

When ClaudeClient mocking is implemented, this manual procedure can be converted to
automated tests:

- Mock Claude responses with predetermined documentation
- Validate DocstringWriter inserts at correct locations
- Test all code paths (accept, edit, regenerate, skip)
- Run in CI without API key requirement

## Testing Undo Feature

The undo feature integration test verifies the complete undo workflow with real file
system operations. This test validates that:

- Accept change adds documentation to a file
- Undo reverts the file to its original state
- Git transaction history records both operations (accept + revert commits)

### Integration Test Procedure

Run the automated integration test:

```bash
cd test-samples/

# Ensure API key is set
export ANTHROPIC_API_KEY=sk-ant-...

# Run undo integration test
chmod +x test-undo-integration.sh
./test-undo-integration.sh
```

The script will:

1. Verify prerequisites (API key, git, docimp)
2. Create temporary test directory with sample code
3. Run analyze and plan
4. Execute improve workflow: Accept -> Undo -> Quit
5. Verify file content matches original after undo
6. Verify git history shows accept commit and revert commit
7. Display test results and clean up

### What the Test Validates

The integration test covers the complete undo workflow end-to-end:

1. **File restoration**: File content exactly matches original after undo (no residual
   changes)
2. **Git history**: Side-car repository contains both accept and revert commits
3. **Transaction integrity**: Undo operations integrate correctly with git-based
   transaction system
4. **Real file operations**: Uses actual file system and git commands (not mocks)

### Test Coverage

This integration test complements the unit tests in
`cli/src/__tests__/session/InteractiveSession.test.ts`:

- **Unit tests** (9 tests): Mock PythonBridge, fast execution, isolated components
- **Integration test** (this): Real file I/O, real git operations, catches integration
  issues

### Future Enhancement

When ClaudeClient mocking is implemented, this integration test could be extended to
test more complex undo scenarios:

- Multiple accepts followed by multiple undos
- Undo after editing a suggestion
- Undo with file conflicts
- Session with mixed accept/skip/undo operations

## Adding to CI

To run these tests in CI/CD:

```yaml
# .github/workflows/test.yml
- name: Run test samples validation
  run: |
    npm run build
    npm link
    ./test-samples/test-workflows.sh
```

## Troubleshooting

**Issue**: Test samples show different item counts than expected

- Check if docimp.config.js exclude patterns changed
- Verify parser changes haven't affected detection
- Update expected-results.json if legitimate changes occurred

**Issue**: Cannot restore files after improve

```bash
# Nuclear option - hard reset
cd test-samples/example-project/
git checkout HEAD -- .
```

**Issue**: State directory not created

- Ensure you're running from example-project/ directory
- Check StateManager implementation in Task 1
- Verify analyze command creates state directory

## Maintenance

### Updating Expected Results

When you make intentional changes to the example-project code or when parser
improvements legitimately change item counts, use the automated script to regenerate
`expected-results.json`:

```bash
# From repository root or test-samples directory
./test-samples/scripts/update-expected-results.sh
```

**The script will:**

1. Run `docimp analyze` on example-project
2. Extract the `analysis` section from the results
3. Preserve manually-maintained sections:
   - `high_priority_items`
   - `sample_audit_ratings`
   - `expected_plan_items`
   - `notes`
4. Add version field (`version: "1.0"`) for backward compatibility tracking (Issue #201)
5. Output to `expected-results-new.json` for review
6. Show a diff of what changed

**Version Field**: The `version` field indicates the schema version of
`expected-results.json`. Currently at "1.0". This field should be incremented if the
structure of expected-results.json changes in breaking ways (e.g., renaming fields,
changing data types, or adding required fields).

**Review workflow:**

```bash
# After running the script, review changes
diff expected-results.json expected-results-new.json

# If changes are expected and correct, replace
mv expected-results-new.json expected-results.json

# Commit the updated expectations
git add expected-results.json
git commit -m "Update expected results after [description of change]"
```

**When to regenerate:**

- After adding/removing functions in example-project
- After parser improvements that correctly change detection
- After configuration changes (exclude patterns, etc.)
- After fixing bugs that change analysis accuracy

**When NOT to regenerate:**

- Analysis results changed unexpectedly (investigate first)
- You haven't verified the new counts are correct
- Tests are failing and you don't understand why

**Important**: Always understand why the numbers changed before accepting new expected
results. Unexpected changes may indicate bugs in the parser or analysis logic.

### Manually-Maintained Sections

The following sections in `expected-results.json` are **NOT** auto-generated and must be
updated manually when needed:

- **`description`**: Human-readable description of the file's purpose
- **`note`**: Important context about how values are generated
- **`high_priority_items`**: Representative sample of high-impact items for validation
- **`sample_audit_ratings`**: Consistent audit ratings for workflow B testing
- **`expected_plan_items`**: Expected plan counts for both workflows A and B
- **`notes`**: Important context about exclusions, restoration, etc.

If you modify these sections, the update script will preserve your changes. The
`description` and `note` fields have sensible defaults if missing.

## Contributing

When modifying test samples:

1. Update `expected-results.json` with new expectations
2. Run manual validation to verify changes
3. Update this README if workflow changes
4. Commit changes to git so restoration works
