#!/bin/bash
#
# Manual Test Script for Prompt Wording Options
# Issue #234 - Test three prompt wordings to prevent markdown responses
#
# Usage: ./test-prompt-wordings.sh [option]
#   option: A, B, or C (defaults to interactive mode if not specified)

set -e

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Project paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EXAMPLE_PROJECT="$SCRIPT_DIR/example-project"
PROMPT_BUILDER="$PROJECT_ROOT/analyzer/src/claude/prompt_builder.py"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Prompt Wording Options - Manual Testing${NC}"
echo -e "${BLUE}  Issue #234${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Function to check prerequisites
check_prerequisites() {
    echo -e "${CYAN}Checking prerequisites...${NC}"

    # Check if ANTHROPIC_API_KEY is set
    if [ -z "$ANTHROPIC_API_KEY" ]; then
        echo -e "${RED}ERROR: ANTHROPIC_API_KEY is not set${NC}"
        echo "Please set your API key:"
        echo "  export ANTHROPIC_API_KEY=your-key-here"
        exit 1
    else
        echo -e "${GREEN}✓ ANTHROPIC_API_KEY is set${NC}"
    fi

    # Check if docimp is available
    if ! command -v docimp &> /dev/null; then
        echo -e "${RED}ERROR: docimp command not found${NC}"
        echo "Please install docimp CLI or ensure it's in your PATH"
        exit 1
    else
        echo -e "${GREEN}✓ docimp is available${NC}"
    fi

    # Check if example project exists
    if [ ! -d "$EXAMPLE_PROJECT" ]; then
        echo -e "${RED}ERROR: Example project not found at $EXAMPLE_PROJECT${NC}"
        exit 1
    else
        echo -e "${GREEN}✓ Example project found${NC}"
    fi

    # Check git status
    cd "$EXAMPLE_PROJECT"
    if [ -n "$(git status --porcelain)" ]; then
        echo -e "${YELLOW}WARNING: Example project has uncommitted changes${NC}"
        echo "Would you like to restore to clean state? (y/n)"
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            git restore src/
            echo -e "${GREEN}✓ Files restored${NC}"
        fi
    else
        echo -e "${GREEN}✓ Example project is clean${NC}"
    fi

    echo ""
}

# Function to backup PromptBuilder
backup_prompt_builder() {
    if [ ! -f "${PROMPT_BUILDER}.backup" ]; then
        echo -e "${CYAN}Backing up PromptBuilder...${NC}"
        cp "$PROMPT_BUILDER" "${PROMPT_BUILDER}.backup"
        echo -e "${GREEN}✓ Backup created${NC}"
    else
        echo -e "${YELLOW}Backup already exists${NC}"
    fi
}

# Function to restore PromptBuilder
restore_prompt_builder() {
    if [ -f "${PROMPT_BUILDER}.backup" ]; then
        echo -e "${CYAN}Restoring original PromptBuilder...${NC}"
        mv "${PROMPT_BUILDER}.backup" "$PROMPT_BUILDER"
        echo -e "${GREEN}✓ PromptBuilder restored${NC}"
    fi
}

# Function to display option details
show_option_details() {
    local option=$1

    echo -e "${CYAN}Option $option Details:${NC}"
    case $option in
        A)
            echo "  Explicit Code Fence Prohibition"
            echo '  "5. IMPORTANT: Return the raw docstring text only..."'
            echo '  "6. Code examples WITHIN the docstring are fine..."'
            ;;
        B)
            echo "  Output Format Focused"
            echo '  "5. Your response will be inserted directly into the source file..."'
            echo '  "6. Return only the documentation text that should appear..."'
            ;;
        C)
            echo "  Example-Based Format"
            echo '  "5. Response format - return ONLY the docstring content:..."'
            echo '  "6. Do NOT wrap your response in markdown code blocks..."'
            ;;
    esac
    echo ""
}

# Function to apply modifications
apply_modifications() {
    local option=$1

    echo -e "${YELLOW}MANUAL STEP REQUIRED:${NC}"
    echo "You need to manually edit the PromptBuilder file:"
    echo "  $PROMPT_BUILDER"
    echo ""
    echo "Follow the instructions in:"
    echo "  $SCRIPT_DIR/PROMPT_MODIFICATIONS.md"
    echo ""
    echo "Apply modifications for Option $option"
    echo ""
    echo -e "${YELLOW}Press ENTER when you've completed the modifications...${NC}"
    read -r
}

# Function to run test workflow
run_test_workflow() {
    local option=$1

    echo -e "${CYAN}Running test workflow...${NC}"
    echo ""

    cd "$EXAMPLE_PROJECT"

    # Step 1: Analyze
    echo -e "${BLUE}Step 1: Running analyze...${NC}"
    docimp analyze .
    echo -e "${GREEN}✓ Analysis complete${NC}"
    echo ""

    # Step 2: Plan
    echo -e "${BLUE}Step 2: Running plan...${NC}"
    docimp plan .
    echo -e "${GREEN}✓ Plan complete${NC}"
    echo ""

    # Step 3: Improve (interactive)
    echo -e "${BLUE}Step 3: Running improve (INTERACTIVE)...${NC}"
    echo ""
    echo -e "${YELLOW}TESTING INSTRUCTIONS:${NC}"
    echo "1. Test at least 8-10 functions from the plan"
    echo "2. Cover all three languages (Python, JavaScript, TypeScript)"
    echo "3. Press 'A' to ACCEPT each suggestion"
    echo "4. After each accept, note if the response had markdown wrappers"
    echo "5. Record observations in:"
    echo "   $SCRIPT_DIR/RESULTS_OPTION_$option.md"
    echo ""
    echo "Recommended functions to test:"
    echo "  - calculator.py: multiply, power"
    echo "  - validator.py: validate_username, sanitize_input"
    echo "  - helpers.cjs: clone, merge, generateRandomString"
    echo "  - api.js: post"
    echo "  - service.ts: createUser, deleteUser, validateUser"
    echo ""
    echo -e "${YELLOW}Press ENTER to start improve workflow...${NC}"
    read -r

    docimp improve .

    echo ""
    echo -e "${GREEN}✓ Improve workflow complete${NC}"
}

# Function to verify results
verify_results() {
    local option=$1

    echo ""
    echo -e "${CYAN}Verifying results...${NC}"

    cd "$EXAMPLE_PROJECT"

    # Check for markdown code fences
    echo -e "${BLUE}Checking for markdown code fences...${NC}"
    if grep -r '```' src/ 2>/dev/null; then
        echo -e "${RED}✗ Found markdown code fences in files!${NC}"
        echo "  This indicates Option $option may not be working correctly"
    else
        echo -e "${GREEN}✓ No markdown code fences found${NC}"
    fi

    # Check Python syntax
    echo -e "${BLUE}Checking Python syntax...${NC}"
    if python -m py_compile src/python/*.py 2>/dev/null; then
        echo -e "${GREEN}✓ Python files are syntactically valid${NC}"
    else
        echo -e "${RED}✗ Python syntax errors detected${NC}"
    fi

    # Check TypeScript syntax
    echo -e "${BLUE}Checking TypeScript/JavaScript syntax...${NC}"
    cd src
    if npx tsc --noEmit 2>/dev/null; then
        echo -e "${GREEN}✓ TypeScript/JavaScript files are valid${NC}"
    else
        echo -e "${RED}✗ TypeScript/JavaScript errors detected${NC}"
    fi
    cd ..

    echo ""
}

# Function to clean up after testing
cleanup_after_test() {
    local option=$1

    echo -e "${CYAN}Cleaning up...${NC}"

    cd "$EXAMPLE_PROJECT"

    echo "Would you like to:"
    echo "  1. Keep changes (to review files)"
    echo "  2. Restore files (to prepare for next test)"
    echo -n "Choice (1/2): "
    read -r choice

    if [ "$choice" = "2" ]; then
        git restore src/
        echo -e "${GREEN}✓ Files restored${NC}"
    else
        echo -e "${YELLOW}Files kept - remember to restore before next test${NC}"
    fi

    echo ""
    echo -e "${CYAN}Please complete the results file:${NC}"
    echo "  $SCRIPT_DIR/RESULTS_OPTION_$option.md"
    echo ""
}

# Main testing flow for one option
test_option() {
    local option=$1

    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Testing Option $option${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""

    show_option_details "$option"

    backup_prompt_builder

    apply_modifications "$option"

    run_test_workflow "$option"

    verify_results "$option"

    cleanup_after_test "$option"

    echo ""
    echo -e "${GREEN}Option $option testing complete!${NC}"
    echo ""
}

# Main script
main() {
    check_prerequisites

    # Parse command line argument
    if [ $# -eq 1 ]; then
        OPTION=$(echo "$1" | tr '[:lower:]' '[:upper:]')  # Convert to uppercase
        if [[ ! "$OPTION" =~ ^[ABC]$ ]]; then
            echo -e "${RED}Invalid option: $1${NC}"
            echo "Usage: $0 [A|B|C]"
            exit 1
        fi
        test_option "$OPTION"
    else
        # Interactive mode
        echo "Which option would you like to test?"
        echo "  A - Explicit Code Fence Prohibition"
        echo "  B - Output Format Focused"
        echo "  C - Example-Based Format"
        echo "  X - Test all three (sequential)"
        echo -n "Choice (A/B/C/X): "
        read -r choice
        choice=$(echo "$choice" | tr '[:lower:]' '[:upper:]')

        case $choice in
            A|B|C)
                test_option "$choice"
                ;;
            X)
                test_option "A"
                echo -e "${YELLOW}Prepare for Option B testing...${NC}"
                echo "Press ENTER to continue..."
                read -r
                test_option "B"
                echo -e "${YELLOW}Prepare for Option C testing...${NC}"
                echo "Press ENTER to continue..."
                read -r
                test_option "C"
                ;;
            *)
                echo -e "${RED}Invalid choice${NC}"
                exit 1
                ;;
        esac
    fi

    # Final instructions
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Testing Complete${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Review and complete your results files in test-samples/"
    echo "2. Compare results across all three options"
    echo "3. Choose the best option based on success rate"
    echo "4. Document findings in issue #234"
    echo "5. Update issue #232 with chosen wording"
    echo ""

    # Offer to restore PromptBuilder
    echo "Would you like to restore the original PromptBuilder? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        restore_prompt_builder
    fi

    echo ""
    echo -e "${GREEN}All done!${NC}"
}

# Run main function
main "$@"
