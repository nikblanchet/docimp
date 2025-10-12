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
