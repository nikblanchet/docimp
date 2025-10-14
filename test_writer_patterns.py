#!/usr/bin/env python
"""
Test script for docstring writer with JavaScript patterns.

This script tests the DocstringWriter with various JavaScript code patterns
to ensure it correctly inserts JSDoc comments.
"""

import sys
from pathlib import Path
import tempfile
import shutil

# Add analyzer to path
sys.path.insert(0, str(Path(__file__).parent / 'analyzer'))

from src.writer.docstring_writer import DocstringWriter


def test_pattern(name, code, jsdoc, item_name, item_type):
    """Test a specific JavaScript pattern.

    Parameters
    ----------
    name : str
        Test name
    code : str
        JavaScript code to test
    jsdoc : str
        JSDoc to insert
    item_name : str
        Name of function/class
    item_type : str
        Type of item

    Returns
    -------
    bool
        True if test passed
    """
    # Create temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
        f.write(code)
        temp_path = f.name

    try:
        # Create writer and write docstring
        writer = DocstringWriter()
        success = writer.write_docstring(
            filepath=temp_path,
            item_name=item_name,
            item_type=item_type,
            docstring=jsdoc,
            language='javascript'
        )

        if not success:
            print(f"  FAILED: {name} - writer returned False")
            return False

        # Read result
        with open(temp_path, 'r') as f:
            result = f.read()

        # Check that JSDoc was inserted
        if '/**' not in result:
            print(f"  FAILED: {name} - JSDoc not found in output")
            print(f"  Output: {result}")
            return False

        # Check that original code is still there
        if item_name not in result:
            print(f"  FAILED: {name} - original code not found")
            return False

        print(f"  PASSED: {name}")
        return True

    finally:
        # Clean up temp file and backup
        Path(temp_path).unlink(missing_ok=True)
        Path(temp_path + '.bak').unlink(missing_ok=True)


def main():
    """Run all JavaScript pattern tests."""
    print("Testing DocstringWriter with JavaScript patterns...")
    print()

    tests = [
        (
            "Regular function",
            "function add(a, b) {\n  return a + b;\n}",
            "Add two numbers",
            "add",
            "function"
        ),
        (
            "Export function",
            "export function multiply(x, y) {\n  return x * y;\n}",
            "Multiply two numbers",
            "multiply",
            "function"
        ),
        (
            "Export default function",
            "export default function divide(a, b) {\n  return a / b;\n}",
            "Divide two numbers",
            "divide",
            "function"
        ),
        (
            "Arrow function",
            "const subtract = (a, b) => {\n  return a - b;\n};",
            "Subtract two numbers",
            "subtract",
            "function"
        ),
        (
            "Export arrow function",
            "export const power = (base, exp) => {\n  return Math.pow(base, exp);\n};",
            "Calculate power",
            "power",
            "function"
        ),
        (
            "Class",
            "export class Calculator {\n  add(a, b) {\n    return a + b;\n  }\n}",
            "Calculator class",
            "Calculator",
            "class"
        ),
        (
            "Class method",
            "class Math {\n  sum(numbers) {\n    return numbers.reduce((a, b) => a + b, 0);\n  }\n}",
            "Sum all numbers",
            "sum",
            "method"
        ),
    ]

    passed = 0
    failed = 0

    for name, code, jsdoc, item_name, item_type in tests:
        if test_pattern(name, code, jsdoc, item_name, item_type):
            passed += 1
        else:
            failed += 1

    print()
    print(f"Results: {passed} passed, {failed} failed")

    if failed > 0:
        sys.exit(1)
    else:
        print("All tests passed!")
        sys.exit(0)


if __name__ == '__main__':
    main()
