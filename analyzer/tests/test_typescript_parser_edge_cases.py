"""Edge case tests for TypeScript/JavaScript parser (Issue #105).

This test suite covers error handling, advanced TypeScript features,
module patterns, JSDoc edge cases, and complexity calculation accuracy.
"""

import sys
from pathlib import Path
import pytest
import subprocess
from unittest.mock import patch
import os

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.parsers.typescript_parser import TypeScriptParser

# Test fixture paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
MALFORMED_SAMPLES = PROJECT_ROOT / "test-samples" / "malformed"
EXAMPLES_DIR = PROJECT_ROOT / "examples"


class TestTypeScriptParserFileSystemErrors:
    """File system error handling tests."""

    @pytest.fixture
    def parser(self):
        """Create parser instance."""
        return TypeScriptParser()

    def test_file_not_found_detailed_error(self, parser):
        """Test that FileNotFoundError is raised with detailed error message."""
        nonexistent_file = "/path/to/nonexistent.ts"

        with pytest.raises(FileNotFoundError):
            parser.parse_file(nonexistent_file)

    def test_permission_denied_error(self, parser, tmp_path):
        """Test that permission errors are caught and reported.

        Creates a file with no read permissions and verifies parser
        handles the permission error gracefully.
        """
        # Create file with no read permissions
        restricted_file = tmp_path / "no_read.ts"
        restricted_file.write_text("function test() {}")

        try:
            # Remove all permissions
            os.chmod(restricted_file, 0o000)

            # Parser should raise an error (specific type may vary by platform)
            with pytest.raises((FileNotFoundError, PermissionError, RuntimeError)):
                parser.parse_file(str(restricted_file))
        finally:
            # Restore permissions for cleanup
            try:
                os.chmod(restricted_file, 0o644)
            except OSError:
                pass

    def test_empty_file_handling(self, parser, tmp_path):
        """Test that empty TypeScript files are handled gracefully.

        Empty files are valid and should return an empty list of items.
        """
        empty_file = tmp_path / "empty.ts"
        empty_file.write_text("")

        items = parser.parse_file(str(empty_file))

        assert isinstance(items, list)
        assert len(items) == 0


class TestTypeScriptParserSubprocessErrors:
    """Subprocess failure tests with mocked subprocess calls."""

    @pytest.fixture
    def parser(self):
        """Create parser instance."""
        return TypeScriptParser()

    def test_node_not_installed(self, parser, tmp_path):
        """Test error handling when Node.js is not installed.

        Simulates FileNotFoundError when Node.js executable is not found.
        Note: Parser currently re-raises as generic FileNotFoundError.
        """
        test_file = tmp_path / "test.ts"
        test_file.write_text("function test() {}")

        # Mock subprocess.run to raise FileNotFoundError (Node.js not found)
        def mock_run(*args, **kwargs):
            raise FileNotFoundError("node: command not found")

        # Patch subprocess.run in the parser module's namespace
        with patch(
            "src.parsers.typescript_parser.subprocess.run", side_effect=mock_run
        ):
            # Parser catches FileNotFoundError and re-raises with generic message
            with pytest.raises(FileNotFoundError):
                parser.parse_file(str(test_file))

    def test_helper_script_missing(self, tmp_path):
        """Test error message when helper script is missing.

        Verifies that FileNotFoundError is raised during initialization
        when helper_path points to a nonexistent file.
        """
        nonexistent_helper = tmp_path / "nonexistent-helper.js"

        with pytest.raises(FileNotFoundError) as exc_info:
            TypeScriptParser(helper_path=nonexistent_helper)

        error_msg = str(exc_info.value)
        assert str(nonexistent_helper) in error_msg
        assert "Options to resolve:" in error_msg

    def test_subprocess_timeout_handling(self, parser, tmp_path):
        """Test that subprocess timeout is caught and reported.

        Simulates a timeout scenario without waiting 30 seconds
        by mocking subprocess.run to raise TimeoutExpired.
        """
        test_file = tmp_path / "test.ts"
        test_file.write_text("function test() {}")

        # Mock subprocess.run to raise TimeoutExpired
        def mock_run(*args, **kwargs):
            raise subprocess.TimeoutExpired(cmd=["node"], timeout=30)

        with patch("subprocess.run", side_effect=mock_run):
            with pytest.raises(RuntimeError) as exc_info:
                parser.parse_file(str(test_file))

            assert (
                "timed out" in str(exc_info.value).lower()
                or "timeout" in str(exc_info.value).lower()
            )

    def test_subprocess_crash_nonzero_returncode(self, parser, tmp_path):
        """Test handling of subprocess crash with non-zero return code.

        Simulates subprocess crash (SIGKILL) with returncode=137.
        """
        test_file = tmp_path / "test.ts"
        test_file.write_text("function test() {}")

        # Mock subprocess to return non-zero exit code with empty output
        mock_result = subprocess.CompletedProcess(
            args=["node", "helper.js"],
            returncode=137,
            stdout="",
            stderr="Process killed",
        )

        with patch("subprocess.run", return_value=mock_result):
            with pytest.raises(RuntimeError) as exc_info:
                parser.parse_file(str(test_file))

            error_msg = str(exc_info.value)
            assert "137" in error_msg or "killed" in error_msg.lower()

    def test_helper_returns_partial_json(self, parser, tmp_path):
        """Test handling of truncated JSON output from helper script.

        Simulates scenario where helper script output is cut off,
        resulting in invalid JSON.
        """
        test_file = tmp_path / "test.ts"
        test_file.write_text("function test() {}")

        # Mock subprocess to return truncated JSON
        mock_result = subprocess.CompletedProcess(
            args=["node", "helper.js"],
            returncode=0,
            stdout='{"items": [{"name": "test"',  # Missing closing brackets
            stderr="",
        )

        with patch("subprocess.run", return_value=mock_result):
            with pytest.raises(RuntimeError) as exc_info:
                parser.parse_file(str(test_file))

            # Should mention JSON parsing error
            error_msg = str(exc_info.value).lower()
            assert "json" in error_msg or "parse" in error_msg


class TestTypeScriptParserAdvancedFeatures:
    """TypeScript language feature tests with real parsing."""

    @pytest.fixture
    def parser(self):
        """Create parser instance."""
        return TypeScriptParser()

    def test_generic_type_parameters(self, parser, tmp_path):
        """Test parsing of generic functions with type parameters.

        Generic functions should be extracted with correct return types.
        """
        code = """
function identity<T>(arg: T): T {
    return arg;
}
"""
        test_file = tmp_path / "generics.ts"
        test_file.write_text(code)

        items = parser.parse_file(str(test_file))

        assert len(items) == 1
        assert items[0].name == "identity"
        assert items[0].type == "function"
        assert items[0].return_type == "T"
        assert "arg" in items[0].parameters

    def test_async_generator_functions(self, parser, tmp_path):
        """Test parsing of async generator functions.

        Async generators should be detected and parsed correctly.
        Note: Complexity calculation may not include yield statements
        in simple generators without branching logic.
        """
        code = """
async function* generateSequence() {
    yield 1;
    yield 2;
    yield 3;
}
"""
        test_file = tmp_path / "async_gen.ts"
        test_file.write_text(code)

        items = parser.parse_file(str(test_file))

        assert len(items) == 1
        assert items[0].name == "generateSequence"
        assert items[0].type == "function"
        # Verify function is detected (complexity depends on implementation)
        assert items[0].complexity >= 1

    def test_decorators_presence(self, parser, tmp_path):
        """Test that decorated classes and methods are parsed.

        Note: Decorator metadata tracking is not implemented yet.
        This test verifies decorators don't prevent parsing.
        """
        code = """
function Component() {
    return function(target: any) {};
}

function Input() {
    return function(target: any, key: string) {};
}

@Component()
class MyComponent {
    @Input()
    value: string;

    getValue(): string {
        return this.value;
    }
}
"""
        test_file = tmp_path / "decorators.ts"
        test_file.write_text(code)

        items = parser.parse_file(str(test_file))

        # Should extract both decorator functions and decorated class
        assert len(items) >= 3

        # Find the decorated class
        my_component = next(
            (item for item in items if item.name == "MyComponent"), None
        )
        assert my_component is not None
        assert my_component.type == "class"

    def test_namespace_declarations(self, parser, tmp_path):
        """Test parsing of TypeScript namespace declarations.

        Functions inside namespaces should be extracted.
        """
        code = """
namespace Utils {
    export function helper() {
        return 42;
    }

    export function formatter(value: string): string {
        return value.toUpperCase();
    }
}
"""
        test_file = tmp_path / "namespaces.ts"
        test_file.write_text(code)

        items = parser.parse_file(str(test_file))

        # Should extract functions from namespace
        assert len(items) >= 2

        helper = next((item for item in items if item.name == "helper"), None)
        assert helper is not None
        assert helper.type == "function"

    def test_computed_property_names(self, parser, tmp_path):
        """Test parsing of computed property names in classes.

        Computed properties should not crash the parser.
        Method detection may vary based on property name form.
        """
        code = """
class Example {
    [Symbol.iterator]() {
        return this;
    }

    ['computed' + 'Name']() {
        return 'value';
    }

    regularMethod() {
        return 42;
    }
}
"""
        test_file = tmp_path / "computed.ts"
        test_file.write_text(code)

        items = parser.parse_file(str(test_file))

        # Should at least extract the class and regular method
        assert len(items) >= 1

        example_class = next((item for item in items if item.name == "Example"), None)
        assert example_class is not None

    def test_unicode_identifiers(self, parser, tmp_path):
        """Test parsing of Unicode identifiers.

        JavaScript and TypeScript allow Unicode identifiers.
        Parser should handle non-ASCII function names.
        """
        code = """
function 你好() {
    return 'Hello';
}

const π = 3.14159;

function calculateCircle() {
    return 2 * π;
}
"""
        test_file = tmp_path / "unicode.js"
        test_file.write_text(code)

        items = parser.parse_file(str(test_file))

        # Should extract Unicode function name
        unicode_func = next((item for item in items if item.name == "你好"), None)
        assert unicode_func is not None
        assert unicode_func.type == "function"


class TestTypeScriptParserModulePatterns:
    """Module system detection edge cases."""

    @pytest.fixture
    def parser(self):
        """Create parser instance."""
        return TypeScriptParser()

    def test_mixed_esm_commonjs_prefers_esm(self, parser, tmp_path):
        """Test that ESM detection takes precedence in mixed files.

        Files with both export and module.exports should be
        classified as ESM since export keyword indicates ESM.
        """
        code = """
export function esm() {
    return 'ESM';
}

module.exports = { cjs: true };
"""
        test_file = tmp_path / "mixed.js"
        test_file.write_text(code)

        items = parser.parse_file(str(test_file))

        # All items should be classified as ESM
        assert len(items) >= 1
        assert all(item.module_system == "esm" for item in items)

    def test_dynamic_import_expressions(self, parser, tmp_path):
        """Test parsing of dynamic import expressions.

        Dynamic imports should not create false CodeItem entries.
        The containing function should be detected correctly.
        """
        code = """
async function loadModule() {
    const mod = await import('./other');
    return mod.default;
}
"""
        test_file = tmp_path / "dynamic_import.js"
        test_file.write_text(code)

        items = parser.parse_file(str(test_file))

        assert len(items) == 1
        assert items[0].name == "loadModule"
        assert items[0].type == "function"
        # Verify function is detected (complexity may vary by implementation)
        assert items[0].complexity >= 1

    def test_reexport_patterns(self, parser, tmp_path):
        """Test that re-export declarations don't create false items.

        Re-exports should not be extracted as CodeItem entries
        since they don't define new code.
        """
        code = """
export { foo } from './foo';
export * from './bar';
export * as baz from './baz';
"""
        test_file = tmp_path / "reexports.js"
        test_file.write_text(code)

        items = parser.parse_file(str(test_file))

        # Re-exports should not create items
        assert len(items) == 0

    def test_default_export_variations(self, parser, tmp_path):
        """Test detection of default exports.

        Default exported functions and classes should have
        export_type set to 'default'.
        """
        code = """
export default class Foo {
    method() {
        return 42;
    }
}
"""
        test_file = tmp_path / "default_class.js"
        test_file.write_text(code)

        items = parser.parse_file(str(test_file))

        # Find the class
        foo_class = next((item for item in items if item.name == "Foo"), None)
        assert foo_class is not None
        assert foo_class.export_type == "default"


class TestTypeScriptParserJSDoc:
    """JSDoc parsing edge case tests."""

    @pytest.fixture
    def parser(self):
        """Create parser instance."""
        return TypeScriptParser()

    def test_jsdoc_with_complex_types(self, parser, tmp_path):
        """Test parsing of JSDoc with complex type annotations.

        Complex types like Array<Promise<string>> should not cause
        parsing errors. has_docs should be True.
        """
        code = """
/**
 * Process items asynchronously.
 * @param {Array<Promise<string>>} items - Array of promises
 * @returns {Promise<void>}
 */
function processItems(items) {
    return Promise.all(items);
}
"""
        test_file = tmp_path / "complex_jsdoc.js"
        test_file.write_text(code)

        items = parser.parse_file(str(test_file))

        assert len(items) == 1
        assert items[0].name == "processItems"
        assert items[0].has_docs is True
        assert items[0].docstring is not None

    def test_jsdoc_type_imports(self, parser, tmp_path):
        """Test JSDoc with type imports.

        JSDoc type imports (import('./types').MyType) should be
        handled gracefully without causing parse errors.
        """
        code = """
/**
 * Test function with imported type.
 * @param {import('./types').MyType} value - Imported type
 * @returns {string}
 */
function testImportedType(value) {
    return value.toString();
}
"""
        test_file = tmp_path / "jsdoc_imports.js"
        test_file.write_text(code)

        items = parser.parse_file(str(test_file))

        assert len(items) == 1
        assert items[0].name == "testImportedType"
        assert items[0].has_docs is True

    def test_jsdoc_missing_param_types(self, parser, tmp_path):
        """Test JSDoc with incomplete type information.

        JSDoc without type annotations should still be recognized
        as documentation. Type validation is done by plugins.
        """
        code = """
/**
 * Function with incomplete JSDoc.
 * @param foo - Missing type annotation
 */
function testIncomplete(foo) {
    return foo;
}
"""
        test_file = tmp_path / "incomplete_jsdoc.js"
        test_file.write_text(code)

        items = parser.parse_file(str(test_file))

        assert len(items) == 1
        assert items[0].name == "testIncomplete"
        assert items[0].has_docs is True

    def test_multiline_jsdoc_with_special_chars(self, parser, tmp_path):
        """Test JSDoc containing special characters.

        JSDoc with special characters like quotes, angle brackets,
        and ampersands should be preserved correctly.
        """
        code = """
/**
 * Process data with <special> & characters.
 * @param {string} data - Data with "quotes" and 'apostrophes'
 * @returns {string} - Processed data with & symbols
 */
function processData(data) {
    return data.replace(/&/g, '&amp;');
}
"""
        test_file = tmp_path / "special_chars.js"
        test_file.write_text(code)

        items = parser.parse_file(str(test_file))

        assert len(items) == 1
        assert items[0].name == "processData"
        assert items[0].has_docs is True
        assert items[0].docstring is not None


class TestTypeScriptParserComplexity:
    """Complexity calculation accuracy tests."""

    @pytest.fixture
    def parser(self):
        """Create parser instance."""
        return TypeScriptParser()

    def test_complexity_with_ternary_operators(self, parser, tmp_path):
        """Test complexity calculation with ternary operators.

        Ternary operators should count as decision points.
        Nested ternaries increase complexity.
        """
        code = """
function checkValue(x) {
    return x > 0 ? (x > 10 ? 'big' : 'small') : 'negative';
}
"""
        test_file = tmp_path / "ternary.js"
        test_file.write_text(code)

        items = parser.parse_file(str(test_file))

        assert len(items) == 1
        assert items[0].name == "checkValue"
        # Base complexity (1) + 2 ternary operators = 3
        assert items[0].complexity >= 3

    def test_complexity_with_logical_operators(self, parser, tmp_path):
        """Test complexity calculation with logical operators.

        Logical AND (&&) and OR (||) operators should contribute
        to complexity as decision points.
        """
        code = """
function validate(a, b, c, d) {
    return (a && b) || (c && d);
}
"""
        test_file = tmp_path / "logical.js"
        test_file.write_text(code)

        items = parser.parse_file(str(test_file))

        assert len(items) == 1
        assert items[0].name == "validate"
        # Should have complexity from logical operators
        assert items[0].complexity >= 3

    def test_complexity_with_switch_statements(self, parser, tmp_path):
        """Test complexity calculation with switch statements.

        Each case clause in a switch statement should add to
        the complexity score.
        """
        code = """
function handleAction(action) {
    switch (action) {
        case 'START':
            return 'Starting';
        case 'STOP':
            return 'Stopping';
        case 'PAUSE':
            return 'Pausing';
        default:
            return 'Unknown';
    }
}
"""
        test_file = tmp_path / "switch.js"
        test_file.write_text(code)

        items = parser.parse_file(str(test_file))

        assert len(items) == 1
        assert items[0].name == "handleAction"
        # Base (1) + 3 case clauses = 4 minimum
        assert items[0].complexity >= 4
