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

    def test_complex_nesting_edge_cases(self, parser, tmp_path):
        """Test edge cases with nested classes, conditionals, and multiple nesting levels."""
        edge_case_file = tmp_path / "edge_cases.py"
        edge_case_file.write_text("""
class Outer:
    '''Outer class with nested structures.'''
    def method(self):
        '''Method with nested function.'''
        def nested_in_method():
            '''Function nested in method.'''
            pass

    class Inner:
        '''Nested class.'''
        def inner_method(self):
            '''Method in nested class.'''
            pass

def function():
    '''Function with conditional nesting.'''
    if True:
        def nested_in_conditional():
            '''Function defined inside conditional.'''
            pass
""")

        items = parser.parse_file(str(edge_case_file))
        item_names = [item.name for item in items]

        # Should extract:
        # - Outer (class)
        # - Outer.method (method)
        # - nested_in_method (function)
        # - Inner (nested class)
        # - Inner.inner_method (method in nested class)
        # - function (top-level function)
        # - nested_in_conditional (function in conditional)
        # Total: 7 items
        assert len(items) == 7, f"Expected 7 items, got {len(items)}: {item_names}"

        # Verify outer class and its method
        assert 'Outer' in item_names
        assert 'Outer.method' in item_names

        # Verify nested function in method is extracted as function, not method
        assert 'nested_in_method' in item_names
        nested_func = next(item for item in items if item.name == 'nested_in_method')
        assert nested_func.type == 'function', "Function nested in method should be type 'function'"

        # Verify nested class
        assert 'Inner' in item_names
        inner_class = next(item for item in items if item.name == 'Inner')
        assert inner_class.type == 'class'

        # Verify method in nested class
        assert 'Inner.inner_method' in item_names
        inner_method = next(item for item in items if item.name == 'Inner.inner_method')
        assert inner_method.type == 'method'

        # Verify function with conditional nesting
        assert 'function' in item_names
        assert 'nested_in_conditional' in item_names
        cond_func = next(item for item in items if item.name == 'nested_in_conditional')
        assert cond_func.type == 'function'

        # Verify all items have documentation
        assert all(item.has_docs for item in items), "All items should have docstrings"

    def test_nested_function_complexity_isolation(self, parser, tmp_path):
        """Test that nested function complexity does not contribute to parent (issue #66)."""
        test_file = tmp_path / "nested_complexity.py"
        test_file.write_text("""
def parent_function(x):
    '''Parent function with simple logic.'''
    if x > 0:  # Parent complexity: base 1 + this if = 2
        return True

    def nested_helper(y):
        '''Nested helper with its own complexity.'''
        if y < 0:  # Nested complexity: base 1 + this if = 2
            return False
        if y > 100:  # Nested complexity: +1 = 3
            return False
        return True

    return False
""")

        items = parser.parse_file(str(test_file))

        # Should extract both parent and nested function
        assert len(items) == 2, f"Expected 2 items (parent + nested), got {len(items)}"

        parent = next(item for item in items if item.name == 'parent_function')
        nested = next(item for item in items if item.name == 'nested_helper')

        # Parent should have complexity 2 (base 1 + one if statement)
        # NOT 4 (which would include nested function's two if statements)
        assert parent.complexity == 2, \
            f"Parent complexity should be 2, got {parent.complexity}. " \
            "Nested function complexity should not contribute to parent."

        # Nested function should have complexity 3 (base 1 + two if statements)
        assert nested.complexity == 3, \
            f"Nested complexity should be 3, got {nested.complexity}"

    def test_complexity_with_lambdas(self, parser, tmp_path):
        """Test that lambda functions are correctly traversed in complexity calculation."""
        test_file = tmp_path / "lambda_complexity.py"
        test_file.write_text("""
def parent_with_lambda(x):
    '''Parent with lambda and regular conditional.'''
    # Lambda itself is not a decision point, but it's traversed
    process = lambda y: y * 2

    # Regular if statement
    if x > 0:
        return True

    return False
""")

        items = parser.parse_file(str(test_file))
        assert len(items) == 1

        parent = items[0]
        # Expected: base(1) + if(1) = 2
        # Lambda is traversed but doesn't add complexity
        assert parent.complexity == 2, \
            f"Expected complexity 2 (base + if), got {parent.complexity}"

    def test_complexity_with_comprehensions(self, parser, tmp_path):
        """Test that comprehensions with conditionals are counted correctly."""
        test_file = tmp_path / "comprehension_complexity.py"
        test_file.write_text("""
def parent_with_comprehension(x):
    '''Parent with comprehension.'''
    # List comprehension with conditional - comprehension itself is +1
    filtered = [i for i in range(10) if i > 5]

    # Regular if
    if x > 0:
        return filtered

    return []
""")

        items = parser.parse_file(str(test_file))
        assert len(items) == 1

        parent = items[0]
        # Expected: base(1) + comprehension(1) + if(1) = 3
        assert parent.complexity == 3, \
            f"Expected complexity 3 (base + comprehension + if), got {parent.complexity}"

    def test_complexity_async_nested_functions(self, parser, tmp_path):
        """Test that async nested functions are isolated from async parent."""
        test_file = tmp_path / "async_nested.py"
        test_file.write_text("""
async def parent_async(x):
    '''Async parent function.'''
    if x > 0:
        pass

    async def nested_async(y):
        '''Async nested function.'''
        if y > 0:
            pass
        while y < 100:
            y += 1

    return True
""")

        items = parser.parse_file(str(test_file))
        assert len(items) == 2

        parent = next(item for item in items if item.name == 'parent_async')
        nested = next(item for item in items if item.name == 'nested_async')

        # Parent: base(1) + if(1) = 2
        assert parent.complexity == 2, \
            f"Async parent should have complexity 2, got {parent.complexity}"

        # Nested: base(1) + if(1) + while(1) = 3
        assert nested.complexity == 3, \
            f"Async nested should have complexity 3, got {nested.complexity}"

    def test_complexity_parent_with_many_branches(self, parser, tmp_path):
        """Test complex parent with multiple decision points and nested function."""
        test_file = tmp_path / "complex_parent.py"
        test_file.write_text("""
def complex_parent(x):
    '''Parent with multiple decision points.'''
    if x > 0:
        pass
    elif x < 0:
        pass

    for i in range(10):
        if i % 2:
            pass

    def nested_complex(y):
        '''Nested function with many decision points.'''
        if y > 0:
            pass
        while y < 100:
            y += 1
        for item in [1, 2, 3]:
            if item:
                pass

    return True
""")

        items = parser.parse_file(str(test_file))
        assert len(items) == 2

        parent = next(item for item in items if item.name == 'complex_parent')
        nested = next(item for item in items if item.name == 'nested_complex')

        # Parent: base(1) + if(1) + elif(1) + for(1) + if(1) = 5
        # Should NOT include nested's: if(1) + while(1) + for(1) + if(1) = 4
        assert parent.complexity == 5, \
            f"Complex parent should have complexity 5, got {parent.complexity}. " \
            "Nested function complexity should not contribute to parent."

        # Nested: base(1) + if(1) + while(1) + for(1) + if(1) = 5
        assert nested.complexity == 5, \
            f"Nested should have complexity 5, got {nested.complexity}"

    def test_complexity_method_with_nested_function(self, parser, tmp_path):
        """Test that nested function in class method has isolated complexity."""
        test_file = tmp_path / "method_nested.py"
        test_file.write_text("""
class MyClass:
    def method_with_nested(self, x):
        '''Method with nested function.'''
        if x > 0:
            pass

        def helper(y):
            '''Helper nested in method.'''
            if y > 0:
                pass
            while y < 100:
                y += 1

        return True
""")

        items = parser.parse_file(str(test_file))
        assert len(items) == 3  # class + method + nested function

        method = next(item for item in items if item.name == 'MyClass.method_with_nested')
        helper = next(item for item in items if item.name == 'helper')

        # Method: base(1) + if(1) = 2
        assert method.complexity == 2, \
            f"Method should have complexity 2, got {method.complexity}"

        # Helper: base(1) + if(1) + while(1) = 3
        assert helper.complexity == 3, \
            f"Helper should have complexity 3, got {helper.complexity}"
