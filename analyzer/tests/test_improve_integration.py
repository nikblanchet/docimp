"""Integration tests for improve workflow to verify markdown-wrapper fix.

This module tests that the PromptBuilder fix (Option A from issue #232) works
correctly to prevent Claude from wrapping docstring responses in markdown code fences.

Tests verify:
1. Clean responses (no markdown wrappers) are inserted correctly
2. Responses with code examples within docstrings are preserved
3. All three languages (Python, JavaScript, TypeScript) work correctly
4. PromptBuilder includes markdown prevention instructions

These tests use mocked ClaudeClient to avoid API calls in CI/CD.

Related Issues:
- #231: Original bug (markdown code fences breaking files)
- #232: PromptBuilder update (the fix being tested)
- #235: Add integration tests (this file)
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
from src.claude.prompt_builder import PromptBuilder


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

    def test_improve_markdown_wrapped_response(self):
        """Test handling of markdown-wrapped responses with defensive parser.

        This test verifies that the defensive parser (Issue #233) correctly strips
        markdown code fences if Claude returns a wrapped response despite prompt
        instructions.

        This provides defense-in-depth protection against the original bug (#231).
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

                assert success, "DocstringWriter.write_docstring() returned False"

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

    def test_improve_preserves_code_examples_in_jsdoc(self):
        """Test that code examples with markdown fences WITHIN JSDoc are preserved.

        JSDoc commonly includes code examples using markdown code fences within
        @example tags. These should be preserved while preventing outer wrappers.
        """
        with patch('src.claude.claude_client.ClaudeClient.generate_docstring') as mock_generate:
            # Mock response with embedded markdown fence in @example
            mock_generate.return_value = '''/**
 * Format a number as currency.
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency
 * @example
 * ```javascript
 * formatCurrency(42.5);  // Returns "$42.50"
 * formatCurrency(100);   // Returns "$100.00"
 * ```
 */'''

            # Create temporary JavaScript file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
                f.write('function formatCurrency(amount) {\n  return `$${amount.toFixed(2)}`;\n}\n')
                temp_path = f.name

            try:
                writer = DocstringWriter(base_path='/')
                success = writer.write_docstring(
                    filepath=temp_path,
                    item_name='formatCurrency',
                    item_type='function',
                    docstring=mock_generate.return_value,
                    language='javascript',
                    line_number=1
                )

                assert success, "DocstringWriter.write_docstring() returned False"

                # Read result
                with open(temp_path, 'r') as f:
                    result = f.read()

                # Verify JSDoc with example is present
                assert '@example' in result, "@example tag not found"
                assert 'formatCurrency(42.5)' in result, "Example code not found"

                # Verify markdown fence is INSIDE the JSDoc, not wrapping it
                # Pattern should be: /** ... @example ... ```javascript ... ``` ... */
                # NOT: ```javascript /** ... */ ```
                lines = result.split('\n')
                jsdoc_start = next((i for i, line in enumerate(lines) if '/**' in line), None)
                jsdoc_end = next((i for i, line in enumerate(lines) if '*/' in line and i > (jsdoc_start or 0)), None)
                code_fence_lines = [i for i, line in enumerate(lines) if '```' in line]

                assert jsdoc_start is not None, "JSDoc start not found"
                assert jsdoc_end is not None, "JSDoc end not found"
                assert len(code_fence_lines) >= 2, "Code fences in example not found"

                # All code fences should be INSIDE the JSDoc comment
                for fence_line in code_fence_lines:
                    assert jsdoc_start < fence_line < jsdoc_end, \
                        f"Code fence at line {fence_line} should be INSIDE JSDoc (lines {jsdoc_start}-{jsdoc_end})"

            finally:
                Path(temp_path).unlink(missing_ok=True)
                Path(temp_path + '.bak').unlink(missing_ok=True)

    def test_improve_all_languages_comprehensive(self):
        """Comprehensive test of all three languages in a single test scenario.

        This test verifies the fix works correctly for Python, JavaScript, and
        TypeScript files, ensuring no markdown wrappers appear in any language.
        """
        # Create temporary directory for all test files
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Create test files for all three languages
            python_file = temp_path / 'test.py'
            js_file = temp_path / 'test.js'
            ts_file = temp_path / 'test.ts'

            python_file.write_text('def multiply(a, b):\n    return a * b\n')
            js_file.write_text('export function divide(a, b) {\n  return a / b;\n}\n')
            ts_file.write_text('export function power(base: number, exp: number): number {\n  return Math.pow(base, exp);\n}\n')

            # Create writer
            writer = DocstringWriter(base_path='/')

            # Test Python
            python_docstring = '''Multiply two numbers.

Parameters
----------
a : int or float
    First number
b : int or float
    Second number

Returns
-------
int or float
    Product of a and b'''

            python_success = writer.write_docstring(
                filepath=str(python_file),
                item_name='multiply',
                item_type='function',
                docstring=python_docstring,
                language='python',
                line_number=1
            )

            # Test JavaScript
            js_docstring = '''/**
 * Divide two numbers.
 * @param {number} a - Dividend
 * @param {number} b - Divisor
 * @returns {number} Quotient
 */'''

            js_success = writer.write_docstring(
                filepath=str(js_file),
                item_name='divide',
                item_type='function',
                docstring=js_docstring,
                language='javascript',
                line_number=1
            )

            # Test TypeScript
            ts_docstring = '''/**
 * Calculate base raised to exponent.
 * @param base - Base number
 * @param exp - Exponent
 * @returns Result of base^exp
 */'''

            ts_success = writer.write_docstring(
                filepath=str(ts_file),
                item_name='power',
                item_type='function',
                docstring=ts_docstring,
                language='typescript',
                line_number=1
            )

            # Verify all writes succeeded
            assert python_success, "Python write failed"
            assert js_success, "JavaScript write failed"
            assert ts_success, "TypeScript write failed"

            # Read and verify all files
            python_result = python_file.read_text()
            js_result = js_file.read_text()
            ts_result = ts_file.read_text()

            # Verify Python
            assert 'Multiply two numbers' in python_result
            assert '```python' not in python_result, "Python has markdown fence!"
            assert '```' not in python_result, "Python has backticks!"
            py_compile.compile(str(python_file), doraise=True)

            # Verify JavaScript
            assert 'Divide two numbers' in js_result
            assert '@param' in js_result
            assert '```javascript' not in js_result, "JavaScript has markdown fence!"
            assert '```js' not in js_result, "JavaScript has markdown fence!"

            # Verify TypeScript
            assert 'Calculate base raised to exponent' in ts_result
            assert '@param' in ts_result
            assert '```typescript' not in ts_result, "TypeScript has markdown fence!"
            assert '```ts' not in ts_result, "TypeScript has markdown fence!"

    def test_prompt_builder_contains_markdown_prevention_instructions(self):
        """Verify PromptBuilder includes instructions to prevent markdown wrappers.

        This test verifies that the fix (Option A from #232) is present in the
        generated prompts by checking that the prompt text explicitly instructs
        Claude NOT to wrap responses in markdown code fences.
        """
        # Create PromptBuilder
        builder = PromptBuilder(style_guide='google', tone='concise')

        # Sample code and context
        code = 'def sample_function(x, y):\n    if x > 0:\n        return x + y\n    return 0'
        context = 'class Calculator:\n    pass\n\n' + code

        # Build prompt using correct method signature
        prompt = builder.build_prompt(
            code=code,
            item_name='sample_function',
            item_type='function',
            language='python',
            context=context
        )

        # Verify markdown prevention instructions are present
        # These are the specific lines added in the fix (lines 277-280 of prompt_builder.py)
        assert 'Do NOT wrap your entire response in markdown code fences' in prompt, \
            "Prompt missing instruction to NOT use markdown wrappers"

        assert 'Code examples WITHIN the docstring are fine and encouraged' in prompt, \
            "Prompt missing clarification about internal code examples"

        # Verify it mentions backticks/code fences explicitly
        assert '```python' in prompt or '```javascript' in prompt or 'backticks' in prompt.lower(), \
            "Prompt should mention code fences/backticks as examples"

        # Verify Python-specific instruction (line 288)
        assert 'do NOT include the triple-quote delimiters' in prompt.lower() or \
               'will be added automatically' in prompt.lower(), \
            "Prompt should mention that triple-quote delimiters are added automatically"
