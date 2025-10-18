#!/bin/bash
#
# Improve command manual testing procedure
#
# This script provides a documented testing procedure for the improve command.
# Requires ANTHROPIC_API_KEY and manual interaction.
#
# Future enhancement: Automate by mocking ClaudeClient responses.
#
# Usage: ./test-workflows-improve.sh
#

set -e

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Change to test project directory
cd "$(dirname "$0")/example-project" || exit 1

echo "=============================================="
echo "IMPROVE COMMAND MANUAL TESTING PROCEDURE"
echo "=============================================="
echo ""

#
# STEP 1: Verify Prerequisites
#
echo "Step 1: Verifying prerequisites..."
echo ""

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo -e "${RED}✗${NC} ANTHROPIC_API_KEY not set"
    echo ""
    echo "The improve command requires an Anthropic API key to generate documentation."
    echo ""
    echo "To set your API key:"
    echo "  export ANTHROPIC_API_KEY=sk-ant-..."
    echo ""
    echo "You can find your API key at: https://console.anthropic.com/"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓${NC} ANTHROPIC_API_KEY is set"
echo ""

#
# STEP 2: Clean State
#
echo "Step 2: Cleaning state..."
echo ""

# Remove old state directory
rm -rf .docimp/
echo -e "${GREEN}✓${NC} Removed .docimp/ directory"

# Restore files to clean state
git restore . 2>/dev/null || true
echo -e "${GREEN}✓${NC} Restored files to original state"
echo ""

#
# STEP 3: Run Analysis
#
echo "Step 3: Analyzing codebase..."
echo ""
echo "Running: docimp analyze ."
echo ""

docimp analyze .

if [ ! -f .docimp/session-reports/analyze-latest.json ]; then
    echo -e "${RED}✗${NC} Analysis failed - no analyze-latest.json found"
    exit 1
fi

TOTAL_ITEMS=$(jq -r '.total_items' .docimp/session-reports/analyze-latest.json 2>/dev/null || echo "unknown")
echo ""
echo -e "${GREEN}✓${NC} Analysis complete: $TOTAL_ITEMS items found"
echo ""

#
# STEP 4: Generate Plan
#
echo "Step 4: Generating improvement plan..."
echo ""
echo "Running: docimp plan ."
echo ""

docimp plan .

if [ ! -f .docimp/session-reports/plan.json ]; then
    echo -e "${RED}✗${NC} Plan generation failed - no plan.json found"
    exit 1
fi

PLAN_ITEMS=$(jq -r '.items | length' .docimp/session-reports/plan.json 2>/dev/null || echo "0")
echo ""
echo -e "${GREEN}✓${NC} Plan complete: $PLAN_ITEMS items need documentation"
echo ""

if [ "$PLAN_ITEMS" -eq 0 ]; then
    echo -e "${RED}✗${NC} No items in plan (cannot test improve)"
    echo ""
    echo "The improve command requires undocumented items to work with."
    echo "The test sample codebase should have undocumented items."
    echo ""
    exit 1
fi

#
# STEP 5: Show Target Item
#
echo "=============================================="
echo "TARGET ITEM FOR IMPROVEMENT"
echo "=============================================="
echo ""

FIRST_ITEM_NAME=$(jq -r '.items[0].name' .docimp/session-reports/plan.json)
FIRST_ITEM_FILE=$(jq -r '.items[0].filepath' .docimp/session-reports/plan.json)
FIRST_ITEM_LINE=$(jq -r '.items[0].line_number' .docimp/session-reports/plan.json)
FIRST_ITEM_TYPE=$(jq -r '.items[0].type' .docimp/session-reports/plan.json)
FIRST_ITEM_LANGUAGE=$(jq -r '.items[0].language' .docimp/session-reports/plan.json)
FIRST_ITEM_REASON=$(jq -r '.items[0].reason' .docimp/session-reports/plan.json)

echo "Item details:"
echo "  Name:     $FIRST_ITEM_NAME"
echo "  Type:     $FIRST_ITEM_TYPE"
echo "  Language: $FIRST_ITEM_LANGUAGE"
echo "  File:     $FIRST_ITEM_FILE:$FIRST_ITEM_LINE"
echo "  Reason:   $FIRST_ITEM_REASON"
echo ""

# Show the actual code
echo "Current code (before improvement):"
echo "-----------------------------------"
if [ -f "$FIRST_ITEM_FILE" ]; then
    # Show 10 lines starting from the target line
    sed -n "${FIRST_ITEM_LINE},$((FIRST_ITEM_LINE + 9))p" "$FIRST_ITEM_FILE"
else
    echo -e "${RED}✗${NC} File not found: $FIRST_ITEM_FILE"
    exit 1
fi
echo "-----------------------------------"
echo ""

#
# STEP 6: Manual Improve Test
#
echo "=============================================="
echo "MANUAL TEST INSTRUCTIONS"
echo "=============================================="
echo ""
echo "You will now run the improve command interactively."
echo ""
echo -e "${YELLOW}Follow these steps:${NC}"
echo ""
echo "  1. The improve command will show you the item listed above"
echo "  2. Review Claude's documentation suggestion carefully"
echo "  3. Choose one of the following actions:"
echo "     [A] Accept    - Insert the documentation into the file"
echo "     [E] Edit      - Manually edit the suggestion before accepting"
echo "     [R] Regenerate - Ask Claude to generate a new suggestion"
echo "     [S] Skip      - Skip this item and move to the next"
echo "     [Q] Quit      - Exit the improve command"
echo ""
echo "  ${BLUE}For this test, choose [A] Accept to insert documentation${NC}"
echo "  ${BLUE}Then choose [Q] Quit to exit after the first item${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT - Plugin Validation:${NC}"
echo ""
echo "During the improve session, watch for plugin validation messages:"
echo "  - Plugin validation should execute before accepting documentation"
echo "  - Type mismatches in JSDoc should be caught and displayed"
echo "  - Style guide violations should be reported"
echo "  - Parameter name mismatches should be detected"
echo "  - Error messages should be clear and actionable"
echo ""
echo "If the generated documentation has errors, plugins will block acceptance"
echo "and show validation errors. This is expected behavior."
echo ""
echo -e "${YELLOW}Press Enter when ready to run improve command...${NC}"
read

echo ""
echo "Running: docimp improve ."
echo ""

# Run improve (interactive)
docimp improve . || true

echo ""

#
# STEP 7: Validation
#
echo "=============================================="
echo "VALIDATION"
echo "=============================================="
echo ""

# Check if file was modified
if git diff --quiet "$FIRST_ITEM_FILE" 2>/dev/null; then
    echo -e "${RED}✗${NC} File was NOT modified"
    echo ""
    echo "Expected: File should have been modified with new documentation"
    echo "Actual:   File is unchanged (git diff shows no changes)"
    echo ""
    echo "Possible causes:"
    echo "  - You chose [S] Skip instead of [A] Accept"
    echo "  - You chose [Q] Quit before accepting"
    echo "  - Documentation insertion failed"
    echo ""
    echo "Please review the improve command output above."
    echo ""
else
    echo -e "${GREEN}✓${NC} File was modified"
    echo ""
    echo "Documentation inserted:"
    echo "-----------------------------------"
    git diff "$FIRST_ITEM_FILE" | head -50
    echo "-----------------------------------"
    echo ""
fi

#
# STEP 8: Manual Validation Checklist
#
echo "=============================================="
echo "MANUAL VALIDATION CHECKLIST"
echo "=============================================="
echo ""
echo "Please verify the following:"
echo ""
echo "[ ] Documentation was inserted into the file"
echo "[ ] Documentation appears above the function/class"
echo "[ ] Documentation matches expected style:"
echo "    - Python:     NumPy style docstring"
echo "    - TypeScript: JSDoc comment"
echo "    - JavaScript: JSDoc comment"
echo "[ ] File syntax is still valid (no indentation errors)"
echo "[ ] Documentation describes the function accurately"
echo "[ ] Parameters and return types are documented"
echo ""
echo "Plugin validation (observed during improve session):"
echo "[ ] Plugin validation executed before accepting documentation"
echo "[ ] No validation errors were shown (or errors were appropriate)"
echo "[ ] If validation errors occurred, messages were clear and helpful"
echo "[ ] Plugin validation did not block valid documentation"
echo ""
echo "To manually inspect the changes:"
echo "  git diff $FIRST_ITEM_FILE"
echo ""
echo "To view the modified file:"
echo "  cat $FIRST_ITEM_FILE"
echo ""

#
# STEP 9: Restore State
#
echo "=============================================="
echo "RESTORATION"
echo "=============================================="
echo ""
echo "To restore files to original state:"
echo "  git restore test-samples/example-project/"
echo ""
echo -e "${YELLOW}Do you want to restore files now? [y/N]${NC} "
read -r RESTORE_CHOICE

if [[ "$RESTORE_CHOICE" =~ ^[Yy]$ ]]; then
    git restore .
    rm -rf .docimp/
    echo -e "${GREEN}✓${NC} Files restored to original state"
    echo -e "${GREEN}✓${NC} State directory removed"
else
    echo "Files preserved for further inspection"
    echo "Remember to run 'git restore .' when done"
fi
echo ""

#
# STEP 10: Additional Testing Suggestions
#
echo "=============================================="
echo "ADDITIONAL TESTING"
echo "=============================================="
echo ""
echo "For comprehensive testing, repeat this procedure with:"
echo ""
echo "  1. Different languages:"
echo "     - Python files (NumPy docstrings)"
echo "     - TypeScript files (JSDoc comments)"
echo "     - JavaScript files (JSDoc comments, ESM and CommonJS)"
echo ""
echo "  2. Different user choices:"
echo "     - [E] Edit - Verify you can modify the suggestion"
echo "     - [R] Regenerate - Verify Claude generates a new suggestion"
echo "     - [S] Skip - Verify the item is skipped and next item shown"
echo ""
echo "  3. Different item types:"
echo "     - Functions"
echo "     - Classes"
echo "     - Methods"
echo ""
echo "  4. Edge cases:"
echo "     - Complex functions with many parameters"
echo "     - Functions with no parameters"
echo "     - Functions with complex return types"
echo ""

echo "=============================================="
echo "MANUAL TEST COMPLETE"
echo "=============================================="
echo ""
echo "This testing procedure validates:"
echo "  ✓ Improve command launches successfully"
echo "  ✓ Claude API integration works"
echo "  ✓ Documentation is generated correctly"
echo "  ✓ DocstringWriter inserts documentation at correct location"
echo "  ✓ File modifications are valid (syntax preserved)"
echo ""
echo "Future enhancement: Automate this by mocking ClaudeClient responses"
echo ""
