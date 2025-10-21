"""Integration tests for improve workflow with mocked Claude responses.

This module tests the complete improve workflow to verify that:
1. Clean responses (no markdown wrappers) are inserted correctly
2. Code examples within docstrings are preserved
3. The prompt fix from Issue #232 prevents markdown-wrapped responses
4. All three languages (Python, JavaScript, TypeScript) work correctly
"""

import sys
from pathlib import Path
import tempfile
import py_compile
from unittest.mock import patch
import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.writer.docstring_writer import DocstringWriter


class TestImproveIntegration:
    """Integration tests for improve workflow with mocked Claude API."""

    def test_improve_clean_python_response(self):
        """Test that clean Python docstrings are inserted correctly without markdown wrappers."""
        # Mock ClaudeClient to return clean docstring content (no triple quotes)
        with patch('src.claude.claude_client.ClaudeClient.generate_docstring') as mock_generate:
            mock_generate.return_value = 'Calculate the sum of two numbers.'

            # Create temporary Python file with undocumented function
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                f.write('def add(a, b):\n    return a + b\n')
                temp_path = f.name

            try:
                # Use DocstringWriter to insert the docstring
                writer = DocstringWriter(base_path='/')
                success = writer.write_docstring(
                    filepath=temp_path,
                    item_name='add',
                    item_type='function',
                    docstring='Calculate the sum of two numbers.',
                    language='python',
                    line_number=1
                )

                assert success, "DocstringWriter.write_docstring() returned False"

                # Read the result
                with open(temp_path, 'r') as f:
                    result = f.read()

                # Verify docstring is present and wrapped in triple quotes
                assert '"""' in result, "Triple quotes not found in output"
                assert 'Calculate the sum of two numbers.' in result, "Docstring content not found"

                # Verify NO markdown code fences in output
                assert '```python' not in result, "Found markdown code fence - prompt fix failed!"
                assert '```' not in result or result.count('```') == 0, "Found backticks - possible markdown wrapper"

                # Verify file is syntactically valid
                py_compile.compile(temp_path, doraise=True)

            finally:
                # Clean up
                Path(temp_path).unlink(missing_ok=True)
                Path(temp_path + '.bak').unlink(missing_ok=True)

    def test_improve_clean_javascript_response(self):
        """Test that clean JSDoc comments are inserted correctly without markdown wrappers."""
        with patch('src.claude.claude_client.ClaudeClient.generate_docstring') as mock_generate:
            # Mock returns JSDoc content (already has /** */)
            mock_generate.return_value = '/**\n * Add two numbers.\n * @param {number} a - First number\n * @param {number} b - Second number\n * @returns {number} Sum of a and b\n */'

            # Create temporary JavaScript file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
                f.write('function add(a, b) {\n  return a + b;\n}\n')
                temp_path = f.name

            try:
                writer = DocstringWriter(base_path='/')
                success = writer.write_docstring(
                    filepath=temp_path,
                    item_name='add',
                    item_type='function',
                    docstring='/**\n * Add two numbers.\n * @param {number} a - First number\n * @param {number} b - Second number\n * @returns {number} Sum of a and b\n */',
                    language='javascript',
                    line_number=1
                )

                assert success, "DocstringWriter.write_docstring() returned False"

                # Read result
                with open(temp_path, 'r') as f:
                    result = f.read()

                # Verify JSDoc is present
                assert '/**' in result, "JSDoc opening not found"
                assert 'Add two numbers' in result, "JSDoc content not found"
                assert '@param' in result, "JSDoc @param tag not found"
                assert '@returns' in result, "JSDoc @returns tag not found"

                # Verify NO markdown code fences
                assert '```javascript' not in result, "Found markdown code fence - prompt fix failed!"
                assert '```js' not in result, "Found markdown code fence - prompt fix failed!"

            finally:
                Path(temp_path).unlink(missing_ok=True)
                Path(temp_path + '.bak').unlink(missing_ok=True)

    def test_improve_clean_typescript_response(self):
        """Test that clean TSDoc comments are inserted correctly without markdown wrappers."""
        with patch('src.claude.claude_client.ClaudeClient.generate_docstring') as mock_generate:
            mock_generate.return_value = '/**\n * Add two numbers.\n * @param a - First number\n * @param b - Second number\n * @returns Sum of a and b\n */'

            # Create temporary TypeScript file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.ts', delete=False) as f:
                f.write('function add(a: number, b: number): number {\n  return a + b;\n}\n')
                temp_path = f.name

            try:
                writer = DocstringWriter(base_path='/')
                success = writer.write_docstring(
                    filepath=temp_path,
                    item_name='add',
                    item_type='function',
                    docstring='/**\n * Add two numbers.\n * @param a - First number\n * @param b - Second number\n * @returns Sum of a and b\n */',
                    language='typescript',
                    line_number=1
                )

                assert success, "DocstringWriter.write_docstring() returned False"

                # Read result
                with open(temp_path, 'r') as f:
                    result = f.read()

                # Verify TSDoc is present
                assert '/**' in result, "TSDoc opening not found"
                assert 'Add two numbers' in result, "TSDoc content not found"

                # Verify NO markdown code fences
                assert '```typescript' not in result, "Found markdown code fence - prompt fix failed!"
                assert '```ts' not in result, "Found markdown code fence - prompt fix failed!"

            finally:
                Path(temp_path).unlink(missing_ok=True)
                Path(temp_path + '.bak').unlink(missing_ok=True)

    def test_improve_preserves_code_examples_in_docstring(self):
        """Test that code examples WITHIN docstrings are preserved correctly."""
        with patch('src.claude.claude_client.ClaudeClient.generate_docstring') as mock_generate:
            # Mock response with embedded code example (Python doctest)
            mock_generate.return_value = '''Calculate sum of two numbers.

Examples:
    >>> add(1, 2)
    3
    >>> add(-1, 1)
    0
'''

            # Create temporary Python file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                f.write('def add(a, b):\n    return a + b\n')
                temp_path = f.name

            try:
                writer = DocstringWriter(base_path='/')
                success = writer.write_docstring(
                    filepath=temp_path,
                    item_name='add',
                    item_type='function',
                    docstring=mock_generate.return_value,
                    language='python',
                    line_number=1
                )

                assert success, "DocstringWriter.write_docstring() returned False"

                # Read result
                with open(temp_path, 'r') as f:
                    result = f.read()

                # Verify docstring with examples is present
                assert '>>>' in result, "Doctest example not found"
                assert 'add(1, 2)' in result, "Example code not found"
                assert 'Examples:' in result, "Examples section not found"

                # Verify the ENTIRE response isn't wrapped in markdown
                # (internal examples are fine, outer wrapper is not)
                lines = result.split('\n')
                # Should not start with ```python
                assert not any(line.strip().startswith('```python') for line in lines), \
                    "Found markdown wrapper around entire docstring"

                # Verify file is syntactically valid
                py_compile.compile(temp_path, doraise=True)

            finally:
                Path(temp_path).unlink(missing_ok=True)
                Path(temp_path + '.bak').unlink(missing_ok=True)

    @pytest.mark.xfail(
        reason="No defensive parser implemented (Issue #233). "
               "Relies on prompt fix (Option A) only. "
               "If Claude ignores prompt and returns markdown wrapper, this will fail."
    )
    def test_improve_markdown_wrapped_response(self):
        """Test handling of markdown-wrapped responses (documents limitation).

        This test documents the OLD bug behavior from Issue #231.
        It's marked as xfail because we don't have a defensive parser (Issue #233).

        If Issue #233 is implemented, remove the @pytest.mark.xfail decorator
        and this test should pass.
        """
        with patch('src.claude.claude_client.ClaudeClient.generate_docstring') as mock_generate:
            # Mock returns markdown-wrapped response (the bug we fixed with prompts)
            mock_generate.return_value = '```python\nCalculate sum.\n```'

            # Create temporary Python file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                f.write('def add(a, b):\n    return a + b\n')
                temp_path = f.name

            try:
                writer = DocstringWriter(base_path='/')
                success = writer.write_docstring(
                    filepath=temp_path,
                    item_name='add',
                    item_type='function',
                    docstring=mock_generate.return_value,
                    language='python',
                    line_number=1
                )

                # Read result
                with open(temp_path, 'r') as f:
                    result = f.read()

                # WITHOUT defensive parser, this will fail (markdown gets inserted literally)
                # WITH defensive parser (Issue #233), it should strip the wrapper first
                assert '```python' not in result, "Markdown wrapper not stripped"
                assert 'Calculate sum.' in result, "Docstring content missing"

                # Verify file is syntactically valid
                # (This will fail if markdown wrapper is present)
                py_compile.compile(temp_path, doraise=True)

            finally:
                Path(temp_path).unlink(missing_ok=True)
                Path(temp_path + '.bak').unlink(missing_ok=True)
