"""Tests for parser implementations."""

import sys
from pathlib import Path
import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.parsers.python_parser import PythonParser
from src.models.code_item import CodeItem


class TestPythonParser:
    """Test suite for PythonParser."""

    @pytest.fixture
    def parser(self):
        """Create a PythonParser instance."""
        return PythonParser()

    @pytest.fixture
    def test_file(self):
        """Return path to test Python file."""
        # Get path relative to project root
        test_dir = Path(__file__).parent.parent.parent
        return str(test_dir / 'examples' / 'test_simple.py')

    def test_parse_file_returns_code_items(self, parser, test_file):
        """Test that parse_file returns a list of CodeItem objects."""
        items = parser.parse_file(test_file)

        assert isinstance(items, list)
        assert len(items) > 0
        assert all(isinstance(item, CodeItem) for item in items)

    def test_all_items_are_python(self, parser, test_file):
        """Test that all parsed items have language='python'."""
        items = parser.parse_file(test_file)

        assert all(item.language == 'python' for item in items)

    def test_complexity_is_positive(self, parser, test_file):
        """Test that all items have positive complexity."""
        items = parser.parse_file(test_file)

        assert all(item.complexity >= 1 for item in items)

    def test_detects_docstrings(self, parser, test_file):
        """Test that parser detects presence of docstrings."""
        items = parser.parse_file(test_file)

        # At least some items should have docs
        assert any(item.has_docs for item in items)

        # Check specific items
        async_func = next((item for item in items if item.name == 'async_function'), None)
        assert async_func is not None
        assert async_func.has_docs is True
        assert async_func.docstring is not None

    def test_extracts_function_metadata(self, parser, test_file):
        """Test that function metadata is extracted correctly."""
        items = parser.parse_file(test_file)

        async_func = next((item for item in items if item.name == 'async_function'), None)
        assert async_func is not None
        assert async_func.type == 'function'
        assert 'param1' in async_func.parameters
        assert 'param2' in async_func.parameters
        assert async_func.return_type == 'bool'

    def test_extracts_class_metadata(self, parser, test_file):
        """Test that class metadata is extracted correctly."""
        items = parser.parse_file(test_file)

        example_class = next((item for item in items if item.name == 'ExampleClass'), None)
        assert example_class is not None
        assert example_class.type == 'class'

    def test_extracts_methods(self, parser, test_file):
        """Test that class methods are extracted."""
        items = parser.parse_file(test_file)

        # Should have __init__ and value property
        init_method = next((item for item in items if item.name == 'ExampleClass.__init__'), None)
        assert init_method is not None
        assert init_method.type == 'method'
        assert init_method.has_docs is True

        value_property = next((item for item in items if item.name == 'ExampleClass.value'), None)
        assert value_property is not None
        assert value_property.type == 'method'

    def test_file_not_found_raises_error(self, parser):
        """Test that parsing non-existent file raises FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            parser.parse_file('nonexistent_file.py')

    def test_syntax_error_raises_error(self, parser, tmp_path):
        """Test that parsing invalid Python raises SyntaxError."""
        bad_file = tmp_path / "bad_syntax.py"
        bad_file.write_text("def broken(\n  this is not valid python")

        with pytest.raises(SyntaxError):
            parser.parse_file(str(bad_file))

    def test_complexity_calculation(self, parser, tmp_path):
        """Test that cyclomatic complexity is calculated correctly."""
        # Simple function should have complexity 1
        simple_file = tmp_path / "simple.py"
        simple_file.write_text("def simple():\n    return 42")

        simple_items = parser.parse_file(str(simple_file))
        assert simple_items[0].complexity == 1

        # Function with conditionals should have higher complexity
        complex_file = tmp_path / "complex.py"
        complex_file.write_text("""
def complex_func(x):
    if x > 0:
        if x < 10:
            return 'small'
        else:
            return 'big'
    else:
        return 'negative'
""")

        complex_items = parser.parse_file(str(complex_file))
        assert complex_items[0].complexity > 1

    def test_no_duplicate_methods(self, parser, test_file):
        """Test that methods are not extracted twice (issue #67 regression test)."""
        items = parser.parse_file(test_file)

        # test_simple.py contains:
        # - 1 function: async_function
        # - 1 class: ExampleClass
        # - 2 methods: __init__, value
        # Total: 4 items (NOT 6 with duplicates)
        assert len(items) == 4, f"Expected 4 items, got {len(items)}"

        # Get all item names
        item_names = [item.name for item in items]

        # Check that we have exactly the expected items
        assert 'async_function' in item_names
        assert 'ExampleClass' in item_names
        assert 'ExampleClass.__init__' in item_names
        assert 'ExampleClass.value' in item_names

        # Ensure methods are NOT extracted as plain functions
        assert '__init__' not in item_names, "Method __init__ should not appear as plain function"
        assert 'value' not in item_names, "Method value should not appear as plain function"

        # Verify item types
        types_by_name = {item.name: item.type for item in items}
        assert types_by_name['async_function'] == 'function'
        assert types_by_name['ExampleClass'] == 'class'
        assert types_by_name['ExampleClass.__init__'] == 'method'
        assert types_by_name['ExampleClass.value'] == 'method'

    def test_extracts_nested_functions(self, parser, tmp_path):
        """Test that nested functions are extracted (validates parent-tracking fix)."""
        nested_file = tmp_path / "nested.py"
        nested_file.write_text("""
def outer_function(items):
    '''Process items with validation.'''
    def validate_item(item):
        '''Validate a single item.'''
        if not item:
            return False
        return True

    def transform_item(item):
        '''Transform a single item.'''
        return item.upper()

    return [transform_item(item) for item in items if validate_item(item)]

class DataProcessor:
    def process(self, data):
        '''Process data with nested helper.'''
        def _helper(x):
            '''Internal helper function.'''
            return x * 2
        return _helper(data)
""")

        items = parser.parse_file(str(nested_file))
        item_names = [item.name for item in items]

        # Should extract:
        # - outer_function (top-level function)
        # - validate_item (nested in outer_function)
        # - transform_item (nested in outer_function)
        # - DataProcessor (class)
        # - DataProcessor.process (method)
        # - _helper (nested in method)
        # Total: 6 items
        assert len(items) == 6, f"Expected 6 items, got {len(items)}: {item_names}"

        # Verify nested functions are extracted
        assert 'outer_function' in item_names, "Top-level function should be extracted"
        assert 'validate_item' in item_names, "Nested function should be extracted"
        assert 'transform_item' in item_names, "Nested function should be extracted"

        # Verify class and method are extracted
        assert 'DataProcessor' in item_names, "Class should be extracted"
        assert 'DataProcessor.process' in item_names, "Method should be extracted"

        # Verify nested function in method is extracted
        assert '_helper' in item_names, "Nested function in method should be extracted"

        # Verify all are marked as functions (except class and method)
        types_by_name = {item.name: item.type for item in items}
        assert types_by_name['outer_function'] == 'function'
        assert types_by_name['validate_item'] == 'function'
        assert types_by_name['transform_item'] == 'function'
        assert types_by_name['DataProcessor'] == 'class'
        assert types_by_name['DataProcessor.process'] == 'method'
        assert types_by_name['_helper'] == 'function'

        # Verify nested functions have metadata
        validate = next(item for item in items if item.name == 'validate_item')
        assert validate.has_docs is True
        assert validate.docstring is not None
        assert 'item' in validate.parameters
