"""Writer for inserting documentation into source files.

This module handles writing documentation to Python, TypeScript, and JavaScript
files while preserving formatting and ensuring idempotent operations.
"""

import re
import shutil
from pathlib import Path
from typing import Optional


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

    def __init__(self, base_path: Optional[str] = None):
        """Initialize the docstring writer.

        Parameters
        ----------
        base_path : str, optional
            Base directory path for validation. Files must be within this directory.
            Defaults to current working directory if not specified.
        """
        self.base_path = Path(base_path).resolve() if base_path else Path.cwd().resolve()

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

    def write_docstring(
        self,
        filepath: str,
        item_name: str,
        item_type: str,
        docstring: str,
        language: str,
        line_number: Optional[int] = None
    ) -> bool:
        """Write documentation to a source file.

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
        """
        # Validate path and get resolved Path object
        file_path = self._validate_path(filepath)

        # Create backup
        backup_path = file_path.with_suffix(file_path.suffix + '.bak')
        shutil.copy2(file_path, backup_path)

        try:
            # Read file content
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Apply docstring based on language
            if language == 'python':
                new_content = self._insert_python_docstring(
                    content, item_name, item_type, docstring, line_number
                )
            elif language in ['javascript', 'typescript']:
                new_content = self._insert_jsdoc(
                    content, item_name, item_type, docstring, line_number
                )
            else:
                raise ValueError(f"Unsupported language: {language}")

            # Check if content actually changed (idempotency check)
            if new_content == content:
                # No changes needed, remove backup
                backup_path.unlink()
                return True

            # Write modified content
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)

            return True

        except Exception:
            # Restore from backup on error
            if backup_path.exists():
                shutil.copy2(backup_path, file_path)
            raise

    def _insert_python_docstring(
        self,
        content: str,
        item_name: str,
        item_type: str,
        docstring: str,
        line_number: Optional[int] = None
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
        lines = content.split('\n')

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
                doc_indent = indent + '    '

                # Format docstring with proper indentation
                doc_lines = docstring.split('\n')
                formatted_doc = []
                formatted_doc.append(doc_indent + '"""')
                for doc_line in doc_lines:
                    if doc_line.strip():
                        formatted_doc.append(doc_indent + doc_line)
                    else:
                        formatted_doc.append('')
                formatted_doc.append(doc_indent + '"""')

                # Insert docstring after the definition line
                lines.insert(i + 1, '\n'.join(formatted_doc))
                return '\n'.join(lines)

        # If we couldn't find the item, return original content
        return content

    def _insert_jsdoc(
        self,
        content: str,
        item_name: str,
        item_type: str,
        docstring: str,
        line_number: Optional[int] = None
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
        lines = content.split('\n')

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
                            if prev_line.endswith('*/'):
                                # JSDoc already exists, skip
                                return content

                    # Get indentation from the definition line
                    indent = self._get_indentation(lines[i])

                    # Format JSDoc with proper indentation
                    # If docstring is already in JSDoc format (starts with /**), use it
                    if docstring.strip().startswith('/**'):
                        doc_lines = docstring.strip().split('\n')
                    else:
                        # Wrap in JSDoc format
                        doc_lines = ['/**']
                        for doc_line in docstring.split('\n'):
                            if doc_line.strip():
                                doc_lines.append(' * ' + doc_line.strip())
                        doc_lines.append(' */')

                    # Apply indentation
                    formatted_doc = [indent + line for line in doc_lines]

                    # Insert JSDoc before the function/class
                    lines.insert(i, '\n'.join(formatted_doc))
                    return '\n'.join(lines)

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

        if item_type == 'class':
            return re.compile(rf'^class\s+{escaped_name}\s*[\(:]')
        else:  # function or method
            return re.compile(rf'^(async\s+)?def\s+{escaped_name}\s*\(')

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

        if item_type == 'class':
            # Class declaration
            patterns.append(re.compile(rf'\b(export\s+)?(default\s+)?class\s+{escaped_name}\b'))
        else:  # function or method
            # Regular function declaration
            patterns.append(re.compile(rf'\b(async\s+)?function\s+{escaped_name}\s*\('))

            # Export function
            patterns.append(re.compile(rf'\bexport\s+(async\s+)?function\s+{escaped_name}\s*\('))

            # Export default function
            patterns.append(re.compile(rf'\bexport\s+default\s+(async\s+)?function\s+{escaped_name}\s*\('))

            # Arrow function (const/let/var)
            patterns.append(re.compile(rf'\b(const|let|var)\s+{escaped_name}\s*=\s*(async\s*)?\('))

            # Export arrow function
            patterns.append(re.compile(rf'\bexport\s+(const|let|var)\s+{escaped_name}\s*=\s*(async\s*)?\('))

            # Method in object literal or class
            patterns.append(re.compile(rf'\b(static\s+)?(async\s+)?(get\s+|set\s+)?{escaped_name}\s*\('))

            # CommonJS exports
            patterns.append(re.compile(rf'\b(module\.)?exports\.{escaped_name}\s*='))

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
        match = re.match(r'^(\s*)', line)
        return match.group(1) if match else ''
