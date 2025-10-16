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
    """Create a DocstringWriter instance with unrestricted base path for testing.

    Uses '/' as base_path to allow writing to temporary directories
    during tests. Security-specific tests create their own instances
    with restricted paths.
    """
    return DocstringWriter(base_path='/')


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


def test_backup_cleanup_on_successful_write(writer):
    """Test that backup files are deleted after successful writes."""
    code = "function test() {\n  return true;\n}"
    jsdoc = "Test function"

    # Create temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
        f.write(code)
        temp_path = f.name

    try:
        # Write docstring (content changes, so write succeeds)
        success = writer.write_docstring(
            filepath=temp_path,
            item_name='test',
            item_type='function',
            docstring=jsdoc,
            language='javascript'
        )

        assert success, "Write should succeed"

        # Verify backup file does NOT exist
        backup_path = Path(temp_path + '.bak')
        assert not backup_path.exists(), \
            "Backup file should be deleted after successful write"

    finally:
        # Clean up temp file only (backup should already be gone)
        Path(temp_path).unlink(missing_ok=True)
        Path(temp_path + '.bak').unlink(missing_ok=True)


def test_backup_cleanup_on_idempotent_write(writer):
    """Test that backup files are deleted when content is unchanged."""
    code = "/**\n * Test function\n */\nfunction test() {\n  return true;\n}"
    jsdoc = "Test function"

    # Create temporary file with docstring already present
    with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
        f.write(code)
        temp_path = f.name

    try:
        # Write docstring (content unchanged, idempotent operation)
        success = writer.write_docstring(
            filepath=temp_path,
            item_name='test',
            item_type='function',
            docstring=jsdoc,
            language='javascript'
        )

        assert success, "Write should succeed"

        # Verify backup file does NOT exist
        backup_path = Path(temp_path + '.bak')
        assert not backup_path.exists(), \
            "Backup file should be deleted on idempotent operation"

    finally:
        # Clean up temp file only (backup should already be gone)
        Path(temp_path).unlink(missing_ok=True)
        Path(temp_path + '.bak').unlink(missing_ok=True)


def test_backup_cleanup_on_write_failure(writer):
    """Test that backup files are deleted even when write operations fail."""
    code = "function test() {\n  return true;\n}"

    # Create temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
        f.write(code)
        temp_path = f.name

    try:
        # Attempt to write with unsupported language (should fail)
        with pytest.raises(ValueError, match="Unsupported language"):
            writer.write_docstring(
                filepath=temp_path,
                item_name='test',
                item_type='function',
                docstring='Test function',
                language='unsupported_language'
            )

        # Verify backup file was cleaned up despite the failure
        backup_path = Path(temp_path + '.bak')
        assert not backup_path.exists(), \
            "Backup file should be deleted even after write failure"

        # Verify original file is still intact (restored from backup)
        with open(temp_path, 'r') as f:
            content = f.read()
        assert content == code, "Original file should be restored after failure"

    finally:
        # Clean up temp file only (backup should already be gone)
        Path(temp_path).unlink(missing_ok=True)
        Path(temp_path + '.bak').unlink(missing_ok=True)


class TestPathTraversalValidation:
    """Test suite for path traversal security validation."""

    def test_reject_path_outside_base_directory(self):
        """Test that paths outside base directory are rejected."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create base directory and a file inside it
            base_path = Path(temp_dir) / 'project'
            base_path.mkdir()
            valid_file = base_path / 'code.py'
            valid_file.write_text('def foo():\n    pass')

            # Create file outside base directory
            outside_file = Path(temp_dir) / 'outside.py'
            outside_file.write_text('def bar():\n    pass')

            # Create writer with restricted base path
            writer = DocstringWriter(base_path=str(base_path))

            # Attempt to write to file outside base directory should fail
            with pytest.raises(ValueError, match="outside allowed directory"):
                writer.write_docstring(
                    filepath=str(outside_file),
                    item_name='bar',
                    item_type='function',
                    docstring='Bar function',
                    language='python'
                )

    def test_reject_path_traversal_attack(self):
        """Test that path traversal attacks are blocked."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create base directory structure
            base_path = Path(temp_dir) / 'project'
            base_path.mkdir()

            # Create a file we want to protect outside the project
            protected_file = Path(temp_dir) / 'secret.txt'
            protected_file.write_text('sensitive data')

            # Create writer with restricted base path
            writer = DocstringWriter(base_path=str(base_path))

            # Attempt path traversal using relative path
            traversal_path = str(base_path / '..' / 'secret.txt')

            # Should reject because resolved path is outside base_path
            with pytest.raises(ValueError, match="outside allowed directory"):
                writer.write_docstring(
                    filepath=traversal_path,
                    item_name='foo',
                    item_type='function',
                    docstring='Doc',
                    language='python'
                )

    def test_accept_path_inside_base_directory(self):
        """Test that paths inside base directory are accepted."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create base directory and nested file
            base_path = Path(temp_dir) / 'project'
            base_path.mkdir()
            src_dir = base_path / 'src'
            src_dir.mkdir()
            valid_file = src_dir / 'module.py'
            valid_file.write_text('def foo():\n    pass')

            # Create writer with base path
            writer = DocstringWriter(base_path=str(base_path))

            # Should accept file inside base directory
            success = writer.write_docstring(
                filepath=str(valid_file),
                item_name='foo',
                item_type='function',
                docstring='Foo function',
                language='python'
            )

            assert success, "Should accept file inside base directory"

    def test_resolve_symlinks_before_validation(self):
        """Test that symlinks are resolved before path validation."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create base directory
            base_path = Path(temp_dir) / 'project'
            base_path.mkdir()

            # Create file outside base
            outside_dir = Path(temp_dir) / 'outside'
            outside_dir.mkdir()
            target_file = outside_dir / 'target.py'
            target_file.write_text('def foo():\n    pass')

            # Create symlink inside base pointing to file outside
            symlink_file = base_path / 'link.py'
            symlink_file.symlink_to(target_file)

            # Create writer with restricted base path
            writer = DocstringWriter(base_path=str(base_path))

            # Should reject because symlink resolves to file outside base
            with pytest.raises(ValueError, match="outside allowed directory"):
                writer.write_docstring(
                    filepath=str(symlink_file),
                    item_name='foo',
                    item_type='function',
                    docstring='Doc',
                    language='python'
                )

    def test_default_base_path_is_cwd(self):
        """Test that base_path defaults to current working directory."""
        writer = DocstringWriter()
        assert writer.base_path == Path.cwd().resolve()

    def test_custom_base_path_is_resolved(self):
        """Test that custom base_path is resolved to absolute path."""
        with tempfile.TemporaryDirectory() as temp_dir:
            base_path = Path(temp_dir) / 'project'
            base_path.mkdir()

            # Pass relative path representation
            rel_path = str(base_path)
            writer = DocstringWriter(base_path=rel_path)

            # Should be resolved to absolute path
            assert writer.base_path.is_absolute()
            assert writer.base_path == base_path.resolve()

    def test_nonexistent_file_raises_error(self):
        """Test that attempting to write to nonexistent file raises FileNotFoundError."""
        with tempfile.TemporaryDirectory() as temp_dir:
            writer = DocstringWriter(base_path=temp_dir)
            nonexistent = Path(temp_dir) / 'nonexistent.py'

            with pytest.raises(FileNotFoundError, match="File not found"):
                writer.write_docstring(
                    filepath=str(nonexistent),
                    item_name='foo',
                    item_type='function',
                    docstring='Doc',
                    language='python'
                )

    def test_improve_workflow_integration(self):
        """Test realistic improve workflow with correct base_path.

        Simulates the production scenario where:
        - User runs 'docimp improve ./myproject'
        - Python subprocess CWD = analyzer/
        - Project files are outside analyzer/
        - base_path is set to the user's project directory
        """
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create mock user project directory
            project_dir = Path(temp_dir) / 'user_project'
            project_dir.mkdir()

            # Create nested source directory with a Python file
            src_dir = project_dir / 'src'
            src_dir.mkdir()
            test_file = src_dir / 'module.py'
            test_file.write_text('def foo():\n    pass')

            # Simulate production: base_path is the project root
            # (NOT the Python subprocess CWD which would be analyzer/)
            writer = DocstringWriter(base_path=str(project_dir))

            # This should succeed because file is within base_path
            success = writer.write_docstring(
                filepath=str(test_file),
                item_name='foo',
                item_type='function',
                docstring='Test function documentation.',
                language='python'
            )

            assert success, "Should successfully write to file within project"

            # Verify docstring was actually written
            content = test_file.read_text()
            assert '"""' in content, "Docstring markers should be present"
            assert 'Test function documentation.' in content, \
                "Docstring content should be present in file"

            # Verify original code is preserved
            assert 'def foo():' in content, "Original function definition should be preserved"
