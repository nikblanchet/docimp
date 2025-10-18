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
docimp analyze . > /dev/null 2>&1

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
docimp plan . > /dev/null 2>&1

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
docimp analyze . > /dev/null 2>&1

if [ ! -f .docimp/session-reports/audit.json ]; then
    print_success "Auto-clean: Old audit file cleared by analyze"
else
    print_failure "Auto-clean: Old audit file was NOT cleared"
fi

# Test --keep-old-reports flag
echo '{"ratings": {}}' > .docimp/session-reports/audit.json
echo ""
echo "Running: docimp analyze . --keep-old-reports"
docimp analyze . --keep-old-reports > /dev/null 2>&1

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
docimp analyze . > /dev/null 2>&1

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
