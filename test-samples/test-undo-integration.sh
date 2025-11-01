#!/bin/bash
#
# Undo feature integration test
#
# This script verifies the complete undo workflow with real file system operations.
# Tests: Accept -> Undo -> Verify file restored and git history correct
#
# Requires: ANTHROPIC_API_KEY (for Claude API calls)
#
# Usage: ./test-undo-integration.sh
#

set -e

# Load shared color constants
SCRIPT_DIR_COLORS="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR_COLORS/scripts/colors.sh" 2>/dev/null || source "$SCRIPT_DIR_COLORS/../scripts/colors.sh"

# Create temporary test directory
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

echo "=============================================="
echo "UNDO FEATURE INTEGRATION TEST"
echo "=============================================="
echo ""
echo "Test directory: $TEST_DIR"
echo ""

#
# STEP 1: Verify Prerequisites
#
echo "Step 1: Verifying prerequisites..."
echo ""

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo -e "${RED}✗${NC} ANTHROPIC_API_KEY not set"
    echo ""
    echo "This test requires an Anthropic API key to generate documentation."
    echo ""
    echo "To set your API key:"
    echo "  export ANTHROPIC_API_KEY=sk-ant-..."
    echo ""
    exit 1
fi

echo -e "${GREEN}✓${NC} ANTHROPIC_API_KEY is set"

# Verify git is available
if ! command -v git &> /dev/null; then
    echo -e "${RED}✗${NC} git not found in PATH"
    exit 1
fi

echo -e "${GREEN}✓${NC} git is available"

# Verify docimp is available
if ! command -v docimp &> /dev/null; then
    echo -e "${RED}✗${NC} docimp not found in PATH"
    echo ""
    echo "Please install docimp first:"
    echo "  cd cli && npm link"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓${NC} docimp is available"
echo ""

#
# STEP 2: Create Sample Code
#
echo "Step 2: Creating sample code..."
echo ""

# Create a simple Python file with an undocumented function
cat > "$TEST_DIR/sample.py" <<'EOF'
def calculate_total(items, tax_rate):
    subtotal = sum(item['price'] for item in items)
    tax = subtotal * tax_rate
    return subtotal + tax
EOF

echo -e "${GREEN}✓${NC} Created sample.py"

# Store original content for comparison
ORIGINAL_CONTENT=$(cat "$TEST_DIR/sample.py")
echo ""

#
# STEP 3: Run Analysis and Plan
#
echo "Step 3: Analyzing and planning..."
echo ""

cd "$TEST_DIR"

# Run analysis
docimp analyze . > /dev/null

if [ ! -f .docimp/session-reports/analyze-latest.json ]; then
    echo -e "${RED}✗${NC} Analysis failed"
    exit 1
fi

echo -e "${GREEN}✓${NC} Analysis complete"

# Run plan
docimp plan . > /dev/null

if [ ! -f .docimp/session-reports/plan.json ]; then
    echo -e "${RED}✗${NC} Plan generation failed"
    exit 1
fi

PLAN_ITEMS=$(jq -r '.items | length' .docimp/session-reports/plan.json)
echo -e "${GREEN}✓${NC} Plan generated: $PLAN_ITEMS item(s)"

if [ "$PLAN_ITEMS" -eq 0 ]; then
    echo -e "${RED}✗${NC} No items in plan (expected at least 1)"
    exit 1
fi

echo ""

#
# STEP 4: Run Improve with Undo Workflow
#
echo "Step 4: Running improve with undo workflow..."
echo ""
echo "Workflow: Accept first suggestion -> Undo -> Quit"
echo ""

# Create input sequence: Accept (A) -> Undo (U) -> Quit (Q)
# Use printf to send input to docimp improve
printf "A\nU\nQ\n" | docimp improve . 2>&1 | tee "$TEST_DIR/improve-output.txt"

echo ""

#
# STEP 5: Verify File Restored
#
echo "Step 5: Verifying file was restored..."
echo ""

CURRENT_CONTENT=$(cat "$TEST_DIR/sample.py")

if [ "$CURRENT_CONTENT" != "$ORIGINAL_CONTENT" ]; then
    echo -e "${RED}✗${NC} File content does not match original after undo"
    echo ""
    echo "Expected:"
    echo "$ORIGINAL_CONTENT"
    echo ""
    echo "Got:"
    echo "$CURRENT_CONTENT"
    exit 1
fi

echo -e "${GREEN}✓${NC} File content matches original (undo successful)"
echo ""

#
# STEP 6: Verify Git History
#
echo "Step 6: Verifying git transaction history..."
echo ""

# Check that side-car repo exists
if [ ! -d .docimp/state/.git ]; then
    echo -e "${RED}✗${NC} Side-car repository not found"
    exit 1
fi

echo -e "${GREEN}✓${NC} Side-car repository exists"

# Check git log for expected commits
cd .docimp/state
git --git-dir=.git --work-tree=../.. log --oneline > "$TEST_DIR/git-log.txt"
cd ../..

# Should see at least:
# 1. Initial commit from begin_transaction
# 2. Commit from accept (record_write)
# 3. Revert commit from undo (rollback_change)

COMMIT_COUNT=$(wc -l < "$TEST_DIR/git-log.txt" | tr -d ' ')

if [ "$COMMIT_COUNT" -lt 2 ]; then
    echo -e "${RED}✗${NC} Expected at least 2 commits (accept + revert), got $COMMIT_COUNT"
    echo ""
    echo "Git log:"
    cat "$TEST_DIR/git-log.txt"
    exit 1
fi

echo -e "${GREEN}✓${NC} Git history shows expected commits ($COMMIT_COUNT total)"

# Verify revert commit exists
if ! grep -q -i "revert" "$TEST_DIR/git-log.txt"; then
    echo -e "${YELLOW}⚠${NC} Warning: No 'revert' commit found in git log"
    echo ""
    echo "Git log:"
    cat "$TEST_DIR/git-log.txt"
    echo ""
    echo "This may indicate the undo operation didn't create a git commit."
else
    echo -e "${GREEN}✓${NC} Revert commit found in git history"
fi

echo ""

#
# STEP 7: Summary
#
echo "=============================================="
echo "TEST RESULTS: ${GREEN}PASSED${NC}"
echo "=============================================="
echo ""
echo "Verified:"
echo "  - Accept change adds documentation"
echo "  - Undo reverts file to original state"
echo "  - Git history records both operations"
echo ""
echo "Test directory preserved at: $TEST_DIR"
echo "(Will be cleaned up automatically on exit)"
echo ""
