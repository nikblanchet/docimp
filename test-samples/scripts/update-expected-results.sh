#!/bin/bash
#
# Regenerate expected-results.json from actual analysis
#
# Usage: ./test-samples/scripts/update-expected-results.sh
#
# This script:
# 1. Runs docimp analyze on example-project/
# 2. Extracts analysis results from .docimp/session-reports/analyze-latest.json
# 3. Merges with manually-maintained sections from expected-results.json
# 4. Outputs to expected-results-new.json for review
#
# When to use:
# - After intentional changes to example-project code
# - After parser improvements that change item counts
# - After configuration changes that affect analysis
#
# DO NOT use if:
# - Analysis results change unexpectedly (investigate first)
# - You haven't verified the new counts are correct
#

set -e

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Change to test-samples directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_SAMPLES_DIR="$(dirname "$SCRIPT_DIR")"
cd "$TEST_SAMPLES_DIR" || exit 1

echo -e "${BLUE}Regenerating expected-results.json${NC}"
echo ""

# Verify we have the right structure
if [ ! -d "example-project" ]; then
    echo -e "${RED}ERROR: example-project/ directory not found${NC}"
    echo "This script must be run from test-samples/ or test-samples/scripts/"
    exit 1
fi

if [ ! -f "expected-results.json" ]; then
    echo -e "${RED}ERROR: expected-results.json not found${NC}"
    exit 1
fi

# Check for required tools
if ! command -v jq &> /dev/null; then
    echo -e "${RED}ERROR: jq is required but not installed${NC}"
    echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
    exit 1
fi

if ! command -v docimp &> /dev/null; then
    echo -e "${RED}ERROR: docimp command not found${NC}"
    echo "Make sure docimp is installed and in your PATH"
    exit 1
fi

# Run analysis
echo -e "${YELLOW}Running analysis on example-project...${NC}"
cd example-project || exit 1
docimp analyze . --format json > /dev/null

ANALYZE_FILE=".docimp/session-reports/analyze-latest.json"
if [ ! -f "$ANALYZE_FILE" ]; then
    echo -e "${RED}ERROR: Analysis did not produce expected output${NC}"
    echo "Expected file: $ANALYZE_FILE"
    exit 1
fi

echo -e "${GREEN}Analysis complete${NC}"
echo ""

# Return to test-samples directory
cd "$TEST_SAMPLES_DIR" || exit 1

# Extract new analysis section
echo -e "${YELLOW}Extracting analysis results...${NC}"
NEW_ANALYSIS=$(jq '{
  total_items: .total_items,
  documented_items: .documented_items,
  undocumented_items: .undocumented_items,
  coverage_percent: .coverage_percent,
  by_language: .by_language
}' "example-project/$ANALYZE_FILE")

# Preserve manually-maintained sections
MANUAL_SECTIONS=$(jq '{
  high_priority_items: .high_priority_items,
  sample_audit_ratings: .sample_audit_ratings,
  expected_plan_items: .expected_plan_items,
  notes: .notes
}' expected-results.json)

# Get existing description and note
DESCRIPTION=$(jq -r '.description' expected-results.json)
NOTE=$(jq -r '.note' expected-results.json)

# Merge everything together with version field
echo -e "${YELLOW}Merging with manually-maintained sections...${NC}"
jq -n \
  --arg desc "$DESCRIPTION" \
  --arg note "$NOTE" \
  --argjson analysis "$NEW_ANALYSIS" \
  --argjson manual "$MANUAL_SECTIONS" \
  '{
    description: $desc,
    note: $note,
    version: "1.0",
    analysis: $analysis
  } + $manual' > expected-results-new.json

echo -e "${GREEN}New expected results written to: expected-results-new.json${NC}"
echo ""

# Show what changed
echo -e "${BLUE}Summary of changes:${NC}"
OLD_TOTAL=$(jq -r '.analysis.total_items' expected-results.json)
NEW_TOTAL=$(jq -r '.analysis.total_items' expected-results-new.json)
OLD_COVERAGE=$(jq -r '.analysis.coverage_percent' expected-results.json)
NEW_COVERAGE=$(jq -r '.analysis.coverage_percent' expected-results-new.json)

echo "  Total items: $OLD_TOTAL → $NEW_TOTAL"
echo "  Coverage: $OLD_COVERAGE% → $NEW_COVERAGE%"
echo ""

# Show detailed diff if available
if command -v diff &> /dev/null; then
    echo -e "${BLUE}Detailed changes:${NC}"
    echo ""
    diff -u expected-results.json expected-results-new.json || true
    echo ""
fi

echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "1. Review the changes above carefully"
echo "2. Verify the new counts are expected and correct"
echo "3. If correct, replace the old file:"
echo -e "   ${GREEN}mv expected-results-new.json expected-results.json${NC}"
echo ""
echo "4. If unexpected, investigate why analysis results changed:"
echo "   - Did parser logic change?"
echo "   - Did exclude patterns in docimp.config.js change?"
echo "   - Were files added/removed from example-project?"
echo ""
echo -e "${RED}DO NOT blindly replace without understanding the changes${NC}"
