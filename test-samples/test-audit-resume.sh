#!/bin/bash
#
# Manual test script for audit resume functionality (Issue #216 Session 3).
#
# This script validates the end-to-end audit resume workflow including:
# - Auto-detection of incomplete sessions
# - Resuming sessions with preserved state
# - File change detection and auto re-analysis
# - Session completion and cleanup
#
# Prerequisites:
# - docimp CLI installed and in PATH
# - test-samples directory with sample files
# - Clean .docimp/session-reports directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}Audit Resume Manual Test (Session 3)${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Step 1: Prerequisites
echo -e "${BLUE}Step 1: Verifying prerequisites...${NC}"

if ! command -v docimp &> /dev/null; then
    echo -e "${RED}Error: docimp command not found. Run 'cd cli && npm link'${NC}"
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
rm -rf "$PROJECT_ROOT/.docimp/session-reports/"
rm -f "$PROJECT_ROOT/.docimp-audit.json"
echo -e "${GREEN}State cleaned${NC}"
echo ""

# Step 3: Start audit and rate 2 items
echo -e "${BLUE}Step 3: Start audit session (rate 2 items, then quit)${NC}"
echo -e "${YELLOW}ACTION REQUIRED:${NC}"
echo "  1. Rate the first 2 functions/classes"
echo "  2. Press ${YELLOW}Q${NC} to quit after second rating"
echo "  3. Session should be saved to .docimp/session-reports/"
echo ""
echo -e "${YELLOW}Press Enter to start audit...${NC}"
read -r

cd "$PROJECT_ROOT"
docimp audit test-samples/python --new || true

echo ""
echo -e "${GREEN}Step 3 complete - session saved${NC}"
echo ""

# Step 4: Verify session file created
echo -e "${BLUE}Step 4: Verifying session file...${NC}"

SESSION_FILE=$(ls -t .docimp/session-reports/audit-session-*.json 2>/dev/null | head -1 || echo "")

if [ -z "$SESSION_FILE" ]; then
    echo -e "${RED}Error: No session file found in .docimp/session-reports/${NC}"
    exit 1
fi

echo -e "${GREEN}Session file found: $SESSION_FILE${NC}"

# Show session summary
echo ""
echo "Session details:"
echo "----------------"
jq '{session_id: .session_id, current_index: .current_index, total_items: .total_items}' "$SESSION_FILE"
echo ""

# Step 5: Resume session (auto-detection)
echo -e "${BLUE}Step 5: Resume session (auto-detection)${NC}"
echo -e "${YELLOW}ACTION REQUIRED:${NC}"
echo "  1. You should see: ${GREEN}'Found session XXX (N/M rated, Xs ago). Resume? [Y/n]'${NC}"
echo "  2. Press ${GREEN}Y${NC} (or just Enter) to resume"
echo "  3. Continue rating remaining items"
echo "  4. Complete the audit (rate all items)"
echo ""
echo -e "${YELLOW}Press Enter to resume audit...${NC}"
read -r

docimp audit test-samples/python

echo ""
echo -e "${GREEN}Step 5 complete - audit finished${NC}"
echo ""

# Step 6: Verify session auto-deleted
echo -e "${BLUE}Step 6: Verifying session auto-deleted...${NC}"

REMAINING_SESSIONS=$(ls .docimp/session-reports/audit-session-*.json 2>/dev/null | wc -l | tr -d ' ')

if [ "$REMAINING_SESSIONS" != "0" ]; then
    echo -e "${RED}Warning: Expected 0 incomplete sessions, found $REMAINING_SESSIONS${NC}"
    echo "Session files:"
    ls -l .docimp/session-reports/audit-session-*.json
else
    echo -e "${GREEN}Session auto-deleted after completion (expected)${NC}"
fi

# Verify audit.json created
if [ ! -f ".docimp/session-reports/audit.json" ]; then
    echo -e "${RED}Error: audit.json not created${NC}"
    exit 1
fi

echo -e "${GREEN}audit.json created with final ratings${NC}"
echo ""

# Step 7: Test file change detection
echo -e "${BLUE}Step 7: Testing file change detection${NC}"
echo -e "${YELLOW}ACTION REQUIRED:${NC}"
echo "  1. Modify a file in test-samples/python (add a comment)"
echo "  2. Run audit again"
echo "  3. You should see: ${YELLOW}'Warning: N file(s) modified since last session'${NC}"
echo ""
echo -e "${YELLOW}Press Enter when ready to continue (after modifying a file)...${NC}"
read -r

# Start new audit session on modified files
docimp audit test-samples/python --new

echo ""
echo -e "${GREEN}Step 7 complete - file change detection working${NC}"
echo ""

# Step 8: Test --clear-session flag
echo -e "${BLUE}Step 8: Testing --clear-session flag${NC}"

# Create incomplete session
echo "Creating incomplete session..."
docimp audit test-samples/python --new &
AUDIT_PID=$!
sleep 2
kill $AUDIT_PID 2>/dev/null || true
wait $AUDIT_PID 2>/dev/null || true

# Clear sessions
echo "Clearing incomplete sessions..."
docimp audit test-samples/python --clear-session

REMAINING_SESSIONS=$(ls .docimp/session-reports/audit-session-*.json 2>/dev/null | wc -l | tr -d ' ')

if [ "$REMAINING_SESSIONS" != "0" ]; then
    echo -e "${RED}Error: --clear-session did not delete sessions${NC}"
    exit 1
fi

echo -e "${GREEN}--clear-session working correctly${NC}"
echo ""

# Validation summary
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}Validation Summary${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""
echo -e "${GREEN}MANUAL VALIDATION CHECKLIST:${NC}"
echo ""
echo "[${YELLOW} ${NC}] Session auto-detection prompted with progress (N/M rated, Xs ago)"
echo "[${YELLOW} ${NC}] Resume loaded previous ratings (didn't re-prompt for rated items)"
echo "[${YELLOW} ${NC}] Session auto-deleted after completion"
echo "[${YELLOW} ${NC}] audit.json contains all final ratings"
echo "[${YELLOW} ${NC}] File change warning displayed on modified files"
echo "[${YELLOW} ${NC}] --clear-session deleted incomplete sessions"
echo ""
echo -e "${YELLOW}Mark each item above as complete if observed during testing.${NC}"
echo ""

# Restore state
echo -e "${BLUE}Restore state?${NC} [y/N]"
read -r RESTORE

if [[ "$RESTORE" =~ ^[Yy]$ ]]; then
    echo "Restoring..."
    rm -rf "$PROJECT_ROOT/.docimp/session-reports/"
    rm -f "$PROJECT_ROOT/.docimp-audit.json"
    echo -e "${GREEN}State restored${NC}"
else
    echo -e "${YELLOW}State preserved for inspection${NC}"
fi

echo ""
echo -e "${GREEN}Audit resume manual test complete!${NC}"
