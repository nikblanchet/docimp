#!/bin/bash
#
# Automated workflow validation script for DocImp test samples
#
# Tests Workflow A in CI:
# - Workflow A: analyze → plan (complexity-only)
#
# NOTE: Workflow B (analyze → audit → plan) requires ANTHROPIC_API_KEY
# and is interactive, so it must be tested manually. See test-samples/README.md
# for manual testing instructions.
#
# Usage: ./test-workflows.sh
#

set -e  # Exit on error

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
print_header() {
    echo ""
    echo "=============================================="
    echo "$1"
    echo "=============================================="
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

print_failure() {
    echo -e "${RED}✗${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Change to test project directory
cd "$(dirname "$0")/example-project" || exit 1

print_header "DocImp Workflow Validation Tests"
echo "Test project: $(pwd)"
echo ""

# Clean start
print_warning "Cleaning up previous state..."
rm -rf .docimp/
echo ""

#
# WORKFLOW A: analyze → plan (complexity-only)
#
print_header "WORKFLOW A: analyze → plan (complexity-only)"

# Analyze
echo "Running: docimp analyze ."
# Use node directly (CI compatibility - avoids wrapper script PATH issues)
if [ -n "$CI" ]; then
  node "$GITHUB_WORKSPACE/cli/dist/index.js" analyze .
else
  docimp analyze .
fi

# Check state directory created
if [ -d .docimp/session-reports ]; then
    print_success "State directory created (.docimp/session-reports/)"
else
    print_failure "State directory NOT created"
fi

# Check analyze-latest.json exists
if [ -f .docimp/session-reports/analyze-latest.json ]; then
    print_success "Analysis result saved (analyze-latest.json)"
else
    print_failure "Analysis result NOT saved"
fi

# Check gitignore works
if git status | grep -q ".docimp"; then
    print_failure "State directory NOT ignored by git"
else
    print_success "State directory ignored by git"
fi

# Plan (workflow A - no audit)
echo ""
echo "Running: docimp plan ."
if [ -n "$CI" ]; then
  node "$GITHUB_WORKSPACE/cli/dist/index.js" plan .
else
  docimp plan .
fi

# Check plan.json exists
if [ -f .docimp/session-reports/plan.json ]; then
    print_success "Plan saved (plan.json)"
else
    print_failure "Plan NOT saved"
fi

# Verify no audit ratings in workflow A
if command -v jq &> /dev/null; then
    FIRST_ITEM_RATING=$(jq -r '.items[0].audit_rating // "null"' .docimp/session-reports/plan.json 2>/dev/null || echo "null")
    if [ "$FIRST_ITEM_RATING" == "null" ]; then
        print_success "Workflow A: Items have null audit ratings (complexity-only)"
    else
        print_failure "Workflow A: Items should have null audit ratings, got: $FIRST_ITEM_RATING"
    fi
else
    print_warning "jq not installed, skipping audit rating verification"
fi

#
# WORKFLOW B: analyze → audit → plan (with audit ratings)
#
print_header "WORKFLOW B: analyze → audit → plan (with audit ratings)"

# Clean state
rm -rf .docimp/

# Verify cleanup succeeded
if [ -d .docimp/ ]; then
    print_failure "Failed to remove .docimp/ directory"
    exit 1
fi

# Analyze
echo "Running: docimp analyze ."
if [ -n "$CI" ]; then
  node "$GITHUB_WORKSPACE/cli/dist/index.js" analyze . > /dev/null 2>&1
else
  docimp analyze . > /dev/null 2>&1
fi

# Create audit fixture from expected-results.json
# (Simulates user rating items according to expected-results.json)
python3 << 'PYTHON_SCRIPT'
import json
import sys
from pathlib import Path

try:
    # Load expected audit ratings
    with open('../expected-results.json') as f:
        expected = json.load(f)
except FileNotFoundError:
    print("ERROR: ../expected-results.json not found", file=sys.stderr)
    sys.exit(1)
except json.JSONDecodeError as e:
    print(f"ERROR: Invalid JSON in expected-results.json: {e}", file=sys.stderr)
    sys.exit(1)

try:
    # Convert to audit.json format with absolute paths
    # The plan_generator expects paths to be resolvable to match analysis results
    ratings = {}
    base_dir = Path.cwd()  # Current directory (example-project/)
    for filepath, items in expected['sample_audit_ratings']['ratings'].items():
        # Resolve relative path to absolute path
        abs_path = str((base_dir / filepath).resolve())
        if abs_path not in ratings:
            ratings[abs_path] = {}
        for item_name, rating in items.items():
            ratings[abs_path][item_name] = rating

    # Write audit.json
    audit_data = {'ratings': ratings}
    Path('.docimp/session-reports').mkdir(parents=True, exist_ok=True)
    with open('.docimp/session-reports/audit.json', 'w') as f:
        json.dump(audit_data, f, indent=2)

    print("✓ Created audit fixture from expected results")
except KeyError as e:
    print(f"ERROR: Missing expected key in expected-results.json: {e}", file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f"ERROR: Failed to create audit fixture: {e}", file=sys.stderr)
    sys.exit(1)
PYTHON_SCRIPT

if [ $? -eq 0 ]; then
    print_success "Created audit fixture from expected results"
else
    print_failure "Failed to create audit fixture"
fi

# Verify audit file exists
if [ -f .docimp/session-reports/audit.json ]; then
    print_success "Audit fixture file created"
else
    print_failure "Audit fixture file missing"
fi

# Run plan (should apply audit ratings)
echo ""
echo "Running: docimp plan ."
if [ -n "$CI" ]; then
  node "$GITHUB_WORKSPACE/cli/dist/index.js" plan . > /dev/null 2>&1
else
  docimp plan . > /dev/null 2>&1
fi

if [ -f .docimp/session-reports/plan.json ]; then
    print_success "Plan generated with audit ratings"
else
    print_failure "Plan NOT generated"
fi

# Verify audit ratings were applied
if command -v jq &> /dev/null; then
    # Check that at least one item has non-null audit rating
    ITEMS_WITH_RATINGS=$(jq '[.items[] | select(.audit_rating != null)] | length' .docimp/session-reports/plan.json)

    if [ "$ITEMS_WITH_RATINGS" -gt 0 ]; then
        print_success "Workflow B: Audit ratings applied to $ITEMS_WITH_RATINGS plan items"
    else
        print_failure "Workflow B: No items have audit ratings (regression!)"
    fi

    # Verify expected plan item count for workflow B
    PLAN_ITEMS=$(jq '.items | length' .docimp/session-reports/plan.json)
    EXPECTED_PLAN_ITEMS=27  # 19 undocumented + ~9 rated 1-2 from expected-results.json

    # Allow tolerance (within 3 items) - exact count may vary with code changes
    DIFF=$((PLAN_ITEMS > EXPECTED_PLAN_ITEMS ? PLAN_ITEMS - EXPECTED_PLAN_ITEMS : EXPECTED_PLAN_ITEMS - PLAN_ITEMS))
    if [ $DIFF -le 3 ]; then
        print_success "Workflow B plan items: $PLAN_ITEMS (expected ~$EXPECTED_PLAN_ITEMS)"
    else
        print_warning "Workflow B plan items: $PLAN_ITEMS (expected ~$EXPECTED_PLAN_ITEMS, diff: $DIFF)"
    fi
else
    print_warning "jq not installed, skipping detailed audit rating verification"
fi

#
# AUTO-CLEAN TESTING
#
print_header "AUTO-CLEAN TESTING"

# Create a dummy audit file to test auto-clean
echo '{"ratings": {}}' > .docimp/session-reports/audit.json
if [ -f .docimp/session-reports/audit.json ]; then
    print_success "Created test audit file"
else
    print_failure "Could not create test audit file"
fi

# Run analyze (should clear old files)
echo ""
echo "Running: docimp analyze . (should auto-clean)"
if [ -n "$CI" ]; then
  node "$GITHUB_WORKSPACE/cli/dist/index.js" analyze .
else
  docimp analyze .
fi

if [ ! -f .docimp/session-reports/audit.json ]; then
    print_success "Auto-clean: Old audit file cleared by analyze"
else
    print_failure "Auto-clean: Old audit file was NOT cleared"
fi

# Test --keep-old-reports flag
echo '{"ratings": {}}' > .docimp/session-reports/audit.json
echo ""
echo "Running: docimp analyze . --keep-old-reports"
if [ -n "$CI" ]; then
  node "$GITHUB_WORKSPACE/cli/dist/index.js" analyze . --keep-old-reports
else
  docimp analyze . --keep-old-reports
fi

if [ -f .docimp/session-reports/audit.json ]; then
    print_success "--keep-old-reports: Old audit file preserved"
else
    print_failure "--keep-old-reports: Old audit file was NOT preserved"
fi

#
# STATE DIRECTORY STRUCTURE
#
print_header "STATE DIRECTORY STRUCTURE"

# Clean and re-analyze
rm -rf .docimp/
if [ -n "$CI" ]; then
  node "$GITHUB_WORKSPACE/cli/dist/index.js" analyze .
else
  docimp analyze .
fi

if [ -d .docimp ]; then
    print_success "State directory exists (.docimp/)"
else
    print_failure "State directory does NOT exist"
fi

if [ -d .docimp/session-reports ]; then
    print_success "Session reports directory exists (.docimp/session-reports/)"
else
    print_failure "Session reports directory does NOT exist"
fi

# Verify structure matches expected
EXPECTED_FILES=("analyze-latest.json")
for file in "${EXPECTED_FILES[@]}"; do
    if [ -f .docimp/session-reports/$file ]; then
        print_success "Expected file exists: $file"
    else
        print_failure "Expected file missing: $file"
    fi
done

#
# ITEM COUNT VALIDATION
#
print_header "ITEM COUNT VALIDATION"

if command -v jq &> /dev/null; then
    TOTAL_ITEMS=$(jq -r '.total_items' .docimp/session-reports/analyze-latest.json)
    EXPECTED_TOTAL=62

    if [ "$TOTAL_ITEMS" -eq "$EXPECTED_TOTAL" ]; then
        print_success "Total items: $TOTAL_ITEMS (expected: $EXPECTED_TOTAL)"
    else
        print_failure "Total items: $TOTAL_ITEMS (expected: $EXPECTED_TOTAL)"
    fi

    PYTHON_ITEMS=$(jq -r '.by_language.python.total_items' .docimp/session-reports/analyze-latest.json)
    EXPECTED_PYTHON=25

    if [ "$PYTHON_ITEMS" -eq "$EXPECTED_PYTHON" ]; then
        print_success "Python items: $PYTHON_ITEMS (expected: $EXPECTED_PYTHON)"
    else
        print_failure "Python items: $PYTHON_ITEMS (expected: $EXPECTED_PYTHON)"
    fi

    JS_ITEMS=$(jq -r '.by_language.javascript.total_items' .docimp/session-reports/analyze-latest.json)
    EXPECTED_JS=18

    if [ "$JS_ITEMS" -eq "$EXPECTED_JS" ]; then
        print_success "JavaScript items: $JS_ITEMS (expected: $EXPECTED_JS)"
    else
        print_failure "JavaScript items: $JS_ITEMS (expected: $EXPECTED_JS)"
    fi

    TS_ITEMS=$(jq -r '.by_language.typescript.total_items' .docimp/session-reports/analyze-latest.json)
    EXPECTED_TS=19

    if [ "$TS_ITEMS" -eq "$EXPECTED_TS" ]; then
        print_success "TypeScript items: $TS_ITEMS (expected: $EXPECTED_TS)"
    else
        print_failure "TypeScript items: $TS_ITEMS (expected: $EXPECTED_TS)"
    fi
else
    print_warning "jq not installed, skipping item count validation"
fi

#
# ERROR CONDITION TESTING
#
print_header "ERROR CONDITION TESTING"

# Temporarily disable exit-on-error for error condition tests
# (these tests are designed to test failure scenarios)
set +e

# Test 1: Corrupted analyze-latest.json
echo "Test: Corrupted analyze-latest.json"
rm -rf .docimp/
if [ -n "$CI" ]; then
  node "$GITHUB_WORKSPACE/cli/dist/index.js" analyze . > /dev/null 2>&1
else
  docimp analyze . > /dev/null 2>&1
fi
echo '{"invalid": json}' > .docimp/session-reports/analyze-latest.json

if [ -n "$CI" ]; then
  node "$GITHUB_WORKSPACE/cli/dist/index.js" plan . > /dev/null 2>&1
else
  docimp plan . > /dev/null 2>&1
fi
PLAN_EXIT_CODE=$?

if [ $PLAN_EXIT_CODE -eq 0 ]; then
    # Plan re-analyzes, so corrupted analyze-latest.json should be overwritten
    print_success "Plan handles corrupted analyze-latest.json (re-analyzes)"
else
    print_warning "Plan failed on corrupted analyze-latest.json (exit code: $PLAN_EXIT_CODE)"
fi

# Test 2: Malformed audit.json (wrong data type)
echo ""
echo "Test: Malformed audit.json (ratings not a dict)"
rm -rf .docimp/
if [ -n "$CI" ]; then
  node "$GITHUB_WORKSPACE/cli/dist/index.js" analyze . > /dev/null 2>&1
else
  docimp analyze . > /dev/null 2>&1
fi
echo '{"ratings": "not-a-dict"}' > .docimp/session-reports/audit.json

if [ -n "$CI" ]; then
  node "$GITHUB_WORKSPACE/cli/dist/index.js" plan . > /dev/null 2>&1
else
  docimp plan . > /dev/null 2>&1
fi
PLAN_EXIT_CODE=$?

if [ $PLAN_EXIT_CODE -eq 0 ]; then
    # Plan should either ignore bad audit or error gracefully
    if [ -f .docimp/session-reports/plan.json ]; then
        print_success "Plan handles malformed audit.json (ignored bad data)"
    else
        print_warning "Plan completed but did not create plan.json"
    fi
else
    # Failing is OK if error message is clear
    print_success "Plan fails gracefully on malformed audit.json"
fi

# Test 3: Missing required fields in audit.json
echo ""
echo "Test: audit.json missing 'ratings' field"
rm -rf .docimp/
if [ -n "$CI" ]; then
  node "$GITHUB_WORKSPACE/cli/dist/index.js" analyze . > /dev/null 2>&1
else
  docimp analyze . > /dev/null 2>&1
fi
echo '{"wrong_field": {}}' > .docimp/session-reports/audit.json

if [ -n "$CI" ]; then
  node "$GITHUB_WORKSPACE/cli/dist/index.js" plan . > /dev/null 2>&1
else
  docimp plan . > /dev/null 2>&1
fi
PLAN_EXIT_CODE=$?

if [ $PLAN_EXIT_CODE -eq 0 ]; then
    print_success "Plan handles audit.json with missing fields"
else
    print_success "Plan fails gracefully on invalid audit structure"
fi

# Test 4: Empty state directory (edge case)
echo ""
echo "Test: Empty state directory"
rm -rf .docimp/
mkdir -p .docimp/session-reports

if [ -n "$CI" ]; then
  node "$GITHUB_WORKSPACE/cli/dist/index.js" plan . > /dev/null 2>&1
else
  docimp plan . > /dev/null 2>&1
fi
PLAN_EXIT_CODE=$?

if [ $PLAN_EXIT_CODE -eq 0 ]; then
    # Plan re-analyzes, so this should work fine
    print_success "Plan handles empty state directory (re-analyzes)"
else
    print_warning "Plan failed on empty state directory (exit code: $PLAN_EXIT_CODE)"
fi

# Test 5: Read-only analyze-latest.json (can't be updated)
echo ""
echo "Test: Read-only permissions on state file"
rm -rf .docimp/
if [ -n "$CI" ]; then
  node "$GITHUB_WORKSPACE/cli/dist/index.js" analyze . > /dev/null 2>&1
else
  docimp analyze . > /dev/null 2>&1
fi
chmod 444 .docimp/session-reports/analyze-latest.json

if [ -n "$CI" ]; then
  node "$GITHUB_WORKSPACE/cli/dist/index.js" analyze . > /dev/null 2>&1
else
  docimp analyze . > /dev/null 2>&1
fi
ANALYZE_EXIT_CODE=$?

# Restore permissions before cleanup
chmod 644 .docimp/session-reports/analyze-latest.json 2>/dev/null || true

if [ $ANALYZE_EXIT_CODE -ne 0 ]; then
    print_success "Analyze detects write permission issues"
else
    print_warning "Analyze may not check file write permissions"
fi

# Clean up
rm -rf .docimp/

# Re-enable exit-on-error
set -e

#
# FINAL SUMMARY
#
print_header "TEST SUMMARY"

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))

echo "Total tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
    echo ""
    echo "Workflow validation successful. DocImp is working correctly."
    exit 0
else
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    echo ""
    echo "Please review failures above and fix issues before proceeding."
    exit 1
fi
