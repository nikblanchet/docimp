"""Tests for DocstringWriter with JavaScript patterns.

This module tests the DocstringWriter with various JavaScript code patterns
to ensure it correctly inserts JSDoc comments.
"""

import sys
import tempfile
from pathlib import Path

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
    return DocstringWriter(base_path="/")


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
    with tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False) as f:
        f.write(code)
        temp_path = f.name

    try:
        # Create writer and write docstring
        success = writer.write_docstring(
            filepath=temp_path,
            item_name=item_name,
            item_type=item_type,
            docstring=jsdoc,
            language="javascript",
        )

        assert success, f"Writer returned False for {item_name}"

        # Read result
        with open(temp_path) as f:
            result = f.read()

        return result

    finally:
        # Clean up temp file and backup
        Path(temp_path).unlink(missing_ok=True)
        Path(temp_path + ".bak").unlink(missing_ok=True)


def test_regular_function(writer):
    """Test writing JSDoc for regular function."""
    code = "function add(a, b) {\n  return a + b;\n}"
    jsdoc = "Add two numbers"

    result = write_and_check(writer, code, jsdoc, "add", "function")

    assert "/**" in result, "JSDoc not found in output"
    assert "add" in result, "Original code not found"


def test_export_function(writer):
    """Test writing JSDoc for export function."""
    code = "export function multiply(x, y) {\n  return x * y;\n}"
    jsdoc = "Multiply two numbers"

    result = write_and_check(writer, code, jsdoc, "multiply", "function")

    assert "/**" in result, "JSDoc not found in output"
    assert "multiply" in result, "Original code not found"


def test_export_default_function(writer):
    """Test writing JSDoc for export default function."""
    code = "export default function divide(a, b) {\n  return a / b;\n}"
    jsdoc = "Divide two numbers"

    result = write_and_check(writer, code, jsdoc, "divide", "function")

    assert "/**" in result, "JSDoc not found in output"
    assert "divide" in result, "Original code not found"


def test_arrow_function(writer):
    """Test writing JSDoc for arrow function."""
    code = "const subtract = (a, b) => {\n  return a - b;\n};"
    jsdoc = "Subtract two numbers"

    result = write_and_check(writer, code, jsdoc, "subtract", "function")

    assert "/**" in result, "JSDoc not found in output"
    assert "subtract" in result, "Original code not found"


def test_export_arrow_function(writer):
    """Test writing JSDoc for export arrow function."""
    code = "export const power = (base, exp) => {\n  return Math.pow(base, exp);\n};"
    jsdoc = "Calculate power"

    result = write_and_check(writer, code, jsdoc, "power", "function")

    assert "/**" in result, "JSDoc not found in output"
    assert "power" in result, "Original code not found"


def test_arrow_function_without_parens(writer):
    """Test writing JSDoc for arrow function without parentheses (single parameter)."""
    code = "const double = x => x * 2;"
    jsdoc = "Double a number"

    result = write_and_check(writer, code, jsdoc, "double", "function")

    assert "/**" in result, "JSDoc not found in output"
    assert "double" in result, "Original code not found"


def test_arrow_function_without_parens_async(writer):
    """Test writing JSDoc for async arrow function without parentheses."""
    code = "const fetchData = async id => await api.get(id);"
    jsdoc = "Fetch data by ID"

    result = write_and_check(writer, code, jsdoc, "fetchData", "function")

    assert "/**" in result, "JSDoc not found in output"
    assert "fetchData" in result, "Original code not found"


def test_export_arrow_function_without_parens(writer):
    """Test writing JSDoc for exported arrow function without parentheses."""
    code = "export const triple = x => x * 3;"
    jsdoc = "Triple a number"

    result = write_and_check(writer, code, jsdoc, "triple", "function")

    assert "/**" in result, "JSDoc not found in output"
    assert "triple" in result, "Original code not found"


def test_class(writer):
    """Test writing JSDoc for class."""
    code = "export class Calculator {\n  add(a, b) {\n    return a + b;\n  }\n}"
    jsdoc = "Calculator class"

    result = write_and_check(writer, code, jsdoc, "Calculator", "class")

    assert "/**" in result, "JSDoc not found in output"
    assert "Calculator" in result, "Original code not found"


def test_class_method(writer):
    """Test writing JSDoc for class method."""
    code = (
        "class Math {\n  sum(numbers) {\n    "
        "return numbers.reduce((a, b) => a + b, 0);\n  }\n}"
    )
    jsdoc = "Sum all numbers"

    result = write_and_check(writer, code, jsdoc, "sum", "method")

    assert "/**" in result, "JSDoc not found in output"
    assert "sum" in result, "Original code not found"


def test_private_method(writer):
    """Test writing JSDoc for private class method."""
    code = "class Database {\n  #connect() {\n    return this.connection;\n  }\n}"
    jsdoc = "Establish database connection"

    result = write_and_check(writer, code, jsdoc, "#connect", "method")

    assert "/**" in result, "JSDoc not found in output"
    assert "#connect" in result, "Original code not found"


def test_private_method_async(writer):
    """Test writing JSDoc for async private class method."""
    code = (
        "class API {\n  async #fetchData() {\n    "
        "return await fetch('/api/data');\n  }\n}"
    )
    jsdoc = "Fetch data from API"

    result = write_and_check(writer, code, jsdoc, "#fetchData", "method")

    assert "/**" in result, "JSDoc not found in output"
    assert "#fetchData" in result, "Original code not found"


def test_private_method_static(writer):
    """Test writing JSDoc for static private class method."""
    code = "class Utils {\n  static #helper() {\n    return true;\n  }\n}"
    jsdoc = "Internal helper function"

    result = write_and_check(writer, code, jsdoc, "#helper", "method")

    assert "/**" in result, "JSDoc not found in output"
    assert "#helper" in result, "Original code not found"


def test_typescript_public_method(writer):
    """Test writing JSDoc for TypeScript public method."""
    code = "class API {\n  public getData() {\n    return this.data;\n  }\n}"
    jsdoc = "Get the data"

    result = write_and_check(writer, code, jsdoc, "getData", "method")

    assert "/**" in result, "JSDoc not found in output"
    assert "getData" in result, "Original code not found"


def test_typescript_private_method(writer):
    """Test writing JSDoc for TypeScript private method."""
    code = "class Service {\n  private helper() {\n    return true;\n  }\n}"
    jsdoc = "Helper function"

    result = write_and_check(writer, code, jsdoc, "helper", "method")

    assert "/**" in result, "JSDoc not found in output"
    assert "helper" in result, "Original code not found"


def test_typescript_protected_async_method(writer):
    """Test writing JSDoc for TypeScript protected async method."""
    code = (
        "class Base {\n  protected async validate() {\n    "
        "return await this.check();\n  }\n}"
    )
    jsdoc = "Validate the input"

    result = write_and_check(writer, code, jsdoc, "validate", "method")

    assert "/**" in result, "JSDoc not found in output"
    assert "validate" in result, "Original code not found"


def test_typescript_private_static_method(writer):
    """Test writing JSDoc for TypeScript private static method."""
    code = (
        "class Factory {\n  private static create() {\n    "
        "return new Factory();\n  }\n}"
    )
    jsdoc = "Create instance"

    result = write_and_check(writer, code, jsdoc, "create", "method")

    assert "/**" in result, "JSDoc not found in output"
    assert "create" in result, "Original code not found"


def test_method_name_starting_with_visibility_keyword(writer):
    """Test that method names starting with visibility keywords don't falsely match."""
    code = "class Utils {\n  publicity() {\n    return 'public relations';\n  }\n}"
    jsdoc = "Handle publicity"

    result = write_and_check(writer, code, jsdoc, "publicity", "method")

    assert "/**" in result, "JSDoc not found in output"
    assert "publicity" in result, "Original code not found"


def test_method_name_starting_with_private_keyword(writer):
    """Test that method names starting with 'private' don't falsely match."""
    code = "class Auth {\n  privatize() {\n    return 'make private';\n  }\n}"
    jsdoc = "Privatize data"

    result = write_and_check(writer, code, jsdoc, "privatize", "method")

    assert "/**" in result, "JSDoc not found in output"
    assert "privatize" in result, "Original code not found"


def test_method_name_starting_with_protected_keyword(writer):
    """Test that method names starting with 'protected' don't falsely match."""
    code = "class Security {\n  protection() {\n    return 'protect';\n  }\n}"
    jsdoc = "Provide protection"

    result = write_and_check(writer, code, jsdoc, "protection", "method")

    assert "/**" in result, "JSDoc not found in output"
    assert "protection" in result, "Original code not found"


def test_arrow_function_with_underscore_param(writer):
    """Test arrow function with underscore-prefixed parameter."""
    code = "const increment = _val => _val + 1;"
    jsdoc = "Increment value"

    result = write_and_check(writer, code, jsdoc, "increment", "function")

    assert "/**" in result, "JSDoc not found in output"
    assert "increment" in result, "Original code not found"


def test_arrow_function_with_dollar_param(writer):
    """Test arrow function with dollar-prefixed parameter."""
    code = "const transform = $data => $data.toUpperCase();"
    jsdoc = "Transform data"

    result = write_and_check(writer, code, jsdoc, "transform", "function")

    assert "/**" in result, "JSDoc not found in output"
    assert "transform" in result, "Original code not found"


def test_backup_cleanup_on_successful_write(writer):
    """Test that backup files are PRESERVED after successful writes.

    (for transaction tracking)."""
    code = "function test() {\n  return true;\n}"
    jsdoc = "Test function"

    # Create temporary file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False) as f:
        f.write(code)
        temp_path = f.name

    try:
        # Write docstring (content changes, so write succeeds)
        success = writer.write_docstring(
            filepath=temp_path,
            item_name="test",
            item_type="function",
            docstring=jsdoc,
            language="javascript",
        )

        assert success, "Write should succeed"

        # Verify backup file DOES exist (preserved for transaction tracking)
        backup_files = list(
            Path(temp_path).parent.glob(f"{Path(temp_path).name}.*.bak")
        )
        assert len(backup_files) == 1, (
            "Backup file should be preserved after successful write "
            "for transaction tracking"
        )

    finally:
        # Clean up temp file and backup
        Path(temp_path).unlink(missing_ok=True)
        for backup in Path(temp_path).parent.glob(f"{Path(temp_path).name}.*.bak"):
            backup.unlink(missing_ok=True)


def test_backup_cleanup_on_idempotent_write(writer):
    """Test that no backup is created when content is unchanged (idempotent

    operation)."""
    code = "/**\n * Test function\n */\nfunction test() {\n  return true;\n}"
    jsdoc = "Test function"

    # Create temporary file with docstring already present
    with tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False) as f:
        f.write(code)
        temp_path = f.name

    try:
        # Write docstring (content unchanged, idempotent operation)
        success = writer.write_docstring(
            filepath=temp_path,
            item_name="test",
            item_type="function",
            docstring=jsdoc,
            language="javascript",
        )

        assert success, "Write should succeed"

        # Verify no backup file created (no change = no backup needed)
        backup_files = list(
            Path(temp_path).parent.glob(f"{Path(temp_path).name}.*.bak")
        )
        assert len(backup_files) == 0, (
            "No backup should be created for idempotent operation (content unchanged)"
        )

    finally:
        # Clean up temp file only (no backup to clean)
        Path(temp_path).unlink(missing_ok=True)


def test_backup_cleanup_on_write_failure(writer):
    """Test that backup files are deleted even when write operations fail."""
    code = "function test() {\n  return true;\n}"

    # Create temporary file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False) as f:
        f.write(code)
        temp_path = f.name

    try:
        # Attempt to write with unsupported language (should fail)
        with pytest.raises(ValueError, match="Unsupported language"):
            writer.write_docstring(
                filepath=temp_path,
                item_name="test",
                item_type="function",
                docstring="Test function",
                language="unsupported_language",
            )

        # Verify backup file was cleaned up despite the failure
        backup_path = Path(temp_path + ".bak")
        assert not backup_path.exists(), (
            "Backup file should be deleted even after write failure"
        )

        # Verify original file is still intact (restored from backup)
        with open(temp_path) as f:
            content = f.read()
        assert content == code, "Original file should be restored after failure"

    finally:
        # Clean up temp file only (backup should already be gone)
        Path(temp_path).unlink(missing_ok=True)
        Path(temp_path + ".bak").unlink(missing_ok=True)


class TestPathTraversalValidation:
    """Test suite for path traversal security validation."""

    def test_reject_path_outside_base_directory(self):
        """Test that paths outside base directory are rejected."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create base directory and a file inside it
            base_path = Path(temp_dir) / "project"
            base_path.mkdir()
            valid_file = base_path / "code.py"
            valid_file.write_text("def foo():\n    pass")

            # Create file outside base directory
            outside_file = Path(temp_dir) / "outside.py"
            outside_file.write_text("def bar():\n    pass")

            # Create writer with restricted base path
            writer = DocstringWriter(base_path=str(base_path))

            # Attempt to write to file outside base directory should fail
            with pytest.raises(ValueError, match="outside allowed directory"):
                writer.write_docstring(
                    filepath=str(outside_file),
                    item_name="bar",
                    item_type="function",
                    docstring="Bar function",
                    language="python",
                )

    def test_reject_path_traversal_attack(self):
        """Test that path traversal attacks are blocked."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create base directory structure
            base_path = Path(temp_dir) / "project"
            base_path.mkdir()

            # Create a file we want to protect outside the project
            protected_file = Path(temp_dir) / "secret.txt"
            protected_file.write_text("sensitive data")

            # Create writer with restricted base path
            writer = DocstringWriter(base_path=str(base_path))

            # Attempt path traversal using relative path
            traversal_path = str(base_path / ".." / "secret.txt")

            # Should reject because resolved path is outside base_path
            with pytest.raises(ValueError, match="outside allowed directory"):
                writer.write_docstring(
                    filepath=traversal_path,
                    item_name="foo",
                    item_type="function",
                    docstring="Doc",
                    language="python",
                )

    def test_accept_path_inside_base_directory(self):
        """Test that paths inside base directory are accepted."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create base directory and nested file
            base_path = Path(temp_dir) / "project"
            base_path.mkdir()
            src_dir = base_path / "src"
            src_dir.mkdir()
            valid_file = src_dir / "module.py"
            valid_file.write_text("def foo():\n    pass")

            # Create writer with base path
            writer = DocstringWriter(base_path=str(base_path))

            # Should accept file inside base directory
            success = writer.write_docstring(
                filepath=str(valid_file),
                item_name="foo",
                item_type="function",
                docstring="Foo function",
                language="python",
            )

            assert success, "Should accept file inside base directory"

    def test_resolve_symlinks_before_validation(self):
        """Test that symlinks are resolved before path validation."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create base directory
            base_path = Path(temp_dir) / "project"
            base_path.mkdir()

            # Create file outside base
            outside_dir = Path(temp_dir) / "outside"
            outside_dir.mkdir()
            target_file = outside_dir / "target.py"
            target_file.write_text("def foo():\n    pass")

            # Create symlink inside base pointing to file outside
            symlink_file = base_path / "link.py"
            symlink_file.symlink_to(target_file)

            # Create writer with restricted base path
            writer = DocstringWriter(base_path=str(base_path))

            # Should reject because symlink resolves to file outside base
            with pytest.raises(ValueError, match="outside allowed directory"):
                writer.write_docstring(
                    filepath=str(symlink_file),
                    item_name="foo",
                    item_type="function",
                    docstring="Doc",
                    language="python",
                )

    def test_default_base_path_is_cwd(self):
        """Test that base_path defaults to current working directory."""
        writer = DocstringWriter()
        assert writer.base_path == Path.cwd().resolve()

    def test_custom_base_path_is_resolved(self):
        """Test that custom base_path is resolved to absolute path."""
        with tempfile.TemporaryDirectory() as temp_dir:
            base_path = Path(temp_dir) / "project"
            base_path.mkdir()

            # Pass relative path representation
            rel_path = str(base_path)
            writer = DocstringWriter(base_path=rel_path)

            # Should be resolved to absolute path
            assert writer.base_path.is_absolute()
            assert writer.base_path == base_path.resolve()

    def test_nonexistent_file_raises_error(self):
        """Test that attempting to write to nonexistent file raises
        FileNotFoundError."""
        with tempfile.TemporaryDirectory() as temp_dir:
            writer = DocstringWriter(base_path=temp_dir)
            nonexistent = Path(temp_dir) / "nonexistent.py"

            with pytest.raises(FileNotFoundError, match="File not found"):
                writer.write_docstring(
                    filepath=str(nonexistent),
                    item_name="foo",
                    item_type="function",
                    docstring="Doc",
                    language="python",
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
            project_dir = Path(temp_dir) / "user_project"
            project_dir.mkdir()

            # Create nested source directory with a Python file
            src_dir = project_dir / "src"
            src_dir.mkdir()
            test_file = src_dir / "module.py"
            test_file.write_text("def foo():\n    pass")

            # Simulate production: base_path is the project root
            # (NOT the Python subprocess CWD which would be analyzer/)
            writer = DocstringWriter(base_path=str(project_dir))

            # This should succeed because file is within base_path
            success = writer.write_docstring(
                filepath=str(test_file),
                item_name="foo",
                item_type="function",
                docstring="Test function documentation.",
                language="python",
            )

            assert success, "Should successfully write to file within project"

            # Verify docstring was actually written
            content = test_file.read_text()
            assert '"""' in content, "Docstring markers should be present"
            assert "Test function documentation." in content, (
                "Docstring content should be present in file"
            )

            # Verify original code is preserved
            assert "def foo():" in content, (
                "Original function definition should be preserved"
            )


class TestAtomicWrites:
    """Test suite for atomic write operations with validation."""

    def test_successful_atomic_write(self):
        """Test that atomic write creates temp file, validates, and renames
        atomically."""
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as temp_dir:
            # Create test file
            test_file = Path(temp_dir) / "test.js"
            test_file.write_text("function foo() {}")

            writer = DocstringWriter(base_path=temp_dir)

            # Track temp file creation
            original_mkstemp = tempfile.mkstemp
            temp_files_created = []

            def track_mkstemp(*args, **kwargs):
                fd, path = original_mkstemp(*args, **kwargs)
                temp_files_created.append(path)
                return fd, path

            with patch("tempfile.mkstemp", side_effect=track_mkstemp):
                success = writer.write_docstring(
                    filepath=str(test_file),
                    item_name="foo",
                    item_type="function",
                    docstring="Test function",
                    language="javascript",
                )

            assert success, "Write should succeed"

            # Verify temp file was created and cleaned up
            assert len(temp_files_created) == 1, (
                "Exactly one temp file should be created"
            )
            temp_file_path = Path(temp_files_created[0])
            assert not temp_file_path.exists(), "Temp file should be cleaned up"

            # Verify final content is correct
            content = test_file.read_text()
            assert "/**" in content, "JSDoc should be present"
            assert "foo" in content, "Original code should be preserved"

            # Verify no backup remains
            backup_path = test_file.with_suffix(test_file.suffix + ".bak")
            assert not backup_path.exists(), "Backup should be cleaned up"

    def test_disk_full_scenario(self):
        """Test that disk full scenario is detected and original file is untouched."""
        from unittest.mock import MagicMock, patch

        with tempfile.TemporaryDirectory() as temp_dir:
            # Create test file
            test_file = Path(temp_dir) / "test.py"
            original_content = "def foo():\n    pass"
            test_file.write_text(original_content)

            writer = DocstringWriter(base_path=temp_dir)

            # Mock disk_usage to simulate full disk
            mock_usage = MagicMock()
            mock_usage.free = 10  # Only 10 bytes free (not enough for any write)

            # Patch at the module where it's used, not where it's imported from
            with (
                patch(
                    "src.writer.docstring_writer.shutil.disk_usage",
                    return_value=mock_usage,
                ),
                pytest.raises(OSError, match="Insufficient disk space"),
            ):
                writer.write_docstring(
                    filepath=str(test_file),
                    item_name="foo",
                    item_type="function",
                    docstring="New documentation",
                    language="python",
                )

            # Verify original file is untouched
            content = test_file.read_text()
            assert content == original_content, "Original file should be unchanged"

            # Verify no backup or temp files remain
            backup_path = test_file.with_suffix(test_file.suffix + ".bak")
            assert not backup_path.exists(), "No backup should exist"

    def test_write_validation_failure(self):
        """Test that write validation catches content mismatches."""
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as temp_dir:
            # Create test file
            test_file = Path(temp_dir) / "test.js"
            original_content = "function bar() {}"
            test_file.write_text(original_content)

            writer = DocstringWriter(base_path=temp_dir)

            # Mock _validate_write to raise validation error
            def mock_validate(file_path, expected_content):
                # Always fail validation
                raise OSError(
                    f"Write validation failed for '{file_path}'. Content "
                    f"mismatch detected."
                )

            with patch.object(writer, "_validate_write", side_effect=mock_validate):
                with pytest.raises(IOError, match="Write validation failed"):
                    writer.write_docstring(
                        filepath=str(test_file),
                        item_name="bar",
                        item_type="function",
                        docstring="Test docs",
                        language="javascript",
                    )

            # Verify original file is restored
            content = test_file.read_text()
            assert content == original_content, "Original file should be restored"

    def test_restore_failure_handling(self):
        """Test that restore failures are properly reported with both file paths."""
        import shutil
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as temp_dir:
            # Create test file
            test_file = Path(temp_dir) / "test.py"
            test_file.write_text("def foo():\n    pass")

            writer = DocstringWriter(base_path=temp_dir)

            # Mock shutil.copy2 to fail on restore but succeed on backup creation
            original_copy2 = shutil.copy2
            call_count = [0]

            def mock_copy2(src, dst):
                call_count[0] += 1
                # First call is backup creation (line 258) - let it succeed
                if call_count[0] == 1:
                    return original_copy2(src, dst)
                # Second call is restore (line 156 in _safe_restore) - make it fail
                raise PermissionError("Mock restore failure")

            # Also mock os.replace to fail, triggering restore attempt
            with (
                patch(
                    "src.writer.docstring_writer.shutil.copy2", side_effect=mock_copy2
                ),
                patch(
                    "src.writer.docstring_writer.os.replace",
                    side_effect=PermissionError("Mock replace failure"),
                ),
                pytest.raises(IOError, match="CRITICAL: Failed to restore"),
            ):
                writer.write_docstring(
                    filepath=str(test_file),
                    item_name="foo",
                    item_type="function",
                    docstring="New docs",
                    language="python",
                )

    def test_atomic_rename_behavior(self):
        """Test that os.replace is used for atomic rename."""
        import os
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as temp_dir:
            # Create test file
            test_file = Path(temp_dir) / "test.js"
            test_file.write_text("function test() {}")

            writer = DocstringWriter(base_path=temp_dir)

            # Track os.replace calls
            replace_calls = []
            original_replace = os.replace

            def track_replace(src, dst):
                replace_calls.append((src, dst))
                return original_replace(src, dst)

            with patch(
                "src.writer.docstring_writer.os.replace", side_effect=track_replace
            ):
                writer.write_docstring(
                    filepath=str(test_file),
                    item_name="test",
                    item_type="function",
                    docstring="Test function",
                    language="javascript",
                )

            # Verify os.replace was called exactly once
            assert len(replace_calls) == 1, "os.replace should be called exactly once"

            src, dst = replace_calls[0]
            # Verify temp file was in same directory as target
            assert Path(src).parent == Path(dst).parent, (
                "Temp file must be in same directory as target for atomic rename"
            )

            # Verify destination is the target file (resolve both to handle
            # symlinks like /var -> /private/var on macOS)
            assert Path(dst).resolve() == test_file.resolve(), (
                "Destination should be the target file"
            )

    def test_temp_file_creation_failure(self):
        """Test that mkstemp failure is handled without NameError."""
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as temp_dir:
            test_file = Path(temp_dir) / "test.py"
            original_content = "def foo():\n    pass"
            test_file.write_text(original_content)

            writer = DocstringWriter(base_path=temp_dir)

            # Mock mkstemp to fail
            with (
                patch(
                    "tempfile.mkstemp",
                    side_effect=OSError("Disk full during temp file creation"),
                ),
                pytest.raises(OSError, match="Disk full during temp file creation"),
            ):
                writer.write_docstring(
                    filepath=str(test_file),
                    item_name="foo",
                    item_type="function",
                    docstring="New docs",
                    language="python",
                )

            # Verify original file is untouched
            content = test_file.read_text()
            assert content == original_content, "Original file should be unchanged"

            # Verify no backup files created
            backup_path = test_file.with_suffix(test_file.suffix + ".bak")
            assert not backup_path.exists(), "No backup should exist"

            # Verify no temp files remain (they'd have pattern .test.py.*.tmp)
            temp_files = list(Path(temp_dir).glob(".test.py.*.tmp"))
            assert len(temp_files) == 0, "No temp files should remain"

    def test_backup_collision_handling(self):
        """Test that pre-existing .bak files don't cause data loss."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create test file
            test_file = Path(temp_dir) / "test.py"
            test_file.write_text("def foo():\n    pass")

            # Create pre-existing .bak file that user cares about
            user_backup = test_file.with_suffix(test_file.suffix + ".bak")
            important_content = "IMPORTANT USER BACKUP - DO NOT LOSE"
            user_backup.write_text(important_content)

            writer = DocstringWriter(base_path=temp_dir)

            # Write docstring
            success = writer.write_docstring(
                filepath=str(test_file),
                item_name="foo",
                item_type="function",
                docstring="New documentation",
                language="python",
            )

            assert success, "Write should succeed"

            # Verify user's original .bak file is NOT overwritten (timestamp
            # approach creates new file)
            if user_backup.exists():
                content = user_backup.read_text()
                assert content == important_content, (
                    "User's original .bak file should not be overwritten"
                )

            # Verify docstring was written to actual file
            test_content = test_file.read_text()
            assert '"""' in test_content, "Docstring should be present"
            assert "New documentation" in test_content, (
                "Docstring content should be in file"
            )

            # Verify timestamp backup IS preserved (for transaction tracking)
            timestamp_backups = list(Path(temp_dir).glob("test.py.*.bak"))
            # Filter out the user's manual .bak file
            timestamp_backups = [b for b in timestamp_backups if b != user_backup]
            assert len(timestamp_backups) == 1, (
                "Timestamp-based backup should be preserved for transaction tracking"
            )
