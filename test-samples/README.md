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

After running interactive commands that modify files (`docimp improve`), restore the original state:

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
3. **Path normalization**: Converts relative paths to absolute paths (critical for matching with analysis results)
4. **Runs plan command**: Applies audit ratings to impact scores
5. **Validates results**: Checks that ratings are applied and plan item count is correct

This provides regression protection for the audit rating application feature without requiring interactive user input.

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

## Contributing

When modifying test samples:

1. Update `expected-results.json` with new expectations
2. Run manual validation to verify changes
3. Update this README if workflow changes
4. Commit changes to git so restoration works
