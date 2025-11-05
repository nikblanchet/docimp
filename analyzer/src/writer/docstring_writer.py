"""Writer for inserting documentation into source files.

This module handles writing documentation to Python, TypeScript, and JavaScript
files while preserving formatting and ensuring idempotent operations.
"""

import os
import re
import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from ..claude.response_parser import ClaudeResponseParser


class DocstringWriter:
    """Writes documentation to source files with language-specific formatting.

    Handles multiple language patterns:
    - Python: Triple-quoted docstrings
    - JavaScript/TypeScript: JSDoc comments
    - ESM exports (export function, export default)
    - CommonJS (module.exports, exports.foo)
    - Arrow functions (const foo = () => {})
    - Class methods (static, getters, setters)
    - Object literal methods

    Ensures:
    - Preservation of indentation
    - Idempotent operations (no duplicate comments)
    - Backup creation before modification
    - Path traversal protection (files must be within allowed base directory)
    """

    def __init__(self, base_path: str | None = None):
        """Initialize the docstring writer.

        Parameters
        ----------
        base_path : str, optional
            Base directory path for validation. Files must be within this directory.
            Defaults to current working directory if not specified.
        """
        self.base_path = (
            Path(base_path).resolve() if base_path else Path.cwd().resolve()
        )

    def _validate_path(self, filepath: str) -> Path:
        """Validate that a file path is within the allowed base directory.

        This prevents path traversal attacks where malicious paths like
        '../../etc/passwd' could be used to write outside the project.

        Parameters
        ----------
        filepath : str
            Path to validate

        Returns
        -------
        Path
            Resolved absolute Path object

        Raises
        ------
        ValueError
            If the path is outside the allowed base directory
        FileNotFoundError
            If the file does not exist
        """
        # Resolve to absolute path (handles symlinks and relative paths)
        file_path = Path(filepath).resolve()

        # Validate file exists
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {filepath}")

        # Validate path is within allowed base directory
        try:
            file_path.relative_to(self.base_path)
        except ValueError:
            raise ValueError(
                f"Path '{filepath}' is outside allowed directory '{self.base_path}'. "
                f"Resolved path: {file_path}"
            )

        return file_path

    def _check_disk_space(self, file_path: Path, required_bytes: int) -> None:
        """Check if sufficient disk space is available before writing.

        Parameters
        ----------
        file_path : Path
            Path where file will be written
        required_bytes : int
            Number of bytes required for the write operation

        Raises
        ------
        OSError
            If insufficient disk space is available
        """
        usage = shutil.disk_usage(file_path.parent)
        available_bytes = usage.free

        # Add 10% buffer for safety
        required_with_buffer = int(required_bytes * 1.1)

        if available_bytes < required_with_buffer:
            raise OSError(
                f"Insufficient disk space. Required: {required_with_buffer} bytes, "
                f"Available: {available_bytes} bytes"
            )

    def _validate_write(self, file_path: Path, expected_content: str) -> None:
        """Validate that file was written correctly by reading it back.

        Parameters
        ----------
        file_path : Path
            Path to the file that was written
        expected_content : str
            Expected content that should be in the file

        Raises
        ------
        IOError
            If the file content doesn't match expected content
        """
        try:
            with file_path.open(encoding="utf-8") as f:
                actual_content = f.read()
        except Exception as e:
            raise OSError(f"Failed to read back written file '{file_path}': {e}")

        if actual_content != expected_content:
            expected_len = len(expected_content)
            actual_len = len(actual_content)
            raise OSError(
                f"Write validation failed for '{file_path}'. "
                f"Expected {expected_len} bytes, got {actual_len} bytes. "
                f"Content mismatch detected."
            )

    def _safe_restore(self, backup_path: Path, target_path: Path) -> None:
        """Safely restore a file from backup with error handling.

        Parameters
        ----------
        backup_path : Path
            Path to the backup file
        target_path : Path
            Path where backup should be restored

        Raises
        ------
        IOError
            If restore operation fails, with details about both files
        """
        try:
            shutil.copy2(backup_path, target_path)
        except Exception as e:
            # This is a critical failure - we failed to restore the original file
            raise OSError(
                f"CRITICAL: Failed to restore '{target_path}' from backup "
                f"'{backup_path}'. "
                f"Original error: {e}. Both backup and target may be in "
                f"inconsistent state."
            ) from e

    def write_docstring(
        self,
        filepath: str,
        item_name: str,
        item_type: str,
        docstring: str,
        language: str,
        line_number: int | None = None,
        explicit_backup_path: str | None = None,
    ) -> bool:
        """Write documentation to a source file.

        This method uses atomic write operations to prevent file corruption:

        1. Write new content to temporary file
        2. Validate temp file content matches expected content
        3. Create backup of original (only after temp validated)
        4. Atomically rename temp file to target using os.replace()
        5. Clean up backup and temp files in finally block

        Concurrency Limitation
        ----------------------
        This implementation uses optimistic locking. The file is read at the
        beginning, and atomically written at the end. If another process modifies
        the file between these operations, those changes will be silently
        overwritten.

        For concurrent environments where multiple processes may modify the same
        file, external file locking mechanisms would be required. See Issue #197
        for broader concurrent execution support.

        Parameters
        ----------
        filepath : str
            Path to the source file
        item_name : str
            Name of the function/class/method
        item_type : str
            Type of item ('function', 'class', 'method')
        docstring : str
            Documentation to insert
        language : str
            Language of the source file ('python', 'javascript', 'typescript')
        line_number : int, optional
            Line number where the item is located

        Returns
        -------
        bool
            True if write was successful, False otherwise

        Raises
        ------
        ValueError
            If the filepath is outside the allowed base directory
        FileNotFoundError
            If the file does not exist
        OSError
            If insufficient disk space is available
        IOError
            If write validation fails or restore operation fails
        """
        # Clean any markdown wrappers from docstring (defensive parser)
        # This provides defense-in-depth in case Claude wraps responses in markdown
        # fences despite prompt instructions
        docstring = ClaudeResponseParser.strip_markdown_fences(docstring, language)

        # Validate path and get resolved Path object
        file_path = self._validate_path(filepath)

        # Read file content
        with file_path.open(encoding="utf-8") as f:
            content = f.read()

        # Apply docstring based on language
        if language == "python":
            new_content = self._insert_python_docstring(
                content, item_name, item_type, docstring, line_number
            )
        elif language in ["javascript", "typescript"]:
            new_content = self._insert_jsdoc(
                content, item_name, item_type, docstring, line_number
            )
        else:
            raise ValueError(f"Unsupported language: {language}")

        # Check if content actually changed (idempotency check)
        if new_content == content:
            # No changes needed
            return True

        # Calculate required disk space
        required_bytes = len(new_content.encode("utf-8"))

        # Check disk space before proceeding
        self._check_disk_space(file_path, required_bytes)

        # Create backup and temp file paths
        # Use explicit_backup_path if provided (for transaction tracking),
        # otherwise generate timestamp-based path
        if explicit_backup_path:
            backup_path = Path(explicit_backup_path)
        else:
            # Use timestamp to avoid collisions with existing .bak files
            timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S_%f")
            backup_path = file_path.with_suffix(f"{file_path.suffix}.{timestamp}.bak")

        # Safety check: verify backup path is unique (should always be true
        # with microseconds)
        if backup_path.exists():
            raise OSError(
                f"Backup path collision: '{backup_path}' already exists. "
                f"This should not happen with timestamp-based naming."
            )

        temp_path = None  # Initialize to avoid NameError if mkstemp fails

        try:
            # Temp file must be in same directory for atomic rename to work
            temp_fd, temp_path_str = tempfile.mkstemp(
                dir=file_path.parent, prefix=f".{file_path.name}.", suffix=".tmp"
            )
            temp_path = Path(temp_path_str)

            # Write to temp file
            with os.fdopen(temp_fd, "w", encoding="utf-8") as f:
                f.write(new_content)

            # Validate the write
            self._validate_write(temp_path, new_content)

            # Create backup of original (only after temp file validated)
            shutil.copy2(file_path, backup_path)

            # Atomic rename (overwrites target)
            temp_path.replace(file_path)

            return True

        except Exception:
            # Cleanup temp file if it still exists
            if temp_path and temp_path.exists():
                temp_path.unlink()

            # Restore from backup if we created one
            if backup_path.exists():
                self._safe_restore(backup_path, file_path)
            raise
        finally:
            # Cleanup temp file only (preserve backup for transaction tracking)
            # Backup files are deleted only when transaction commits, not here
            if temp_path and temp_path.exists():
                temp_path.unlink()

    def _insert_python_docstring(
        self,
        content: str,
        item_name: str,
        item_type: str,
        docstring: str,
        line_number: int | None = None,
    ) -> str:
        """Insert Python docstring into content.

        Parameters
        ----------
        content : str
            Source file content
        item_name : str
            Name of the function/class
        item_type : str
            Type of item ('function', 'class', 'method')
        docstring : str
            Documentation to insert
        line_number : int, optional
            Line number where the item is located

        Returns
        -------
        str
            Modified content with docstring inserted
        """
        lines = content.split("\n")

        # Find the function/class definition
        pattern = self._get_python_pattern(item_name, item_type)

        for i, line in enumerate(lines):
            if pattern.match(line.strip()):
                # Check if docstring already exists
                if i + 1 < len(lines):
                    next_line = lines[i + 1].strip()
                    if next_line.startswith('"""') or next_line.startswith("'''"):
                        # Docstring already exists, skip
                        return content

                # Get indentation from the definition line
                indent = self._get_indentation(lines[i])
                # Docstring should be indented one level more
                doc_indent = indent + "    "

                # Format docstring with proper indentation
                doc_lines = docstring.split("\n")
                formatted_doc = []
                formatted_doc.append(doc_indent + '"""')
                for doc_line in doc_lines:
                    if doc_line.strip():
                        formatted_doc.append(doc_indent + doc_line)
                    else:
                        formatted_doc.append("")
                formatted_doc.append(doc_indent + '"""')

                # Insert docstring after the definition line
                lines.insert(i + 1, "\n".join(formatted_doc))
                return "\n".join(lines)

        # If we couldn't find the item, return original content
        return content

    def _insert_jsdoc(
        self,
        content: str,
        item_name: str,
        item_type: str,
        docstring: str,
        line_number: int | None = None,
    ) -> str:
        """Insert JSDoc comment into JavaScript/TypeScript content.

        Parameters
        ----------
        content : str
            Source file content
        item_name : str
            Name of the function/class/method
        item_type : str
            Type of item ('function', 'class', 'method')
        docstring : str
            Documentation to insert (should already be JSDoc format)
        line_number : int, optional
            Line number where the item is located

        Returns
        -------
        str
            Modified content with JSDoc inserted
        """
        lines = content.split("\n")

        # Try multiple patterns for JavaScript
        patterns = self._get_javascript_patterns(item_name, item_type)

        for i, line in enumerate(lines):
            for pattern in patterns:
                if pattern.search(line):
                    # Check if JSDoc already exists (look at previous non-empty line)
                    if i > 0:
                        prev_idx = i - 1
                        # Skip empty lines
                        while prev_idx >= 0 and not lines[prev_idx].strip():
                            prev_idx -= 1

                        if prev_idx >= 0:
                            prev_line = lines[prev_idx].strip()
                            if prev_line.endswith("*/"):
                                # JSDoc already exists, skip
                                return content

                    # Get indentation from the definition line
                    indent = self._get_indentation(lines[i])

                    # Format JSDoc with proper indentation
                    # If docstring is already in JSDoc format (starts with /**), use it
                    if docstring.strip().startswith("/**"):
                        doc_lines = docstring.strip().split("\n")
                    else:
                        # Wrap in JSDoc format
                        doc_lines = ["/**"]
                        for doc_line in docstring.split("\n"):
                            if doc_line.strip():
                                doc_lines.append(" * " + doc_line.strip())
                        doc_lines.append(" */")

                    # Apply indentation
                    formatted_doc = [indent + line for line in doc_lines]

                    # Insert JSDoc before the function/class
                    lines.insert(i, "\n".join(formatted_doc))
                    return "\n".join(lines)

        # If we couldn't find the item, return original content
        return content

    def _get_python_pattern(self, item_name: str, item_type: str) -> re.Pattern:
        """Get regex pattern for finding Python definitions.

        Parameters
        ----------
        item_name : str
            Name of the function/class
        item_type : str
            Type of item ('function', 'class', 'method')

        Returns
        -------
        re.Pattern
            Compiled regex pattern
        """
        escaped_name = re.escape(item_name)

        if item_type == "class":
            return re.compile(rf"^class\s+{escaped_name}\s*[\(:]")
        else:  # function or method
            return re.compile(rf"^(async\s+)?def\s+{escaped_name}\s*\(")

    def _get_javascript_patterns(self, item_name: str, item_type: str) -> list:
        """Get regex patterns for finding JavaScript/TypeScript definitions.

        Parameters
        ----------
        item_name : str
            Name of the function/class/method
        item_type : str
            Type of item ('function', 'class', 'method')

        Returns
        -------
        list
            List of compiled regex patterns to try
        """
        escaped_name = re.escape(item_name)
        patterns = []

        if item_type == "class":
            # Class declaration
            patterns.append(
                re.compile(rf"\b(export\s+)?(default\s+)?class\s+{escaped_name}\b")
            )
        else:  # function or method
            # Regular function declaration
            patterns.append(re.compile(rf"\b(async\s+)?function\s+{escaped_name}\s*\("))

            # Export function
            patterns.append(
                re.compile(rf"\bexport\s+(async\s+)?function\s+{escaped_name}\s*\(")
            )

            # Export default function
            patterns.append(
                re.compile(
                    rf"\bexport\s+default\s+(async\s+)?function\s+{escaped_name}\s*\("
                )
            )

            # Arrow function (const/let/var)
            patterns.append(
                re.compile(rf"\b(const|let|var)\s+{escaped_name}\s*=\s*(async\s*)?\(")
            )

            # Arrow function without parentheses (single parameter)
            # Matches simple identifiers: letter/underscore/$ followed by word
            # chars or $
            patterns.append(
                re.compile(
                    rf"\b(const|let|var)\s+{escaped_name}\s*=\s*(async\s+)?[a-zA-Z_$][\w$]*\s*=>"
                )
            )

            # Export arrow function
            patterns.append(
                re.compile(
                    rf"\bexport\s+(const|let|var)\s+{escaped_name}\s*=\s*(async\s*)?\("
                )
            )

            # Export arrow function without parentheses (single parameter)
            # Matches simple identifiers: letter/underscore/$ followed by word
            # chars or $
            patterns.append(
                re.compile(
                    rf"\bexport\s+(const|let|var)\s+{escaped_name}\s*=\s*(async\s+)?[a-zA-Z_$][\w$]*\s*=>"
                )
            )

            # Check if this is a private method (name starts with #)
            if item_name.startswith("#"):
                # Private method: escaped_name already includes the #
                # No leading \b because # itself is distinctive and \b doesn't
                # work before #
                patterns.append(
                    re.compile(
                        rf"(static\s+)?(async\s+)?(get\s+|set\s+)?{escaped_name}\s*\("
                    )
                )
            else:
                # Regular method in object literal or class
                # Supports TypeScript visibility modifiers (public, private, protected)
                patterns.append(
                    re.compile(
                        rf"\b((public|private|protected)\s+)?(static\s+)?(async\s+)?(get\s+|set\s+)?{escaped_name}\s*\("
                    )
                )

            # CommonJS exports
            patterns.append(re.compile(rf"\b(module\.)?exports\.{escaped_name}\s*="))

        return patterns

    def _get_indentation(self, line: str) -> str:
        """Extract indentation from a line.

        Parameters
        ----------
        line : str
            Line of code

        Returns
        -------
        str
            Indentation string (spaces or tabs)
        """
        match = re.match(r"^(\s*)", line)
        return match.group(1) if match else ""
