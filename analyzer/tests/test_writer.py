"""Tests for DocstringWriter with JavaScript patterns.

This module tests the DocstringWriter with various JavaScript code patterns
to ensure it correctly inserts JSDoc comments.
"""

import sys
from pathlib import Path
import tempfile
import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.writer.docstring_writer import DocstringWriter


@pytest.fixture
def writer():
    """Create a DocstringWriter instance."""
    return DocstringWriter()


def write_and_check(writer, code, jsdoc, item_name, item_type):
    """Helper function to write docstring and verify result.

    Parameters
    ----------
    writer : DocstringWriter
        Writer instance
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
    str
        Result after writing docstring
    """
    # Create temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
        f.write(code)
        temp_path = f.name

    try:
        # Create writer and write docstring
        success = writer.write_docstring(
            filepath=temp_path,
            item_name=item_name,
            item_type=item_type,
            docstring=jsdoc,
            language='javascript'
        )

        assert success, f"Writer returned False for {item_name}"

        # Read result
        with open(temp_path, 'r') as f:
            result = f.read()

        return result

    finally:
        # Clean up temp file and backup
        Path(temp_path).unlink(missing_ok=True)
        Path(temp_path + '.bak').unlink(missing_ok=True)


def test_regular_function(writer):
    """Test writing JSDoc for regular function."""
    code = "function add(a, b) {\n  return a + b;\n}"
    jsdoc = "Add two numbers"

    result = write_and_check(writer, code, jsdoc, "add", "function")

    assert '/**' in result, "JSDoc not found in output"
    assert 'add' in result, "Original code not found"


def test_export_function(writer):
    """Test writing JSDoc for export function."""
    code = "export function multiply(x, y) {\n  return x * y;\n}"
    jsdoc = "Multiply two numbers"

    result = write_and_check(writer, code, jsdoc, "multiply", "function")

    assert '/**' in result, "JSDoc not found in output"
    assert 'multiply' in result, "Original code not found"


def test_export_default_function(writer):
    """Test writing JSDoc for export default function."""
    code = "export default function divide(a, b) {\n  return a / b;\n}"
    jsdoc = "Divide two numbers"

    result = write_and_check(writer, code, jsdoc, "divide", "function")

    assert '/**' in result, "JSDoc not found in output"
    assert 'divide' in result, "Original code not found"


def test_arrow_function(writer):
    """Test writing JSDoc for arrow function."""
    code = "const subtract = (a, b) => {\n  return a - b;\n};"
    jsdoc = "Subtract two numbers"

    result = write_and_check(writer, code, jsdoc, "subtract", "function")

    assert '/**' in result, "JSDoc not found in output"
    assert 'subtract' in result, "Original code not found"


def test_export_arrow_function(writer):
    """Test writing JSDoc for export arrow function."""
    code = "export const power = (base, exp) => {\n  return Math.pow(base, exp);\n};"
    jsdoc = "Calculate power"

    result = write_and_check(writer, code, jsdoc, "power", "function")

    assert '/**' in result, "JSDoc not found in output"
    assert 'power' in result, "Original code not found"


def test_class(writer):
    """Test writing JSDoc for class."""
    code = "export class Calculator {\n  add(a, b) {\n    return a + b;\n  }\n}"
    jsdoc = "Calculator class"

    result = write_and_check(writer, code, jsdoc, "Calculator", "class")

    assert '/**' in result, "JSDoc not found in output"
    assert 'Calculator' in result, "Original code not found"


def test_class_method(writer):
    """Test writing JSDoc for class method."""
    code = "class Math {\n  sum(numbers) {\n    return numbers.reduce((a, b) => a + b, 0);\n  }\n}"
    jsdoc = "Sum all numbers"

    result = write_and_check(writer, code, jsdoc, "sum", "method")

    assert '/**' in result, "JSDoc not found in output"
    assert 'sum' in result, "Original code not found"
