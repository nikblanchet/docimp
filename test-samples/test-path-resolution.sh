#!/usr/bin/env bash
#
# Integration test for PythonBridge path resolution (Issue #81)
#
# Tests that analyzer path detection works correctly when:
# - Running from project root
# - Running from subdirectory
# - Running from external directory
# - Running after npm link (simulated global install)
# - Using DOCIMP_ANALYZER_PATH environment variable
#

set -e  # Exit on error

# Source shared color constants
SCRIPT_DIR_COLORS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR_COLORS/scripts/colors.sh" 2>/dev/null || source "$SCRIPT_DIR_COLORS/../scripts/colors.sh"

echo -e "${YELLOW}Testing PythonBridge path resolution (Issue #81)${NC}"
echo ""

# Save original directory and state
ORIGINAL_DIR=$(pwd)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Function to cleanup on exit
cleanup() {
  echo ""
  echo -e "${YELLOW}Cleaning up...${NC}"
  cd "$PROJECT_ROOT/cli" 2>/dev/null || true
  npm unlink 2>/dev/null || true
  cd "$ORIGINAL_DIR"
  echo -e "${GREEN}Cleanup complete${NC}"
}

trap cleanup EXIT

# Test 1: Run from project root
echo -e "${YELLOW}Test 1: Running from project root${NC}"
cd "$PROJECT_ROOT"
npm --prefix cli run build > /dev/null 2>&1
./cli/dist/index.js analyze examples/ --format json > /dev/null
echo -e "${GREEN}✓ Test 1 passed${NC}"
echo ""

# Test 2: Run from subdirectory
echo -e "${YELLOW}Test 2: Running from subdirectory${NC}"
cd "$PROJECT_ROOT/examples"
"$PROJECT_ROOT/cli/dist/index.js" analyze . --format json > /dev/null
echo -e "${GREEN}✓ Test 2 passed${NC}"
echo ""

# Test 3: Run from completely different directory
echo -e "${YELLOW}Test 3: Running from /tmp directory${NC}"
cd /tmp
"$PROJECT_ROOT/cli/dist/index.js" analyze "$PROJECT_ROOT/examples" --format json > /dev/null
echo -e "${GREEN}✓ Test 3 passed${NC}"
echo ""

# Test 4: Test with npm link (simulate global installation)
echo -e "${YELLOW}Test 4: Testing with npm link (simulated global install)${NC}"
cd "$PROJECT_ROOT/cli"
npm link > /dev/null 2>&1
cd /tmp
docimp analyze "$PROJECT_ROOT/examples" --format json > /dev/null
echo -e "${GREEN}✓ Test 4 passed${NC}"
echo ""

# Test 5: Test with DOCIMP_ANALYZER_PATH environment variable
echo -e "${YELLOW}Test 5: Testing DOCIMP_ANALYZER_PATH override${NC}"
export DOCIMP_ANALYZER_PATH="$PROJECT_ROOT/analyzer"
cd /tmp
docimp analyze "$PROJECT_ROOT/examples" --format json > /dev/null
unset DOCIMP_ANALYZER_PATH
echo -e "${GREEN}✓ Test 5 passed${NC}"
echo ""

# Test 6: Test error when DOCIMP_ANALYZER_PATH is invalid
echo -e "${YELLOW}Test 6: Testing error for invalid DOCIMP_ANALYZER_PATH${NC}"
export DOCIMP_ANALYZER_PATH="/nonexistent/path"
cd /tmp
if docimp analyze "$PROJECT_ROOT/examples" --format json > /dev/null 2>&1; then
  echo -e "${RED}✗ Test 6 failed: Should have thrown error for invalid path${NC}"
  exit 1
else
  echo -e "${GREEN}✓ Test 6 passed (correctly rejected invalid path)${NC}"
fi
unset DOCIMP_ANALYZER_PATH
echo ""

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}All path resolution tests passed!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
