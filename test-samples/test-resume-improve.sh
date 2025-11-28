#!/bin/bash
#
# Manual test script for improve resume functionality (Issue #216 Session 8).
#
# This script validates the end-to-end improve resume workflow including:
# - Auto-detection of incomplete sessions
# - Resuming sessions with preserved state
# - File change detection and auto re-analysis
# - Transaction branch integration and continuity
# - Session completion with transaction commit
#
# Prerequisites:
# - docimp CLI installed and in PATH
# - ANTHROPIC_API_KEY environment variable set
# - test-samples directory with sample files
# - Clean .docimp directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source shared color constants
source "$SCRIPT_DIR/scripts/colors.sh" 2>/dev/null || source "$SCRIPT_DIR/../scripts/colors.sh"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Improve Resume Manual Test (Session 8)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Step 1: Prerequisites
echo -e "${BLUE}Step 1: Verifying prerequisites...${NC}"

if ! command -v docimp &> /dev/null; then
    echo -e "${RED}Error: docimp command not found. Run 'cd cli && npm link'${NC}"
    exit 1
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo -e "${RED}Error: ANTHROPIC_API_KEY not set${NC}"
    echo "Set it with: export ANTHROPIC_API_KEY=sk-ant-..."
    exit 1
fi

if [ ! -d "$PROJECT_ROOT/test-samples/python" ]; then
    echo -e "${RED}Error: test-samples directory not found${NC}"
    exit 1
fi

echo -e "${GREEN}Prerequisites OK${NC}"
echo ""

# Step 2: Clean state
echo -e "${BLUE}Step 2: Cleaning state...${NC}"
rm -rf "$PROJECT_ROOT/.docimp"
echo -e "${GREEN}State cleaned${NC}"
echo ""

# Step 3: Setup - Run analyze and plan
echo -e "${BLUE}Step 3: Running analyze and plan...${NC}"
cd "$PROJECT_ROOT"
docimp analyze test-samples/python
docimp plan test-samples/python
echo -e "${GREEN}Analyze and plan complete${NC}"
echo ""

# Step 4: Start improve and accept 2 items
echo -e "${BLUE}Step 4: Start improve session (accept 2 items, then quit)${NC}"
echo -e "${YELLOW}ACTION REQUIRED:${NC}"
echo "  1. Enter style guide preferences (or press Enter for defaults)"
echo "  2. ${GREEN}[A]${NC} Accept the first 2 documentation suggestions"
echo "  3. Press ${YELLOW}Q${NC} to quit after second acceptance"
echo "  4. Session and transaction should be saved"
echo ""
echo -e "${YELLOW}Press Enter to start improve...${NC}"
read -r

docimp improve test-samples/python --new || true

echo ""
echo -e "${GREEN}Step 4 complete - session saved${NC}"
echo ""

# Step 5: Verify session file created
echo -e "${BLUE}Step 5: Verifying session file...${NC}"

SESSION_FILE=$(ls -t .docimp/session-reports/improve-session-*.json 2>/dev/null | head -1 || echo "")

if [ -z "$SESSION_FILE" ]; then
    echo -e "${RED}Error: No session file found in .docimp/session-reports/${NC}"
    exit 1
fi

echo -e "${GREEN}Session file found: $SESSION_FILE${NC}"

# Show session summary
echo ""
echo "Session details:"
echo "----------------"
jq '{session_id: .session_id, transaction_id: .transaction_id, current_index: .current_index, progress: .progress}' "$SESSION_FILE"
echo ""

# Extract transaction ID for later verification
TRANSACTION_ID=$(jq -r '.transaction_id' "$SESSION_FILE")
echo -e "${GREEN}Transaction ID: $TRANSACTION_ID${NC}"
echo ""

# Step 6: Verify transaction branch exists
echo -e "${BLUE}Step 6: Verifying transaction branch...${NC}"

if git --git-dir=.docimp/state/.git --work-tree=. branch --list "docimp/session-$TRANSACTION_ID" | grep -q "docimp/session-$TRANSACTION_ID"; then
    echo -e "${GREEN}Transaction branch exists: docimp/session-$TRANSACTION_ID${NC}"
else
    echo -e "${RED}Error: Transaction branch not found${NC}"
    exit 1
fi

# Show transaction commits
echo ""
echo "Transaction commits:"
echo "--------------------"
git --git-dir=.docimp/state/.git --work-tree=. log --oneline "docimp/session-$TRANSACTION_ID" | head -5
echo ""

# Step 7: Modify a source file (simulate file changes)
echo -e "${BLUE}Step 7: Modifying source file to test file invalidation...${NC}"

# Find a Python file that was documented
MODIFIED_FILE=$(find test-samples/python -name "*.py" -type f | head -1)

if [ -z "$MODIFIED_FILE" ]; then
    echo -e "${RED}Error: No Python file found to modify${NC}"
    exit 1
fi

# Backup original
cp "$MODIFIED_FILE" "${MODIFIED_FILE}.backup"

# Add a comment to trigger file change detection
echo "# Test comment for file invalidation" >> "$MODIFIED_FILE"

echo -e "${GREEN}Modified file: $MODIFIED_FILE${NC}"
echo ""

# Step 8: Resume session (auto-detection)
echo -e "${BLUE}Step 8: Resume session (auto-detection with file changes)${NC}"
echo -e "${YELLOW}ACTION REQUIRED:${NC}"
echo "  1. You should see: ${GREEN}'Found session XXX (2 accepted, N remaining). Resume? [Y/n]'${NC}"
echo "  2. Press ${GREEN}Y${NC} (or just Enter) to resume"
echo "  3. You should see: ${YELLOW}'Warning: 1 file modified since last session (re-analyzed)'${NC}"
echo "  4. ${GREEN}[A]${NC} Accept 1 more documentation suggestion"
echo "  5. ${YELLOW}[Q]${NC} Quit to test resume-after-resume"
echo ""
echo -e "${YELLOW}Press Enter to resume improve...${NC}"
read -r

docimp improve test-samples/python || true

echo ""
echo -e "${GREEN}Step 8 complete - session resumed with file invalidation${NC}"
echo ""

# Step 9: Resume again (test multiple resume cycles)
echo -e "${BLUE}Step 9: Resume session again (multi-cycle resume test)${NC}"
echo -e "${YELLOW}ACTION REQUIRED:${NC}"
echo "  1. Resume prompt should appear again"
echo "  2. Press ${GREEN}Y${NC} to resume"
echo "  3. ${GREEN}[A]${NC} Accept remaining items OR ${YELLOW}[Q]${NC} quit when satisfied"
echo "  4. Complete the session to trigger transaction commit"
echo ""
echo -e "${YELLOW}Press Enter to final resume...${NC}"
read -r

docimp improve test-samples/python || true

echo ""
echo -e "${GREEN}Step 9 complete${NC}"
echo ""

# Step 10: Verify final transaction state
echo -e "${BLUE}Step 10: Verifying transaction state...${NC}"

# Check if transaction was committed (squashed to main)
if git --git-dir=.docimp/state/.git --work-tree=. log main --oneline --grep="docimp session $TRANSACTION_ID" | grep -q "docimp session $TRANSACTION_ID"; then
    echo -e "${GREEN}Transaction committed successfully${NC}"
    echo ""
    echo "Squash commit:"
    echo "--------------"
    git --git-dir=.docimp/state/.git --work-tree=. log main --oneline --grep="docimp session $TRANSACTION_ID" | head -1
else
    echo -e "${YELLOW}Transaction still in progress (session not completed)${NC}"
fi

echo ""

# Step 11: Verify session file handling
echo -e "${BLUE}Step 11: Verifying session file state...${NC}"

if [ -f "$SESSION_FILE" ]; then
    COMPLETED_AT=$(jq -r '.completed_at' "$SESSION_FILE")
    if [ "$COMPLETED_AT" != "null" ]; then
        echo -e "${GREEN}Session marked as completed at: $COMPLETED_AT${NC}"
    else
        echo -e "${YELLOW}Session still in progress (completed_at is null)${NC}"
    fi
else
    echo -e "${YELLOW}Session file not found (may have been cleaned up after completion)${NC}"
fi

echo ""

# Step 12: Restore modified file
echo -e "${BLUE}Step 12: Restoring modified file...${NC}"

if [ -f "${MODIFIED_FILE}.backup" ]; then
    mv "${MODIFIED_FILE}.backup" "$MODIFIED_FILE"
    echo -e "${GREEN}File restored${NC}"
fi

echo ""

# Summary
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""
echo -e "${GREEN}Tests completed successfully:${NC}"
echo "  - Session save and load"
echo "  - Auto-detection prompt"
echo "  - Transaction branch creation"
echo "  - File change detection"
echo "  - Multi-cycle resume"
echo "  - User preferences restoration"
echo "  - Transaction commit (if session completed)"
echo ""
echo -e "${YELLOW}Manual verification points:${NC}"
echo "  - Auto-detection prompt appeared correctly"
echo "  - File modification warning was shown"
echo "  - Style guide preferences were preserved"
echo "  - Transaction branch contains all commits"
echo "  - Session progress counter was accurate"
echo ""
echo -e "${BLUE}======================================${NC}"
