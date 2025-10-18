# PR #170 Round 2 - Issue Tackling Plan

**Purpose**: Address high and medium priority findings from deep code review.

**Delete this file when complete.**

---

## Phase 1: Critical Fixes (High Priority)

### Issue #189: Tighten Test Tolerance

**File**: `test-samples/test-workflows.sh`

**Change** (line 234-242):
```bash
# Current (too loose):
EXPECTED_PLAN_ITEMS=27
DIFF=$((PLAN_ITEMS > EXPECTED_PLAN_ITEMS ? PLAN_ITEMS - EXPECTED_PLAN_ITEMS : EXPECTED_PLAN_ITEMS - PLAN_ITEMS))
if [ $DIFF -le 3 ]; then

# New (strict):
EXPECTED_PLAN_ITEMS=27
EXPECTED_MIN_RATED=9  # Minimum items with audit ratings

# Strict count check (±1 tolerance)
DIFF=$((PLAN_ITEMS > EXPECTED_PLAN_ITEMS ? PLAN_ITEMS - EXPECTED_PLAN_ITEMS : EXPECTED_PLAN_ITEMS - PLAN_ITEMS))
if [ $DIFF -le 1 ]; then
    print_success "Workflow B plan items: $PLAN_ITEMS (expected: $EXPECTED_PLAN_ITEMS)"
else
    print_failure "Workflow B plan items: $PLAN_ITEMS (expected: $EXPECTED_PLAN_ITEMS, diff: $DIFF too large)"
fi

# Validate minimum rated items (replace existing check)
if [ "$ITEMS_WITH_RATINGS" -ge "$EXPECTED_MIN_RATED" ]; then
    print_success "Workflow B: At least $EXPECTED_MIN_RATED items have audit ratings ($ITEMS_WITH_RATINGS found)"
else
    print_failure "Workflow B: Expected at least $EXPECTED_MIN_RATED rated items, got $ITEMS_WITH_RATINGS"
fi
```

**Test**: Run `./test-samples/test-workflows.sh` - should still pass with stricter validation.

---

### Issue #191: Add Directory Validation to Fixture Generation

**File**: `test-samples/test-workflows.sh` (Python inline script at line 149-191)

**Add** after line 154 (after imports):
```python
# Validate we're in the right directory
base_dir = Path.cwd()
if not (base_dir / 'src' / 'python' / 'calculator.py').exists():
    print("ERROR: Script must be run from example-project/ directory", file=sys.stderr)
    print(f"Current directory: {base_dir}", file=sys.stderr)
    sys.exit(1)
```

**Test**:
1. Run script from correct directory - should work
2. Run from wrong directory - should fail with clear error

---

### Issue #190: Test Files Included in Analysis

**Decision Required**: Fix now or defer?

#### Option A: Fix Now (Recommended)
**File**: `docimp.config.js`

**Add** to exclude array:
```javascript
exclude: [
  '**/test_*.py',           // Already present
  '**/tests/**/*.py',       // Add this
  '**/tests/**/*.ts',       // Add this
  '**/tests/**/*.js',       // Add this
  '**/*.test.ts',
  '**/*.test.js',
  // ...
]
```

**Then update expected results**:
1. Run analysis: `cd test-samples/example-project && docimp analyze .`
2. Check new totals (should be ~58 instead of 62)
3. Update `expected-results.json` with new values
4. Update test assertions in `test-workflows.sh`
5. Remove issue reference from `expected-results.json` notes

#### Option B: Defer (Track as Known Bug)
Keep issue #190 open, leave expected-results.json as-is.

---

### Issue #194: Document Plugin Validation in Manual Runbook

**File**: `test-samples/test-workflows-improve.sh`

**Add** after line 100 (after plan generation section):
```bash
#
# STEP 5: Plugin Validation Checklist
#
echo "Step 5: Plugin validation testing checklist"
echo ""
echo "During the improve session, manually verify:"
echo "  [  ] Plugin validation executes for generated documentation"
echo "  [  ] Type mismatches in JSDoc are caught and displayed"
echo "  [  ] Style guide violations are reported"
echo "  [  ] Parameter name mismatches are detected"
echo "  [  ] User can see validation errors before accepting"
echo "  [  ] Validation errors include helpful messages"
echo ""
echo "Press Enter to continue to improve command..."
read
echo ""
```

**Test**: Run script, verify checklist is displayed.

---

## Phase 2: Validation Improvements (Medium Priority)

### Issue #192: Validate expected-results.json Accuracy

**File**: `test-samples/test-workflows.sh`

**Add** new section after item count validation (after line 369):
```bash
#
# EXPECTED RESULTS VALIDATION
#
print_header "EXPECTED RESULTS VALIDATION"

echo "Validating expected-results.json accuracy..."

# Compare actual vs expected totals
ACTUAL_TOTAL=$(jq -r '.total_items' .docimp/session-reports/analyze-latest.json)
EXPECTED_TOTAL=$(jq -r '.analysis.total_items' ../expected-results.json)

if [ "$ACTUAL_TOTAL" -eq "$EXPECTED_TOTAL" ]; then
    print_success "Total items match: $ACTUAL_TOTAL"
else
    print_failure "Total items mismatch: actual=$ACTUAL_TOTAL, expected=$EXPECTED_TOTAL"
    echo "If this change is intentional, update expected-results.json"
    echo "If unexpected, investigate why analysis results changed"
fi

# Compare coverage percentage
ACTUAL_COVERAGE=$(jq -r '.coverage_percent' .docimp/session-reports/analyze-latest.json)
EXPECTED_COVERAGE=$(jq -r '.analysis.coverage_percent' ../expected-results.json)

# Allow 0.1% variance due to rounding
COVERAGE_DIFF=$(echo "$ACTUAL_COVERAGE - $EXPECTED_COVERAGE" | bc | sed 's/^-//')
if (( $(echo "$COVERAGE_DIFF < 0.1" | bc -l) )); then
    print_success "Coverage percentage matches: $ACTUAL_COVERAGE%"
else
    print_warning "Coverage percentage differs: actual=$ACTUAL_COVERAGE%, expected=$EXPECTED_COVERAGE%"
fi
```

**Dependencies**: Requires `bc` command for floating point comparison.

**Test**: Run test-workflows.sh, verify validation executes.

---

### Issue #195: Create update-expected-results Script

**New File**: `test-samples/scripts/update-expected-results.sh`

```bash
#!/bin/bash
#
# Regenerate expected-results.json from actual analysis
#
# Usage: ./test-samples/scripts/update-expected-results.sh
#

set -e

cd "$(dirname "$0")/../example-project" || exit 1

echo "Running analysis..."
docimp analyze . --format json > /dev/null

echo "Extracting results..."
ANALYZE_FILE=".docimp/session-reports/analyze-latest.json"

# Create new expected-results.json
cat > ../expected-results-new.json << 'EOF'
{
  "description": "Expected analysis results for test-samples/example-project/",
  "note": "These values are generated from actual analysis and should be updated if code changes",
  "version": "1.0",
EOF

# Extract core analysis results
jq '{
  analysis: {
    total_items: .total_items,
    documented_items: .documented_items,
    undocumented_items: .undocumented_items,
    coverage_percent: .coverage_percent,
    by_language: .by_language
  }
}' "$ANALYZE_FILE" | tail -n +2 | head -n -1 >> ../expected-results-new.json

echo "," >> ../expected-results-new.json

# Preserve high_priority_items, sample_audit_ratings, expected_plan_items, notes
jq '{
  high_priority_items: .high_priority_items,
  sample_audit_ratings: .sample_audit_ratings,
  expected_plan_items: .expected_plan_items,
  notes: .notes
}' ../expected-results.json | tail -n +2 >> ../expected-results-new.json

echo ""
echo "New expected results written to: expected-results-new.json"
echo ""
echo "Review the changes:"
echo "  diff expected-results.json expected-results-new.json"
echo ""
echo "If correct, replace:"
echo "  mv expected-results-new.json expected-results.json"
```

**Make executable**: `chmod +x test-samples/scripts/update-expected-results.sh`

**Documentation**: Add to `test-samples/README.md` under "Maintenance" section.

---

### Issue #201: Version Test Samples

**File**: `test-samples/expected-results.json`

**Add** version field (already in script above):
```json
{
  "description": "Expected analysis results for test-samples/example-project/",
  "note": "These values are generated from actual analysis and should be updated if code changes",
  "version": "1.0",
  "compatible_with": "docimp >= 1.0.0, < 2.0.0",
  "analysis": {
    // ...
  }
}
```

**Test**: Verify JSON is still valid.

---

### Issue #193: Improve Error Message Validation

**File**: `test-samples/test-workflows.sh`

**Update** error condition tests (example for corrupted JSON test, line 380-402):

```bash
# BEFORE:
docimp plan . > /dev/null 2>&1
PLAN_EXIT_CODE=$?

if [ $PLAN_EXIT_CODE -eq 0 ]; then
    print_success "Plan handles corrupted analyze-latest.json (re-analyzes)"
else
    print_warning "Plan failed on corrupted analyze-latest.json (exit code: $PLAN_EXIT_CODE)"
fi

# AFTER:
ERROR_OUTPUT=$(docimp plan . 2>&1)
PLAN_EXIT_CODE=$?

if [ $PLAN_EXIT_CODE -eq 0 ]; then
    print_success "Plan handles corrupted analyze-latest.json (re-analyzes)"
else
    # Validate error message is helpful
    if echo "$ERROR_OUTPUT" | grep -qi "analyze"; then
        print_success "Plan shows helpful error mentioning analyze file"
    else
        print_warning "Plan error message unclear: $ERROR_OUTPUT"
    fi
fi
```

**Apply** same pattern to all 5 error condition tests.

---

### Issue #199: Add Malformed Syntax Test Files

**Defer to separate PR** - Requires new test files and parser changes.

Keep issue open for future work.

---

## Completion Checklist

### Phase 1 (Critical)
- [X] #189: Tighten test tolerance in test-workflows.sh
- [X] #191: Add directory validation to fixture generation
- [ ] #190: DECISION - Fix test file inclusion or defer?
- [ ] #194: Document plugin validation in manual runbook

### Phase 2 (Validation)
- [ ] #192: Add expected-results.json validation
- [ ] #195: Create update-expected-results script
- [ ] #201: Add version field to expected-results.json
- [ ] #193: Improve error message validation

### Testing
- [ ] Run `./test-samples/test-workflows.sh` - all tests pass
- [ ] Run manual improve test script - checklist visible
- [ ] Verify expected-results validation works

### Documentation
- [ ] Update test-samples/README.md with update script docs
- [ ] Commit all changes
- [ ] Close addressed issues

### Cleanup
- [ ] Delete this file (PLAN_PR170_ROUND2.md)

---

## Notes

- Issue #190 (test files) requires decision on fix vs defer
- Issue #199 (malformed syntax) deferred to future PR
- Low-priority issues (#196, #197, #198, #200) remain open for future work
- Issue #171 (CONTRIBUTING.md) tracked separately

---

**End of runbook. Delete when complete.**
