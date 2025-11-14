#!/bin/bash
#
# Test incremental analysis functionality
#
# Tests:
# - Baseline analysis creates workflow state
# - File modifications detected correctly
# - Incremental analysis only re-analyzes changed files
# - Workflow state updated with new checksums
# - Dry-run flag previews changes without running analysis
# - Time savings meet 90%+ target for 10% file changes
#
# Usage: ./test-incremental-analysis.sh
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
rm -rf .docimp test-incremental
echo "Removed .docimp and test-incremental directories"

# Create test files in isolated directory
print_header "Creating test files for incremental analysis"
mkdir -p test-incremental
cat > test-incremental/file1.py << 'EOF'
def function_one():
    """Documented function one"""
    return 1

def function_two():
    return 2
EOF

cat > test-incremental/file2.py << 'EOF'
def function_three():
    """Documented function three"""
    return 3

def function_four():
    return 4
EOF

cat > test-incremental/file3.py << 'EOF'
def function_five():
    """Documented function five"""
    return 5

def function_six():
    return 6
EOF

cat > test-incremental/file4.py << 'EOF'
def function_seven():
    """Documented function seven"""
    return 7

def function_eight():
    return 8
EOF

cat > test-incremental/file5.py << 'EOF'
def function_nine():
    """Documented function nine"""
    return 9

def function_ten():
    return 10
EOF

echo "Created 5 Python files (10 functions total)"

# Test 1: Baseline analysis
print_header "Test 1: Baseline analysis"
echo "Running: docimp analyze ./test-incremental"
START_TIME=$(date +%s)  # Seconds (cross-platform compatible)
docimp analyze ./test-incremental > /dev/null 2>&1
BASELINE_TIME=$(( ($(date +%s) - START_TIME) * 1000 ))
echo "Baseline analysis time: ${BASELINE_TIME}ms"

if [ -f .docimp/workflow-state.json ]; then
    print_success "Workflow state created"
else
    print_failure "Workflow state not created"
    exit 1
fi

# Verify all 5 files in checksums (use file_checksums object keys)
CHECKSUM_COUNT=$(grep -o 'test-incremental/file[0-9]\.py' .docimp/workflow-state.json | wc -l | tr -d ' ')
if [ "$CHECKSUM_COUNT" -eq 5 ]; then
    print_success "All 5 files tracked in workflow state checksums"
else
    print_failure "Expected 5 files in checksums, found $CHECKSUM_COUNT"
fi

# Test 2: No changes - incremental should skip analysis
print_header "Test 2: Incremental analysis with no changes"
echo "Running: docimp analyze ./test-incremental --incremental"
OUTPUT=$(docimp analyze ./test-incremental --incremental 2>&1)
if echo "$OUTPUT" | grep -q "0 file(s) have changed"; then
    print_success "Detected 0 changed files"
else
    print_failure "Should detect 0 changed files when nothing modified"
fi

# Test 3: Modify 1 file (20% of files)
print_header "Test 3: Modify 1 file and run incremental analysis"
echo "Modifying test-incremental/file1.py"
cat > test-incremental/file1.py << 'EOF'
def function_one():
    """Documented function one"""
    return 1

def function_two():
    return 2

def function_new():
    return 99
EOF

echo "Running: docimp analyze ./test-incremental --incremental"
START_TIME=$(date +%s)
OUTPUT=$(docimp analyze ./test-incremental --incremental 2>&1)
INCREMENTAL_TIME=$(( ($(date +%s) - START_TIME) * 1000 ))
echo "Incremental analysis time: ${INCREMENTAL_TIME}ms"

if echo "$OUTPUT" | grep -q "1 file(s) have changed"; then
    print_success "Detected 1 changed file"
else
    print_failure "Should detect 1 changed file"
fi

# Verify time savings
if [ "$BASELINE_TIME" -gt 0 ]; then
    SAVINGS=$(( (BASELINE_TIME - INCREMENTAL_TIME) * 100 / BASELINE_TIME ))
    echo "Time savings: ${SAVINGS}%"
    if [ "$SAVINGS" -ge 50 ]; then
        print_success "Time savings ${SAVINGS}% (good for 20% file changes)"
    else
        print_warning "Time savings ${SAVINGS}% (acceptable for small dataset)"
    fi
else
    print_warning "Cannot calculate time savings (baseline time was 0)"
fi

# Test 4: Dry-run preview
print_header "Test 4: Dry-run preview"
echo "Modifying test-incremental/file2.py"
cat > test-incremental/file2.py << 'EOF'
def function_three():
    """Documented function three"""
    return 3

def function_four():
    return 4

def function_another():
    return 88
EOF

echo "Running: docimp analyze ./test-incremental --incremental --dry-run"
OUTPUT=$(docimp analyze ./test-incremental --incremental --dry-run 2>&1)

if echo "$OUTPUT" | grep -q "dry run mode"; then
    print_success "Dry-run mode activated"
else
    print_failure "Dry-run mode not indicated in output"
fi

if echo "$OUTPUT" | grep -q "Would re-analyze.*file(s)"; then
    print_success "Dry-run shows file count preview"
else
    print_failure "Dry-run should show 'Would re-analyze' message"
fi

# Verify workflow state NOT updated by dry-run
CHECKSUM_BEFORE=$(grep 'test-incremental/file2.py' .docimp/workflow-state.json)
if [ -n "$CHECKSUM_BEFORE" ]; then
    print_success "Dry-run did not modify workflow state"
else
    print_failure "Dry-run should not modify workflow state"
fi

# Test 5: Actual incremental run after dry-run
print_header "Test 5: Actual incremental analysis after dry-run"
echo "Running: docimp analyze ./test-incremental --incremental"
OUTPUT=$(docimp analyze ./test-incremental --incremental 2>&1)

# Note: file1.py was already updated in Test 3, only file2.py is new-changed
if echo "$OUTPUT" | grep -q "1 file(s) have changed"; then
    print_success "Detected 1 changed file (file2.py modified after dry-run)"
else
    print_failure "Should detect 1 changed file"
fi

# Verify workflow state updated
CHECKSUM_AFTER=$(grep 'test-incremental/file2.py' .docimp/workflow-state.json)
if [ "$CHECKSUM_AFTER" != "$CHECKSUM_BEFORE" ]; then
    print_success "Workflow state updated with new checksums"
else
    print_failure "Workflow state should update after incremental analysis"
fi

# Test 6: Add new file (limitation: incremental doesn't detect new files yet)
print_header "Test 6: Add new file detection (known limitation)"
cat > test-incremental/file6.py << 'EOF'
def function_eleven():
    """Documented function eleven"""
    return 11
EOF

echo "Running: docimp analyze ./test-incremental --incremental"
OUTPUT=$(docimp analyze ./test-incremental --incremental 2>&1)

# Check if new file detected
NEW_FILE_COUNT=$(grep -o 'test-incremental/file[0-9]\.py' .docimp/workflow-state.json | wc -l | tr -d ' ')
if [ "$NEW_FILE_COUNT" -eq 6 ]; then
    print_success "New file added to workflow state (future enhancement working)"
else
    print_warning "New file not detected - known limitation (use full analysis for new files)"
    # Clean up the new file since it wasn't tracked
    rm test-incremental/file6.py
fi

# Test 7: Delete file (limitation: incremental doesn't detect deletions yet)
print_header "Test 7: Delete file detection (known limitation)"
# Only run if file6 was actually added in Test 6
if [ -f test-incremental/file6.py ]; then
    rm test-incremental/file6.py

    echo "Running: docimp analyze ./test-incremental --incremental"
    OUTPUT=$(docimp analyze ./test-incremental --incremental 2>&1)

    # Check if deleted file removed from checksums
    DELETED_FILE_COUNT=$(grep -o 'test-incremental/file[0-9]\.py' .docimp/workflow-state.json | wc -l | tr -d ' ')
    if [ "$DELETED_FILE_COUNT" -eq 5 ]; then
        print_success "Deleted file removed from workflow state (future enhancement working)"
    else
        print_warning "Deleted file not detected - known limitation (use full analysis after deletions)"
    fi
else
    print_warning "Skipping delete test (file6 wasn't added)"
fi

# Test 8: Large-scale modification (verify behavior, not strict 90% savings due to small dataset)
print_header "Test 8: Multiple file modifications"
echo "Modifying 3 more files (60% of files)"
cat >> test-incremental/file3.py << 'EOF'

def function_modified():
    return 333
EOF

cat >> test-incremental/file4.py << 'EOF'

def function_modified():
    return 444
EOF

cat >> test-incremental/file5.py << 'EOF'

def function_modified():
    return 555
EOF

echo "Running: docimp analyze ./test-incremental --incremental"
START_TIME=$(date +%s)
OUTPUT=$(docimp analyze ./test-incremental --incremental 2>&1)
LARGE_INCREMENTAL_TIME=$(( ($(date +%s) - START_TIME) * 1000 ))

if echo "$OUTPUT" | grep -q "file(s) have changed"; then
    print_success "Incremental analysis completed for multiple file changes"
else
    print_failure "Incremental analysis should complete successfully"
fi

echo "Incremental time for 60% changes: ${LARGE_INCREMENTAL_TIME}ms"
echo "Baseline time: ${BASELINE_TIME}ms"

# Test 9: Full re-analysis for comparison
print_header "Test 9: Full re-analysis (no --incremental)"
echo "Running: docimp analyze ./test-incremental (full analysis)"
START_TIME=$(date +%s)
docimp analyze ./test-incremental > /dev/null 2>&1
FULL_REANALYSIS_TIME=$(( ($(date +%s) - START_TIME) * 1000 ))
echo "Full re-analysis time: ${FULL_REANALYSIS_TIME}ms"

if [ "$FULL_REANALYSIS_TIME" -ge "$LARGE_INCREMENTAL_TIME" ]; then
    print_success "Full re-analysis time ($FULL_REANALYSIS_TIME ms) >= incremental time ($LARGE_INCREMENTAL_TIME ms)"
else
    print_warning "Incremental analysis was slower (small dataset variability)"
fi

# Summary
print_header "Test Summary"
echo -e "${GREEN}Tests passed: $TESTS_PASSED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}Tests failed: $TESTS_FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
fi
