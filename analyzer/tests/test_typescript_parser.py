"""Tests for TypeScript/JavaScript parser."""

import sys
from pathlib import Path
import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.parsers.typescript_parser import TypeScriptParser
from src.models.code_item import CodeItem


class TestTypeScriptParser:
    """Test suite for TypeScript parser."""

    @pytest.fixture
    def parser(self):
        """Create parser instance."""
        return TypeScriptParser()

    @pytest.fixture
    def ts_file(self):
        """Return path to test TypeScript file."""
        project_root = Path(__file__).parent.parent.parent
        return str(project_root / 'examples' / 'test_simple.ts')

    @pytest.fixture
    def js_esm_file(self):
        """Return path to test JavaScript ESM file."""
        project_root = Path(__file__).parent.parent.parent
        return str(project_root / 'examples' / 'test_javascript_patterns.js')

    @pytest.fixture
    def js_cjs_file(self):
        """Return path to test CommonJS file."""
        project_root = Path(__file__).parent.parent.parent
        return str(project_root / 'examples' / 'test_commonjs.cjs')

    def test_parser_initialization(self, parser):
        """Test that parser initializes correctly."""
        assert parser is not None
        assert parser.helper_path.exists()

    def test_parse_typescript_file(self, parser, ts_file):
        """Test parsing a TypeScript file."""
        items = parser.parse_file(ts_file)

        assert len(items) > 0
        assert all(isinstance(item, CodeItem) for item in items)
        assert all(item.language == 'typescript' for item in items)

    def test_typescript_extracts_classes(self, parser, ts_file):
        """Test that TypeScript parser extracts classes."""
        items = parser.parse_file(ts_file)

        classes = [item for item in items if item.type == 'class']
        assert len(classes) > 0

        # Check UserService class exists
        user_service = next((c for c in classes if c.name == 'UserService'), None)
        assert user_service is not None

    def test_typescript_extracts_methods(self, parser, ts_file):
        """Test that TypeScript parser extracts methods."""
        items = parser.parse_file(ts_file)

        methods = [item for item in items if item.type == 'method']
        assert len(methods) > 0

        # Check getUser method
        get_user = next((m for m in methods if 'getUser' in m.name), None)
        assert get_user is not None
        assert get_user.has_docs
        assert 'id' in get_user.parameters

    def test_typescript_extracts_functions(self, parser, ts_file):
        """Test that TypeScript parser extracts functions."""
        items = parser.parse_file(ts_file)

        functions = [item for item in items if item.type == 'function']
        assert len(functions) > 0

        # Check validateEmail function exists
        validate_email = next((f for f in functions if f.name == 'validateEmail'), None)
        assert validate_email is not None

    def test_typescript_extracts_interfaces(self, parser, ts_file):
        """Test that TypeScript parser extracts interfaces."""
        items = parser.parse_file(ts_file)

        interfaces = [item for item in items if item.type == 'interface']
        assert len(interfaces) > 0

        # Check User interface
        user_interface = next((i for i in interfaces if i.name == 'User'), None)
        assert user_interface is not None

    def test_typescript_detects_exports(self, parser, ts_file):
        """Test that TypeScript parser detects export types."""
        items = parser.parse_file(ts_file)

        # Should have named exports
        exported_items = [item for item in items if item.export_type == 'named']
        assert len(exported_items) > 0

    def test_typescript_complexity_calculation(self, parser, ts_file):
        """Test that complexity is calculated correctly."""
        items = parser.parse_file(ts_file)

        # helperFunction has multiple if/else branches
        helper = next((item for item in items if 'helperFunction' in item.name), None)
        assert helper is not None
        assert helper.complexity > 1  # Should have complexity > 1 due to branches

    def test_typescript_detects_undocumented(self, parser, ts_file):
        """Test that parser detects undocumented items."""
        items = parser.parse_file(ts_file)

        # helperFunction has no documentation
        helper = next((item for item in items if 'helperFunction' in item.name), None)
        assert helper is not None
        assert not helper.has_docs

    def test_parse_javascript_esm_file(self, parser, js_esm_file):
        """Test parsing a JavaScript ESM file."""
        items = parser.parse_file(js_esm_file)

        assert len(items) > 0
        assert all(isinstance(item, CodeItem) for item in items)
        assert all(item.language == 'javascript' for item in items)

    def test_javascript_detects_esm_module_system(self, parser, js_esm_file):
        """Test that JavaScript parser detects ESM module system."""
        items = parser.parse_file(js_esm_file)

        # All items should be ESM
        assert all(item.module_system == 'esm' for item in items)

    def test_javascript_esm_exports(self, parser, js_esm_file):
        """Test that JavaScript parser detects ESM exports."""
        items = parser.parse_file(js_esm_file)

        # Should have named exports
        named_exports = [item for item in items if item.export_type == 'named']
        assert len(named_exports) > 0

    def test_javascript_extracts_arrow_functions(self, parser, js_esm_file):
        """Test that JavaScript parser extracts arrow functions."""
        items = parser.parse_file(js_esm_file)

        # Check for 'first' arrow function
        first_func = next((item for item in items if item.name == 'first'), None)
        assert first_func is not None
        assert first_func.type == 'function'

    def test_javascript_jsdoc_detection(self, parser, js_esm_file):
        """Test that JavaScript parser detects JSDoc documentation."""
        items = parser.parse_file(js_esm_file)

        # fetchUser should have JSDoc
        fetch_user = next((item for item in items if item.name == 'fetchUser'), None)
        assert fetch_user is not None
        assert fetch_user.has_docs

        # undocumentedHelper should not have docs
        undoc = next((item for item in items if 'undocumented' in item.name.lower()), None)
        assert undoc is not None
        assert not undoc.has_docs

    def test_parse_commonjs_file(self, parser, js_cjs_file):
        """Test parsing a CommonJS file."""
        items = parser.parse_file(js_cjs_file)

        assert len(items) > 0
        assert all(isinstance(item, CodeItem) for item in items)
        assert all(item.language == 'javascript' for item in items)

    def test_commonjs_detects_module_system(self, parser, js_cjs_file):
        """Test that parser detects CommonJS module system."""
        items = parser.parse_file(js_cjs_file)

        # Should detect CommonJS
        commonjs_items = [item for item in items if item.module_system == 'commonjs']
        assert len(commonjs_items) > 0

    def test_commonjs_exports(self, parser, js_cjs_file):
        """Test that parser detects CommonJS exports."""
        items = parser.parse_file(js_cjs_file)

        # Should have commonjs export type
        cjs_exports = [item for item in items if item.export_type == 'commonjs']
        assert len(cjs_exports) > 0

        # Check for specific exported functions
        average = next((item for item in items if item.name == 'average'), None)
        assert average is not None
        assert average.export_type == 'commonjs'

    def test_commonjs_module_exports_object(self, parser, js_cjs_file):
        """Test parsing module.exports = {...} pattern."""
        items = parser.parse_file(js_cjs_file)

        # Should extract functions from module.exports object
        func_names = [item.name for item in items]
        assert 'average' in func_names
        assert 'max' in func_names
        assert 'min' in func_names

    def test_commonjs_module_exports_property(self, parser, js_cjs_file):
        """Test parsing module.exports.foo = ... pattern."""
        items = parser.parse_file(js_cjs_file)

        # Should extract median function
        median = next((item for item in items if item.name == 'median'), None)
        assert median is not None
        assert median.has_docs

    def test_commonjs_exports_property(self, parser, js_cjs_file):
        """Test parsing exports.foo = ... pattern."""
        items = parser.parse_file(js_cjs_file)

        # Should extract undocumentedHelper
        helper = next((item for item in items if 'undocumented' in item.name.lower()), None)
        assert helper is not None
        assert not helper.has_docs

    def test_file_not_found_error(self, parser):
        """Test that parser raises FileNotFoundError for missing files."""
        with pytest.raises(FileNotFoundError):
            parser.parse_file('/nonexistent/file.ts')

    def test_all_items_have_required_fields(self, parser, ts_file):
        """Test that all extracted items have required fields."""
        items = parser.parse_file(ts_file)

        for item in items:
            assert item.name
            assert item.type in ['function', 'class', 'method', 'interface']
            assert item.filepath
            assert item.line_number > 0
            assert item.language in ['typescript', 'javascript']
            assert item.complexity >= 1
            assert isinstance(item.has_docs, bool)
            assert isinstance(item.parameters, list)
            assert item.export_type in ['named', 'default', 'commonjs', 'internal']
            assert item.module_system in ['esm', 'commonjs', 'unknown']
