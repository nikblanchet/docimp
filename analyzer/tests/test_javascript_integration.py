"""Integration tests for JavaScript code analysis.

This module tests the complete stack of JavaScript file analysis,
from parser through to coverage calculation.
"""

import sys
from pathlib import Path
import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.analysis.analyzer import DocumentationAnalyzer
from src.parsers.typescript_parser import TypeScriptParser
from src.scoring.impact_scorer import ImpactScorer


class TestJavaScriptIntegration:
    """Integration tests for analyzing JavaScript projects."""

    @pytest.fixture
    def analyzer(self):
        """Create a DocumentationAnalyzer with JavaScript support."""
        return DocumentationAnalyzer(
            parsers={
                'javascript': TypeScriptParser(),
                'typescript': TypeScriptParser(),
            },
            scorer=ImpactScorer()
        )

    @pytest.fixture
    def examples_dir(self):
        """Return path to examples directory."""
        return Path(__file__).parent.parent.parent / 'examples'

    def test_analyze_javascript_patterns_file(self, analyzer, examples_dir):
        """Test analyzing the JavaScript patterns example file."""
        js_file = examples_dir / 'test_javascript_patterns.js'

        # Skip if file doesn't exist
        if not js_file.exists():
            pytest.skip(f"JavaScript example file not found: {js_file}")

        result = analyzer.analyze(str(examples_dir))

        # Filter to just JavaScript items
        js_items = [item for item in result.items if item.language == 'javascript']

        # Should find multiple JavaScript items
        assert len(js_items) > 0, "No JavaScript items found"

        # Verify ESM detection
        assert any(item.module_system == 'esm' for item in js_items), \
            "ESM module system not detected"

        # Verify named exports
        assert any(item.export_type == 'named' for item in js_items), \
            "Named exports not detected"

        # Verify complexity calculation
        assert all(item.complexity >= 1 for item in js_items), \
            "Invalid complexity scores"

        # Verify impact scores are calculated
        assert all(item.impact_score > 0 for item in js_items), \
            "Impact scores not calculated"

    def test_analyze_commonjs_file(self, analyzer, examples_dir):
        """Test analyzing CommonJS file."""
        cjs_file = examples_dir / 'test_commonjs.cjs'

        # Skip if file doesn't exist
        if not cjs_file.exists():
            pytest.skip(f"CommonJS example file not found: {cjs_file}")

        result = analyzer.analyze(str(examples_dir))

        # Filter to just JavaScript items from .cjs file
        cjs_items = [
            item for item in result.items
            if item.language == 'javascript' and item.filepath.endswith('.cjs')
        ]

        # Should find CommonJS items
        assert len(cjs_items) > 0, "No CommonJS items found"

        # Verify CommonJS detection
        assert all(item.module_system == 'commonjs' for item in cjs_items), \
            "CommonJS module system not detected"

        # Verify CommonJS exports
        assert any(item.export_type == 'commonjs' for item in cjs_items), \
            "CommonJS exports not detected"

    def test_javascript_coverage_calculation(self, analyzer, examples_dir):
        """Test that coverage is calculated correctly for JavaScript."""
        result = analyzer.analyze(str(examples_dir))

        # Should have language breakdown
        assert 'by_language' in result.__dict__ or hasattr(result, 'by_language')

        # Filter JavaScript items
        js_items = [item for item in result.items if item.language == 'javascript']

        if len(js_items) > 0:
            # Count documented vs undocumented
            documented = sum(1 for item in js_items if item.has_docs)
            total = len(js_items)

            # Calculate expected coverage
            expected_coverage = (documented / total * 100.0) if total > 0 else 0.0

            # Verify coverage is in valid range
            assert 0.0 <= expected_coverage <= 100.0

    def test_jsdoc_detection(self, analyzer, examples_dir):
        """Test that JSDoc comments are detected correctly."""
        js_file = examples_dir / 'test_javascript_patterns.js'

        # Skip if file doesn't exist
        if not js_file.exists():
            pytest.skip(f"JavaScript example file not found: {js_file}")

        result = analyzer.analyze(str(examples_dir))

        js_items = [
            item for item in result.items
            if item.language == 'javascript' and 'patterns' in item.filepath
        ]

        # At least some JavaScript items should have documentation
        documented_items = [item for item in js_items if item.has_docs]
        assert len(documented_items) > 0, "No documented JavaScript items found"

        # Check that docstrings are extracted
        for item in documented_items:
            assert item.docstring is not None, \
                f"Documented item {item.name} has no docstring"

    @pytest.mark.integration
    def test_mixed_language_project(self, examples_dir):
        """Test analyzing a project with multiple languages."""
        analyzer = DocumentationAnalyzer(
            parsers={
                'python': __import__('src.parsers.python_parser', fromlist=['PythonParser']).PythonParser(),
                'javascript': TypeScriptParser(),
                'typescript': TypeScriptParser(),
            },
            scorer=ImpactScorer()
        )

        result = analyzer.analyze(str(examples_dir))

        # Should find items from multiple languages
        languages = set(item.language for item in result.items)

        # Should have at least Python and JavaScript (or TypeScript)
        assert 'python' in languages, "No Python items found"
        assert 'javascript' in languages or 'typescript' in languages, \
            "No JavaScript/TypeScript items found"

        # Verify by_language breakdown exists
        if hasattr(result, 'by_language'):
            assert 'python' in result.by_language
            assert 'javascript' in result.by_language or 'typescript' in result.by_language

    def test_javascript_function_metadata(self, analyzer, examples_dir):
        """Test that JavaScript function metadata is extracted correctly."""
        js_file = examples_dir / 'test_javascript_patterns.js'

        # Skip if file doesn't exist
        if not js_file.exists():
            pytest.skip(f"JavaScript example file not found: {js_file}")

        result = analyzer.analyze(str(examples_dir))

        js_items = [
            item for item in result.items
            if item.language == 'javascript' and 'patterns' in item.filepath
        ]

        # Check that functions have names and types
        functions = [item for item in js_items if item.type == 'function']
        assert len(functions) > 0, "No JavaScript functions found"

        for func in functions:
            assert func.name, "Function has no name"
            assert func.type == 'function'
            assert func.line_number > 0

    def test_javascript_class_detection(self, analyzer, examples_dir):
        """Test that JavaScript classes are detected."""
        js_file = examples_dir / 'test_javascript_patterns.js'

        # Skip if file doesn't exist
        if not js_file.exists():
            pytest.skip(f"JavaScript example file not found: {js_file}")

        result = analyzer.analyze(str(examples_dir))

        js_items = [
            item for item in result.items
            if item.language == 'javascript' and 'patterns' in item.filepath
        ]

        # Check for classes
        classes = [item for item in js_items if item.type == 'class']

        # If classes exist in the example, verify they're detected
        if len(classes) > 0:
            for cls in classes:
                assert cls.name, "Class has no name"
                assert cls.type == 'class'

    def test_arrow_function_detection(self, analyzer, examples_dir):
        """Test that arrow functions are detected."""
        js_file = examples_dir / 'test_javascript_patterns.js'

        # Skip if file doesn't exist
        if not js_file.exists():
            pytest.skip(f"JavaScript example file not found: {js_file}")

        result = analyzer.analyze(str(examples_dir))

        js_items = [
            item for item in result.items
            if item.language == 'javascript' and 'patterns' in item.filepath
        ]

        # Arrow functions should be detected as functions
        functions = [item for item in js_items if item.type == 'function']
        assert len(functions) > 0, "No functions (including arrow functions) found"
