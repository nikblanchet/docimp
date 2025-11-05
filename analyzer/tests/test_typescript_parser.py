"""Tests for TypeScript/JavaScript parser."""

import sys
from pathlib import Path
import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.parsers.typescript_parser import TypeScriptParser
from src.models.code_item import CodeItem

# Test fixture paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
MALFORMED_SAMPLES = PROJECT_ROOT / "test-samples" / "malformed"
EXAMPLES_DIR = PROJECT_ROOT / "examples"


class TestTypeScriptParserInitialization:
    """Test suite for TypeScriptParser initialization and dependency

    injection (Issue #63)."""

    def test_explicit_helper_path_injection(self, tmp_path):
        """Test explicit helper_path parameter (Priority 1: dependency injection)."""
        # Create a mock helper file
        mock_helper = tmp_path / "mock-helper.js"
        mock_helper.write_text("// mock helper")

        # Inject explicit path
        parser = TypeScriptParser(helper_path=mock_helper)

        assert parser.helper_path == mock_helper
        assert parser.helper_path.exists()

    def test_environment_variable_resolution(self, tmp_path, monkeypatch):
        """Test DOCIMP_TS_HELPER_PATH environment variable (Priority 2)."""
        # Create a mock helper file
        mock_helper = tmp_path / "env-helper.js"
        mock_helper.write_text("// env helper")

        # Set environment variable
        monkeypatch.setenv("DOCIMP_TS_HELPER_PATH", str(mock_helper))

        # Create parser without explicit path
        parser = TypeScriptParser()

        assert parser.helper_path == mock_helper
        assert parser.helper_path.exists()

    def test_auto_detection_fallback(self):
        """Test auto-detection fallback (Priority 3: development environment)."""
        # Create parser without explicit path or env var
        parser = TypeScriptParser()

        # Should auto-detect the real helper path
        assert parser.helper_path is not None
        assert parser.helper_path.exists()
        assert parser.helper_path.name == "ts-js-parser-cli.js"

    def test_priority_explicit_over_environment(self, tmp_path, monkeypatch):
        """Test that explicit parameter takes priority over environment variable."""
        # Create two mock helper files
        explicit_helper = tmp_path / "explicit-helper.js"
        explicit_helper.write_text("// explicit")
        env_helper = tmp_path / "env-helper.js"
        env_helper.write_text("// env")

        # Set environment variable
        monkeypatch.setenv("DOCIMP_TS_HELPER_PATH", str(env_helper))

        # Create parser with explicit path (should override env var)
        parser = TypeScriptParser(helper_path=explicit_helper)

        assert parser.helper_path == explicit_helper
        assert parser.helper_path != env_helper

    def test_priority_environment_over_auto_detection(self, tmp_path, monkeypatch):
        """Test that environment variable takes priority over auto-detection."""
        # Create a mock helper file
        mock_helper = tmp_path / "env-helper.js"
        mock_helper.write_text("// env helper")

        # Set environment variable
        monkeypatch.setenv("DOCIMP_TS_HELPER_PATH", str(mock_helper))

        # Create parser without explicit path
        parser = TypeScriptParser()

        # Should use env var, not auto-detection
        assert parser.helper_path == mock_helper
        assert "env-helper.js" in str(parser.helper_path)

    def test_error_when_explicit_path_not_found(self, tmp_path):
        """Test that FileNotFoundError is raised when explicit path doesn't exist."""
        nonexistent_path = tmp_path / "nonexistent-helper.js"

        with pytest.raises(FileNotFoundError) as exc_info:
            TypeScriptParser(helper_path=nonexistent_path)

        error_msg = str(exc_info.value)
        assert str(nonexistent_path) in error_msg
        assert "Options to resolve:" in error_msg
        assert "Build the TypeScript CLI" in error_msg
        assert "DOCIMP_TS_HELPER_PATH" in error_msg

    def test_error_when_environment_path_not_found(self, tmp_path, monkeypatch):
        """Test that FileNotFoundError is raised when env var path doesn't exist."""
        nonexistent_path = tmp_path / "nonexistent-helper.js"
        monkeypatch.setenv("DOCIMP_TS_HELPER_PATH", str(nonexistent_path))

        with pytest.raises(FileNotFoundError) as exc_info:
            TypeScriptParser()

        error_msg = str(exc_info.value)
        assert str(nonexistent_path) in error_msg
        assert "Options to resolve:" in error_msg

    def test_backward_compatibility_default_instantiation(self):
        """Test backward compatibility: TypeScriptParser() still works."""
        # This is how existing code instantiates the parser
        parser = TypeScriptParser()

        # Should work without any parameters
        assert parser is not None
        assert parser.helper_path.exists()

    def test_find_helper_returns_path_object(self):
        """Test that _find_helper() returns a Path object."""
        parser = TypeScriptParser()
        helper_path = parser._find_helper()

        assert isinstance(helper_path, Path)

    def test_find_helper_strategy_development_environment(self):
        """Test that _find_helper() finds the development environment path."""
        parser = TypeScriptParser()
        helper_path = parser._find_helper()

        # Should find the cli/dist/parsers/ts-js-parser-cli.js path
        assert "cli" in str(helper_path)
        assert "dist" in str(helper_path)
        assert "parsers" in str(helper_path)
        assert "ts-js-parser-cli.js" in str(helper_path)


class TestTypeScriptParser:
    """Test suite for TypeScript parser."""

    @pytest.fixture
    def parser(self):
        """Create parser instance."""
        return TypeScriptParser()

    @pytest.fixture
    def ts_file(self):
        """Return path to test TypeScript file."""
        return str(EXAMPLES_DIR / "test_simple.ts")

    @pytest.fixture
    def js_esm_file(self):
        """Return path to test JavaScript ESM file."""
        return str(EXAMPLES_DIR / "test_javascript_patterns.js")

    @pytest.fixture
    def js_cjs_file(self):
        """Return path to test CommonJS file."""
        return str(EXAMPLES_DIR / "test_commonjs.cjs")

    def test_parser_initialization(self, parser):
        """Test that parser initializes correctly."""
        assert parser is not None
        assert parser.helper_path.exists()

    def test_parse_typescript_file(self, parser, ts_file):
        """Test parsing a TypeScript file."""
        items = parser.parse_file(ts_file)

        assert len(items) > 0
        assert all(isinstance(item, CodeItem) for item in items)
        assert all(item.language == "typescript" for item in items)

    def test_typescript_extracts_classes(self, parser, ts_file):
        """Test that TypeScript parser extracts classes."""
        items = parser.parse_file(ts_file)

        classes = [item for item in items if item.type == "class"]
        assert len(classes) > 0

        # Check UserService class exists
        user_service = next((c for c in classes if c.name == "UserService"), None)
        assert user_service is not None

    def test_typescript_extracts_methods(self, parser, ts_file):
        """Test that TypeScript parser extracts methods."""
        items = parser.parse_file(ts_file)

        methods = [item for item in items if item.type == "method"]
        assert len(methods) > 0

        # Check getUser method
        get_user = next((m for m in methods if "getUser" in m.name), None)
        assert get_user is not None
        assert get_user.has_docs
        assert "id" in get_user.parameters

    def test_typescript_extracts_functions(self, parser, ts_file):
        """Test that TypeScript parser extracts functions."""
        items = parser.parse_file(ts_file)

        functions = [item for item in items if item.type == "function"]
        assert len(functions) > 0

        # Check validateEmail function exists
        validate_email = next((f for f in functions if f.name == "validateEmail"), None)
        assert validate_email is not None

    def test_typescript_extracts_interfaces(self, parser, ts_file):
        """Test that TypeScript parser extracts interfaces."""
        items = parser.parse_file(ts_file)

        interfaces = [item for item in items if item.type == "interface"]
        assert len(interfaces) > 0

        # Check User interface
        user_interface = next((i for i in interfaces if i.name == "User"), None)
        assert user_interface is not None

    def test_typescript_detects_exports(self, parser, ts_file):
        """Test that TypeScript parser detects export types."""
        items = parser.parse_file(ts_file)

        # Should have named exports
        exported_items = [item for item in items if item.export_type == "named"]
        assert len(exported_items) > 0

    def test_typescript_complexity_calculation(self, parser, ts_file):
        """Test that complexity is calculated correctly."""
        items = parser.parse_file(ts_file)

        # helperFunction has multiple if/else branches
        helper = next((item for item in items if "helperFunction" in item.name), None)
        assert helper is not None
        assert helper.complexity > 1  # Should have complexity > 1 due to branches

    def test_typescript_detects_undocumented(self, parser, ts_file):
        """Test that parser detects undocumented items."""
        items = parser.parse_file(ts_file)

        # helperFunction has no documentation
        helper = next((item for item in items if "helperFunction" in item.name), None)
        assert helper is not None
        assert not helper.has_docs

    def test_parse_javascript_esm_file(self, parser, js_esm_file):
        """Test parsing a JavaScript ESM file."""
        items = parser.parse_file(js_esm_file)

        assert len(items) > 0
        assert all(isinstance(item, CodeItem) for item in items)
        assert all(item.language == "javascript" for item in items)

    def test_javascript_detects_esm_module_system(self, parser, js_esm_file):
        """Test that JavaScript parser detects ESM module system."""
        items = parser.parse_file(js_esm_file)

        # All items should be ESM
        assert all(item.module_system == "esm" for item in items)

    def test_javascript_esm_exports(self, parser, js_esm_file):
        """Test that JavaScript parser detects ESM exports."""
        items = parser.parse_file(js_esm_file)

        # Should have named exports
        named_exports = [item for item in items if item.export_type == "named"]
        assert len(named_exports) > 0

    def test_javascript_extracts_arrow_functions(self, parser, js_esm_file):
        """Test that JavaScript parser extracts arrow functions."""
        items = parser.parse_file(js_esm_file)

        # Check for 'first' arrow function
        first_func = next((item for item in items if item.name == "first"), None)
        assert first_func is not None
        assert first_func.type == "function"

    def test_javascript_jsdoc_detection(self, parser, js_esm_file):
        """Test that JavaScript parser detects JSDoc documentation."""
        items = parser.parse_file(js_esm_file)

        # fetchUser should have JSDoc
        fetch_user = next((item for item in items if item.name == "fetchUser"), None)
        assert fetch_user is not None
        assert fetch_user.has_docs

        # undocumentedHelper should not have docs
        undoc = next(
            (item for item in items if "undocumented" in item.name.lower()), None
        )
        assert undoc is not None
        assert not undoc.has_docs

    def test_parse_commonjs_file(self, parser, js_cjs_file):
        """Test parsing a CommonJS file."""
        items = parser.parse_file(js_cjs_file)

        assert len(items) > 0
        assert all(isinstance(item, CodeItem) for item in items)
        assert all(item.language == "javascript" for item in items)

    def test_commonjs_detects_module_system(self, parser, js_cjs_file):
        """Test that parser detects CommonJS module system."""
        items = parser.parse_file(js_cjs_file)

        # Should detect CommonJS
        commonjs_items = [item for item in items if item.module_system == "commonjs"]
        assert len(commonjs_items) > 0

    def test_commonjs_exports(self, parser, js_cjs_file):
        """Test that parser detects CommonJS exports."""
        items = parser.parse_file(js_cjs_file)

        # Should have commonjs export type
        cjs_exports = [item for item in items if item.export_type == "commonjs"]
        assert len(cjs_exports) > 0

        # Check for specific exported functions
        average = next((item for item in items if item.name == "average"), None)
        assert average is not None
        assert average.export_type == "commonjs"

    def test_commonjs_module_exports_object(self, parser, js_cjs_file):
        """Test parsing module.exports = {...} pattern."""
        items = parser.parse_file(js_cjs_file)

        # Should extract functions from module.exports object
        func_names = [item.name for item in items]
        assert "average" in func_names
        assert "max" in func_names
        assert "min" in func_names

    def test_commonjs_module_exports_property(self, parser, js_cjs_file):
        """Test parsing module.exports.foo = ... pattern."""
        items = parser.parse_file(js_cjs_file)

        # Should extract median function
        median = next((item for item in items if item.name == "median"), None)
        assert median is not None
        assert median.has_docs

    def test_commonjs_exports_property(self, parser, js_cjs_file):
        """Test parsing exports.foo = ... pattern."""
        items = parser.parse_file(js_cjs_file)

        # Should extract undocumentedHelper
        helper = next(
            (item for item in items if "undocumented" in item.name.lower()), None
        )
        assert helper is not None
        assert not helper.has_docs

    def test_file_not_found_error(self, parser):
        """Test that parser raises FileNotFoundError for missing files."""
        with pytest.raises(FileNotFoundError):
            parser.parse_file("/nonexistent/file.ts")

    def test_all_items_have_required_fields(self, parser, ts_file):
        """Test that all extracted items have required fields."""
        items = parser.parse_file(ts_file)

        for item in items:
            assert item.name
            assert item.type in ["function", "class", "method", "interface"]
            assert item.filepath
            assert item.line_number > 0
            assert item.language in ["typescript", "javascript"]
            assert item.complexity >= 1
            assert isinstance(item.has_docs, bool)
            assert isinstance(item.parameters, list)
            assert item.export_type in ["named", "default", "commonjs", "internal"]
            assert item.module_system in ["esm", "commonjs", "unknown"]


class TestTypeScriptParserMalformedSyntax:
    """Test suite for TypeScriptParser malformed syntax handling (Issue #199)."""

    @pytest.fixture
    def parser(self):
        """Create parser instance."""
        return TypeScriptParser()

    @pytest.fixture
    def malformed_dir(self):
        """Return path to malformed test samples directory."""
        return MALFORMED_SAMPLES

    def test_typescript_parser_uses_error_recovery(self, parser, malformed_dir):
        """Test that TypeScript parser uses error recovery for malformed files.

        Expected: Parser returns list (empty or partial) without raising exceptions.
        This differs from Python's strict AST parser which raises SyntaxError.
        """
        # TypeScript parser is designed to be tolerant of errors for IDE support
        # It uses error recovery to parse partial ASTs even with syntax errors

        # Parse a file with missing brace - should succeed with partial AST
        result = parser.parse_file(str(malformed_dir / "typescript_missing_brace.ts"))
        assert isinstance(result, list), "Should return list even with syntax errors"

        # The key test is that it doesn't crash - error recovery allows partial parsing
        # In contrast, Python's AST parser raises SyntaxError immediately

    def test_javascript_parser_uses_error_recovery(self, parser, malformed_dir):
        """Test that JavaScript parser uses error recovery like TypeScript.

        Expected: Parser returns list (empty or partial) without raising exceptions.
        JavaScript files use the same TypeScript parser with checkJs enabled.
        """
        # JavaScript files are parsed using the same TypeScript parser
        # with checkJs enabled, so error recovery also applies

        # Parse files with syntax errors - should succeed with partial ASTs
        js_files = [
            "javascript_esm_error.js",
            "javascript_arrow_error.js",
            "javascript_commonjs_error.cjs",
            "javascript_unclosed_bracket.mjs",
        ]

        for filename in js_files:
            result = parser.parse_file(str(malformed_dir / filename))
            assert isinstance(
                result, list
            ), f"{filename} should return list (error recovery allows partial parsing)"
