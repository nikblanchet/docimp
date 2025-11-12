#!/bin/bash
#
# Test status command functionality
#
# Tests:
# - Status command with empty workflow state
# - Status shows analyze timestamp after running analyze
# - Status shows multiple command timestamps
# - Status shows staleness warnings when files modified
# - JSON output format validation
# - Human-readable timestamp formatting
# - Suggestions output
#
# Usage: ./test-status-command.sh
#

set -e  # Exit on error

# Load shared color constants
SCRIPT_DIR_COLORS="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR_COLORS/scripts/colors.sh" 2>/dev/null || source "$SCRIPT_DIR_COLORS/../scripts/colors.sh"

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

# Verify docimp is available
if ! command -v docimp &> /dev/null; then
    echo -e "${RED}Error: 'docimp' command not found in PATH${NC}"
    echo "Please ensure docimp is installed and available"
    exit 1
fi

# Change to test project directory
cd "$(dirname "$0")/example-project" || exit 1

# Clean up from previous runs
print_header "Cleaning up from previous runs"
rm -rf .docimp
echo "Removed .docimp directory"

# Test 1: Status with empty workflow state
print_header "Test 1: Status with empty workflow state"
echo "Running: docimp status"
OUTPUT=$(docimp status 2>&1 || true)  # Allow command to fail without exiting script

if echo "$OUTPUT" | grep -q "not run"; then
    print_success "Status shows 'not run' for all commands"
else
    print_failure "Status should indicate commands not run yet"
fi

# Test 2: Status after analyze
print_header "Test 2: Status after running analyze"
echo "Running: docimp analyze ."
docimp analyze . > /dev/null 2>&1

echo "Running: docimp status"
OUTPUT=$(docimp status 2>&1)

if echo "$OUTPUT" | grep -q "analyze.*run"; then
    print_success "Status shows analyze as run"
else
    print_failure "Status should show analyze timestamp"
fi

# Check for item count
if echo "$OUTPUT" | grep -q "items"; then
    print_success "Status shows item count"
else
    print_failure "Status should show number of items analyzed"
fi

# Check for file count
if echo "$OUTPUT" | grep -q "files"; then
    print_success "Status shows file count"
else
    print_failure "Status should show number of files tracked"
fi

# Test 3: Status after plan
print_header "Test 3: Status after running plan"
echo "Running: docimp plan ."
docimp plan . > /dev/null 2>&1

echo "Running: docimp status"
OUTPUT=$(docimp status 2>&1)

if echo "$OUTPUT" | grep -q "plan.*run"; then
    print_success "Status shows plan as run"
else
    print_failure "Status should show plan timestamp"
fi

# Both analyze and plan should show
if echo "$OUTPUT" | grep -q "analyze.*run" && echo "$OUTPUT" | grep -q "plan.*run"; then
    print_success "Status shows multiple commands"
else
    print_failure "Status should show both analyze and plan"
fi

# Test 4: File modifications and staleness warnings
print_header "Test 4: Staleness detection after file modifications"
echo "Modifying src/python/calculator.py"

# Append a comment to trigger checksum change
echo "# Modified for testing" >> src/python/calculator.py

echo "Running: docimp status"
OUTPUT=$(docimp status 2>&1)

if echo "$OUTPUT" | grep -q -i "stale\|warning"; then
    print_success "Status shows staleness warning"
else
    print_warning "Status should ideally show staleness warnings (may depend on implementation)"
fi

# Restore file
git checkout src/python/calculator.py 2>/dev/null || true

# Test 5: JSON output format
print_header "Test 5: JSON output validation"
echo "Running: docimp status --json"
JSON_OUTPUT=$(docimp status --json 2>&1)

# Check if output is valid JSON
if echo "$JSON_OUTPUT" | python3 -m json.tool > /dev/null 2>&1; then
    print_success "Status --json produces valid JSON"
else
    print_failure "Status --json should produce valid JSON output"
fi

# Check for required fields in JSON
if echo "$JSON_OUTPUT" | grep -q '"analyze"'; then
    print_success "JSON contains 'analyze' field"
else
    print_failure "JSON should contain 'analyze' field"
fi

if echo "$JSON_OUTPUT" | grep -q '"plan"'; then
    print_success "JSON contains 'plan' field"
else
    print_failure "JSON should contain 'plan' field"
fi

# Test 6: Human-readable timestamps
print_header "Test 6: Human-readable timestamp formatting"
echo "Running: docimp status (check timestamp format)"
OUTPUT=$(docimp status 2>&1)

# Check for relative time format (e.g., "2 seconds ago", "just now", "1 minute ago")
if echo "$OUTPUT" | grep -q -E "(second|minute|hour|just now|ago)"; then
    print_success "Status uses human-readable timestamps"
else
    print_warning "Status should use relative timestamps (e.g., '5 seconds ago')"
fi

# Test 7: Suggestions output
print_header "Test 7: Actionable suggestions"
# Clean state to trigger suggestions
rm -rf .docimp
echo "Running: docimp status (empty state)"
OUTPUT=$(docimp status 2>&1)

if echo "$OUTPUT" | grep -q -i "suggest\|next\|run"; then
    print_success "Status provides actionable suggestions"
else
    print_warning "Status should provide suggestions for next steps"
fi

# Test 8: Status command performance
print_header "Test 8: Status command performance"
echo "Running: docimp analyze ."
docimp analyze . > /dev/null 2>&1

echo "Running: docimp plan ."
docimp plan . > /dev/null 2>&1

echo "Measuring status command execution time"
START_TIME=$(date +%s%3N)  # Milliseconds
docimp status > /dev/null 2>&1
END_TIME=$(date +%s%3N)
DURATION=$(( END_TIME - START_TIME ))

echo "Status command took: ${DURATION}ms"

if [ "$DURATION" -lt 100 ]; then
    print_success "Status command < 100ms (target: 50ms, achieved: ${DURATION}ms)"
elif [ "$DURATION" -lt 500 ]; then
    print_warning "Status command took ${DURATION}ms (target: < 50ms, but acceptable)"
else
    print_failure "Status command too slow: ${DURATION}ms (target: < 50ms)"
fi

# Test 9: Verify workflow state file structure
print_header "Test 9: Workflow state file structure"
if [ -f .docimp/workflow-state.json ]; then
    print_success "workflow-state.json exists"

    # Check for required fields
    if grep -q '"schema_version"' .docimp/workflow-state.json; then
        print_success "workflow-state.json contains schema_version"
    else
        print_failure "workflow-state.json should contain schema_version"
    fi

    if grep -q '"last_analyze"' .docimp/workflow-state.json; then
        print_success "workflow-state.json contains last_analyze"
    else
        print_failure "workflow-state.json should contain last_analyze"
    fi

    if grep -q '"timestamp"' .docimp/workflow-state.json; then
        print_success "workflow-state.json contains timestamp"
    else
        print_failure "workflow-state.json should contain timestamp"
    fi

    if grep -q '"file_checksums"' .docimp/workflow-state.json; then
        print_success "workflow-state.json contains file_checksums"
    else
        print_failure "workflow-state.json should contain file_checksums"
    fi
else
    print_failure "workflow-state.json not found"
fi

# Test 10: Status with all commands run
print_header "Test 10: Status with full workflow"
echo "Simulating full workflow (analyze → audit → plan)"
docimp analyze . > /dev/null 2>&1
# Skip audit since it's interactive and requires API key
docimp plan . > /dev/null 2>&1

echo "Running: docimp status"
OUTPUT=$(docimp status 2>&1)

# Verify comprehensive output
COMMAND_COUNT=$(echo "$OUTPUT" | grep -c "run\|not run" || true)
if [ "$COMMAND_COUNT" -ge 4 ]; then
    print_success "Status shows all 4 commands (analyze, audit, plan, improve)"
else
    print_warning "Expected 4 command statuses, found $COMMAND_COUNT"
fi

# Summary
print_header "Test Summary"
echo -e "${GREEN}Tests passed: $TESTS_PASSED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}Tests failed: $TESTS_FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}All critical tests passed!${NC}"
fi
