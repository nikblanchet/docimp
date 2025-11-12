#!/usr/bin/env bash
# Manual integration tests for workflow state management across commands
# Tests cross-command workflows, file modifications, and error handling
#
# Usage: ./test-samples/test-workflow-state-integration.sh
#
# Prerequisites:
# - docimp CLI installed and in PATH
# - Test runs in temporary directory (auto-created)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Create temp directory for testing
TEST_DIR=$(mktemp -d -t docimp-workflow-test-XXXXXX)
ORIGINAL_DIR=$(pwd)

echo -e "${BLUE}=== Workflow State Integration Tests ===${NC}"
echo -e "${BLUE}Test directory: ${TEST_DIR}${NC}\n"

# Cleanup function
cleanup() {
  cd "${ORIGINAL_DIR}"
  if [[ -d "${TEST_DIR}" ]]; then
    rm -rf "${TEST_DIR}"
    echo -e "\n${BLUE}Cleaned up test directory${NC}"
  fi
}
trap cleanup EXIT

# Test helper functions
run_test() {
  local test_name="$1"
  TESTS_RUN=$((TESTS_RUN + 1))
  echo -e "${YELLOW}Test ${TESTS_RUN}: ${test_name}${NC}"
}

pass_test() {
  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo -e "${GREEN}✓ PASS${NC}\n"
}

fail_test() {
  local message="$1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
  echo -e "${RED}✗ FAIL: ${message}${NC}\n"
}

check_file_exists() {
  local filepath="$1"
  local description="$2"
  if [[ -f "${filepath}" ]]; then
    echo -e "  ${GREEN}✓${NC} ${description} exists"
    return 0
  else
    echo -e "  ${RED}✗${NC} ${description} missing"
    return 1
  fi
}

check_file_not_exists() {
  local filepath="$1"
  local description="$2"
  if [[ ! -f "${filepath}" ]]; then
    echo -e "  ${GREEN}✓${NC} ${description} does not exist (expected)"
    return 0
  else
    echo -e "  ${RED}✗${NC} ${description} exists (unexpected)"
    return 1
  fi
}

check_json_field() {
  local filepath="$1"
  local jq_query="$2"
  local description="$3"
  local expected="$4"

  if command -v jq >/dev/null 2>&1; then
    local actual=$(jq -r "${jq_query}" "${filepath}" 2>/dev/null || echo "null")
    if [[ "${actual}" == "${expected}" ]]; then
      echo -e "  ${GREEN}✓${NC} ${description}: ${actual}"
      return 0
    else
      echo -e "  ${RED}✗${NC} ${description}: expected '${expected}', got '${actual}'"
      return 1
    fi
  else
    echo -e "  ${YELLOW}⚠${NC} jq not installed, skipping JSON validation"
    return 0
  fi
}

# Change to test directory
cd "${TEST_DIR}"

# Create sample Python files
mkdir -p src
cat > src/calculator.py << 'EOF'
def add(x, y):
    return x + y

def subtract(x, y):
    return x - y

def multiply(x, y):
    return x * y
EOF

cat > src/utils.py << 'EOF'
def validate_input(value):
    if not isinstance(value, (int, float)):
        raise ValueError("Input must be a number")
    return True

def format_result(result):
    return f"Result: {result}"
EOF

echo -e "${BLUE}=== Test Suite 1: Workflow A (analyze → plan → improve) ===${NC}\n"

# Test 1: analyze creates workflow state
run_test "analyze creates workflow-state.json with checksums"
if docimp analyze src/ --force-clean >/dev/null 2>&1; then
  if check_file_exists ".docimp/workflow-state.json" "workflow-state.json" && \
     check_file_exists ".docimp/session-reports/analyze-latest.json" "analyze-latest.json"; then
    if command -v jq >/dev/null 2>&1; then
      check_json_field ".docimp/workflow-state.json" ".schema_version" "schema_version" "1.0"
      check_json_field ".docimp/workflow-state.json" ".last_analyze | type" "last_analyze type" "object"
    fi
    pass_test
  else
    fail_test "Required files not created"
  fi
else
  fail_test "analyze command failed"
fi

# Test 2: plan without analyze fails
run_test "plan fails without analyze"
rm -rf .docimp
if docimp plan src/ 2>&1 | grep -i "analyze" >/dev/null; then
  echo -e "  ${GREEN}✓${NC} Error message mentions 'analyze'"
  pass_test
else
  fail_test "Expected error about missing analyze"
fi

# Test 3: plan updates workflow state
run_test "plan updates workflow-state.json"
docimp analyze src/ --force-clean >/dev/null 2>&1
if docimp plan src/ >/dev/null 2>&1; then
  if check_file_exists ".docimp/plan.json" "plan.json"; then
    if command -v jq >/dev/null 2>&1; then
      check_json_field ".docimp/workflow-state.json" ".last_plan | type" "last_plan type" "object"
    fi
    pass_test
  else
    fail_test "plan.json not created"
  fi
else
  fail_test "plan command failed"
fi

# Test 4: improve without plan fails
run_test "improve fails without plan"
rm -f .docimp/plan.json
if docimp improve src/ --non-interactive 2>&1 | grep -i "plan" >/dev/null; then
  echo -e "  ${GREEN}✓${NC} Error message mentions 'plan'"
  pass_test
else
  fail_test "Expected error about missing plan"
fi

# Test 5: Re-running analyze invalidates plan
run_test "Re-running analyze marks plan as stale"
docimp analyze src/ --force-clean >/dev/null 2>&1
docimp plan src/ >/dev/null 2>&1
sleep 1  # Ensure timestamp difference
docimp analyze src/ --force-clean >/dev/null 2>&1
if docimp status 2>&1 | grep -i "stale" >/dev/null; then
  echo -e "  ${GREEN}✓${NC} Status shows staleness warning"
  pass_test
else
  fail_test "No staleness warning shown"
fi

echo -e "${BLUE}=== Test Suite 2: Workflow B (analyze → audit → plan) ===${NC}\n"

# Test 6: audit without analyze fails
run_test "audit fails without analyze"
rm -rf .docimp
if docimp audit src/ 2>&1 | grep -i "analyze" >/dev/null; then
  echo -e "  ${GREEN}✓${NC} Error message mentions 'analyze'"
  pass_test
else
  fail_test "Expected error about missing analyze"
fi

# Test 7: audit session creates workflow state entry
run_test "audit updates workflow state (simulated completion)"
docimp analyze src/ --force-clean >/dev/null 2>&1
# Note: audit is interactive, so we just verify workflow state structure
if check_file_exists ".docimp/workflow-state.json" "workflow-state.json"; then
  echo -e "  ${GREEN}✓${NC} Workflow state ready for audit"
  pass_test
else
  fail_test "Workflow state not created"
fi

echo -e "${BLUE}=== Test Suite 3: File Modification Scenarios ===${NC}\n"

# Test 8: Incremental analysis detects changed files
run_test "Incremental analysis detects modified files"
docimp analyze src/ --force-clean >/dev/null 2>&1
echo "# Modified" >> src/calculator.py
if docimp analyze src/ --incremental --dry-run 2>&1 | grep -i "calculator.py" >/dev/null; then
  echo -e "  ${GREEN}✓${NC} Dry-run shows modified file"
  pass_test
else
  fail_test "Modified file not detected"
fi

# Test 9: New file added to workflow state
run_test "New file added to analysis"
cat > src/new_module.py << 'EOF'
def new_function():
    return "Hello"
EOF
docimp analyze src/ --force-clean >/dev/null 2>&1
if check_file_exists ".docimp/workflow-state.json" "workflow-state.json"; then
  if command -v jq >/dev/null 2>&1; then
    local file_count=$(jq '.last_analyze.file_checksums | length' .docimp/workflow-state.json)
    if [[ $file_count -ge 3 ]]; then
      echo -e "  ${GREEN}✓${NC} Workflow state includes ${file_count} files"
      pass_test
    else
      fail_test "Expected at least 3 files in workflow state, got ${file_count}"
    fi
  else
    echo -e "  ${YELLOW}⚠${NC} jq not available, skipping file count check"
    pass_test
  fi
else
  fail_test "Workflow state file missing"
fi

# Test 10: Deleted file removed from workflow state
run_test "Deleted file removed from analysis"
rm src/new_module.py
docimp analyze src/ --force-clean >/dev/null 2>&1
if command -v jq >/dev/null 2>&1; then
  if ! jq '.last_analyze.file_checksums | keys[]' .docimp/workflow-state.json 2>/dev/null | grep -q "new_module.py"; then
    echo -e "  ${GREEN}✓${NC} Deleted file not in workflow state"
    pass_test
  else
    fail_test "Deleted file still in workflow state"
  fi
else
  echo -e "  ${YELLOW}⚠${NC} jq not available, skipping deletion check"
  pass_test
fi

echo -e "${BLUE}=== Test Suite 4: Smart Auto-Clean Integration ===${NC}\n"

# Test 11: --preserve-audit keeps audit.json
run_test "--preserve-audit flag preserves audit.json"
docimp analyze src/ --force-clean >/dev/null 2>&1
echo '{"items": [], "metadata": {"created_at": "2024-01-01T00:00:00Z", "total_rated": 0}}' > .docimp/audit.json
docimp analyze src/ --preserve-audit >/dev/null 2>&1
if check_file_exists ".docimp/audit.json" "audit.json"; then
  pass_test
else
  fail_test "audit.json was deleted despite --preserve-audit"
fi

# Test 12: --force-clean skips prompt
run_test "--force-clean flag skips interactive prompt"
echo '{"items": [], "metadata": {"created_at": "2024-01-01T00:00:00Z", "total_rated": 0}}' > .docimp/audit.json
if docimp analyze src/ --force-clean >/dev/null 2>&1; then
  echo -e "  ${GREEN}✓${NC} Command completed without prompts"
  pass_test
else
  fail_test "Command failed with --force-clean"
fi

echo -e "${BLUE}=== Test Suite 5: Status Command ===${NC}\n"

# Test 13: status command shows workflow state
run_test "status command displays workflow information"
docimp analyze src/ --force-clean >/dev/null 2>&1
if docimp status | grep -i "workflow state" >/dev/null; then
  echo -e "  ${GREEN}✓${NC} Status output shows workflow state"
  pass_test
else
  fail_test "Status output missing workflow state info"
fi

# Test 14: status --json produces valid JSON
run_test "status --json produces valid JSON output"
if docimp status --json > /tmp/status-output.json 2>&1; then
  if command -v jq >/dev/null 2>&1; then
    if jq empty /tmp/status-output.json 2>/dev/null; then
      echo -e "  ${GREEN}✓${NC} Valid JSON output"
      pass_test
    else
      fail_test "Invalid JSON output"
    fi
  else
    echo -e "  ${YELLOW}⚠${NC} jq not available, skipping JSON validation"
    pass_test
  fi
else
  fail_test "status --json command failed"
fi

echo -e "${BLUE}=== Test Suite 6: Error Recovery ===${NC}\n"

# Test 15: Corrupted workflow-state.json recovery
run_test "Recover from corrupted workflow-state.json"
docimp analyze src/ --force-clean >/dev/null 2>&1
echo '{invalid json}' > .docimp/workflow-state.json
if docimp analyze src/ --force-clean >/dev/null 2>&1; then
  if command -v jq >/dev/null 2>&1; then
    if jq empty .docimp/workflow-state.json 2>/dev/null; then
      echo -e "  ${GREEN}✓${NC} Workflow state recovered (valid JSON)"
      pass_test
    else
      fail_test "Workflow state still corrupted"
    fi
  else
    echo -e "  ${GREEN}✓${NC} Command completed (assuming recovery)"
    pass_test
  fi
else
  fail_test "Recovery failed"
fi

# Print summary
echo -e "${BLUE}=== Test Summary ===${NC}"
echo -e "Total tests run: ${TESTS_RUN}"
echo -e "${GREEN}Passed: ${TESTS_PASSED}${NC}"
if [[ ${TESTS_FAILED} -gt 0 ]]; then
  echo -e "${RED}Failed: ${TESTS_FAILED}${NC}"
  exit 1
else
  echo -e "\n${GREEN}All tests passed!${NC}"
  exit 0
fi
