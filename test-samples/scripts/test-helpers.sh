#!/bin/bash
#
# Shared helper functions for test scripts
#
# Usage: source "$(dirname "$0")/scripts/test-helpers.sh"
#

# Check if error output contains stack traces (not user-friendly)
# Returns 0 if stack trace detected, 1 otherwise
#
# Detects:
#   - Python stack traces: "Traceback (most recent call last)", File "...", line N
#   - JavaScript/TypeScript: at Object.<anonymous>, at Module._compile, file:line:col
#
# Example:
#   if contains_stack_trace "$ERROR_OUTPUT"; then
#       print_failure "Error message contains stack trace"
#   fi
contains_stack_trace() {
    local output="$1"
    # Python stack traces
    if echo "$output" | grep -qE "Traceback \(most recent call last\)"; then
        return 0
    fi
    if echo "$output" | grep -qE '  File ".+", line [0-9]+'; then
        return 0
    fi
    # JavaScript/TypeScript stack traces
    if echo "$output" | grep -qE "at Object\.<anonymous>|at Module\._compile|at Module\._load"; then
        return 0
    fi
    if echo "$output" | grep -qE "    at .+:[0-9]+:[0-9]+"; then
        return 0
    fi
    return 1
}
