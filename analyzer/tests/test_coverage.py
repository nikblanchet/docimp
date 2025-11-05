"""Tests for the coverage calculator."""

import sys
from pathlib import Path

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.analysis.coverage_calculator import CoverageCalculator
from src.models.code_item import CodeItem


class TestCoverageCalculator:
    """Test suite for CoverageCalculator class."""

    @pytest.fixture
    def calculator(self):
        """Return a CoverageCalculator instance."""
        return CoverageCalculator()

    @pytest.fixture
    def mixed_items(self):
        """Return a list of CodeItems with mixed documentation status."""
        return [
            CodeItem(
                name="documented_func",
                type="function",
                filepath="test.py",
                line_number=1,
                end_line=5,
                language="python",
                complexity=5,
                has_docs=True,
                export_type="internal",
                module_system="unknown",
                impact_score=25.0,
            ),
            CodeItem(
                name="undocumented_func",
                type="function",
                filepath="test.py",
                line_number=10,
                end_line=15,
                language="python",
                complexity=3,
                has_docs=False,
                export_type="internal",
                module_system="unknown",
                impact_score=15.0,
            ),
            CodeItem(
                name="another_documented",
                type="class",
                filepath="test.py",
                line_number=20,
                end_line=30,
                language="python",
                complexity=10,
                has_docs=True,
                export_type="internal",
                module_system="unknown",
                impact_score=50.0,
            ),
        ]

    @pytest.fixture
    def multi_language_items(self):
        """Return CodeItems from multiple languages."""
        return [
            # Python items (2 documented, 1 undocumented)
            CodeItem(
                name="py_func1",
                type="function",
                filepath="test.py",
                line_number=1,
                end_line=5,
                language="python",
                complexity=5,
                has_docs=True,
                export_type="internal",
                module_system="unknown",
                impact_score=25.0,
            ),
            CodeItem(
                name="py_func2",
                type="function",
                filepath="test.py",
                line_number=10,
                end_line=15,
                language="python",
                complexity=3,
                has_docs=True,
                export_type="internal",
                module_system="unknown",
                impact_score=15.0,
            ),
            CodeItem(
                name="py_func3",
                type="function",
                filepath="test.py",
                line_number=20,
                end_line=25,
                language="python",
                complexity=2,
                has_docs=False,
                export_type="internal",
                module_system="unknown",
                impact_score=10.0,
            ),
            # JavaScript items (1 documented, 2 undocumented)
            CodeItem(
                name="js_func1",
                type="function",
                filepath="test.js",
                line_number=1,
                end_line=5,
                language="javascript",
                complexity=4,
                has_docs=True,
                export_type="named",
                module_system="esm",
                impact_score=20.0,
            ),
            CodeItem(
                name="js_func2",
                type="function",
                filepath="test.js",
                line_number=10,
                end_line=15,
                language="javascript",
                complexity=6,
                has_docs=False,
                export_type="named",
                module_system="esm",
                impact_score=30.0,
            ),
            CodeItem(
                name="js_func3",
                type="function",
                filepath="test.js",
                line_number=20,
                end_line=25,
                language="javascript",
                complexity=8,
                has_docs=False,
                export_type="named",
                module_system="esm",
                impact_score=40.0,
            ),
        ]

    def test_empty_items_returns_zero_coverage(self, calculator):
        """Test that empty item list returns 0% coverage."""
        coverage = calculator.calculate_coverage([])
        assert coverage == 0.0

    def test_all_documented_returns_100_percent(self, calculator):
        """Test that all documented items returns 100% coverage."""
        items = [
            CodeItem(
                name="func1",
                type="function",
                filepath="test.py",
                line_number=1,
                end_line=3,
                language="python",
                complexity=1,
                has_docs=True,
                export_type="internal",
                module_system="unknown",
                impact_score=5.0,
            ),
            CodeItem(
                name="func2",
                type="function",
                filepath="test.py",
                line_number=5,
                end_line=7,
                language="python",
                complexity=1,
                has_docs=True,
                export_type="internal",
                module_system="unknown",
                impact_score=5.0,
            ),
        ]

        coverage = calculator.calculate_coverage(items)
        assert coverage == 100.0

    def test_none_documented_returns_zero_percent(self, calculator):
        """Test that no documented items returns 0% coverage."""
        items = [
            CodeItem(
                name="func1",
                type="function",
                filepath="test.py",
                line_number=1,
                end_line=3,
                language="python",
                complexity=1,
                has_docs=False,
                export_type="internal",
                module_system="unknown",
                impact_score=5.0,
            ),
            CodeItem(
                name="func2",
                type="function",
                filepath="test.py",
                line_number=5,
                end_line=7,
                language="python",
                complexity=1,
                has_docs=False,
                export_type="internal",
                module_system="unknown",
                impact_score=5.0,
            ),
        ]

        coverage = calculator.calculate_coverage(items)
        assert coverage == 0.0

    def test_partial_coverage_calculated_correctly(self, calculator, mixed_items):
        """Test that partial coverage is calculated correctly."""
        # 2 out of 3 documented = 66.67%
        coverage = calculator.calculate_coverage(mixed_items)
        assert abs(coverage - 66.67) < 0.1

    def test_count_documented(self, calculator, mixed_items):
        """Test counting documented items."""
        count = calculator.count_documented(mixed_items)
        assert count == 2

    def test_count_documented_empty_list(self, calculator):
        """Test counting documented items in empty list."""
        count = calculator.count_documented([])
        assert count == 0

    def test_by_language_empty_items(self, calculator):
        """Test by-language metrics with empty list."""
        metrics = calculator.calculate_by_language([])
        assert metrics == {}

    def test_by_language_single_language(self, calculator, mixed_items):
        """Test by-language metrics with single language."""
        metrics = calculator.calculate_by_language(mixed_items)

        assert "python" in metrics
        assert len(metrics) == 1

        py_metrics = metrics["python"]
        assert py_metrics.language == "python"
        assert py_metrics.total_items == 3
        assert py_metrics.documented_items == 2
        assert abs(py_metrics.coverage_percent - 66.67) < 0.1

    def test_by_language_multiple_languages(self, calculator, multi_language_items):
        """Test by-language metrics with multiple languages."""
        metrics = calculator.calculate_by_language(multi_language_items)

        # Should have both Python and JavaScript
        assert "python" in metrics
        assert "javascript" in metrics
        assert len(metrics) == 2

        # Python: 2/3 documented = 66.67%
        py_metrics = metrics["python"]
        assert py_metrics.total_items == 3
        assert py_metrics.documented_items == 2
        assert abs(py_metrics.coverage_percent - 66.67) < 0.1

        # JavaScript: 1/3 documented = 33.33%
        js_metrics = metrics["javascript"]
        assert js_metrics.total_items == 3
        assert js_metrics.documented_items == 1
        assert abs(js_metrics.coverage_percent - 33.33) < 0.1

    def test_by_language_averages_complexity(self, calculator, multi_language_items):
        """Test that by-language metrics include average complexity."""
        metrics = calculator.calculate_by_language(multi_language_items)

        # Python avg complexity: (5 + 3 + 2) / 3 = 3.33
        py_metrics = metrics["python"]
        assert abs(py_metrics.avg_complexity - 3.33) < 0.1

        # JavaScript avg complexity: (4 + 6 + 8) / 3 = 6.0
        js_metrics = metrics["javascript"]
        assert abs(js_metrics.avg_complexity - 6.0) < 0.1

    def test_by_language_averages_impact_score(self, calculator, multi_language_items):
        """Test that by-language metrics include average impact score."""
        metrics = calculator.calculate_by_language(multi_language_items)

        # Python avg impact: (25 + 15 + 10) / 3 = 16.67
        py_metrics = metrics["python"]
        assert abs(py_metrics.avg_impact_score - 16.67) < 0.1

        # JavaScript avg impact: (20 + 30 + 40) / 3 = 30.0
        js_metrics = metrics["javascript"]
        assert abs(js_metrics.avg_impact_score - 30.0) < 0.1

    def test_by_language_handles_skipped_items(self, calculator):
        """Test that skipped items are tracked correctly."""
        items = [
            CodeItem(
                name="py_func",
                type="function",
                filepath="test.py",
                line_number=1,
                end_line=5,
                language="python",
                complexity=5,
                has_docs=True,
                export_type="internal",
                module_system="unknown",
                impact_score=25.0,
            ),
            CodeItem(
                name="skipped_file",
                type="function",
                filepath="node_modules/test.js",
                line_number=1,
                end_line=5,
                language="skipped",
                complexity=0,
                has_docs=False,
                export_type="internal",
                module_system="unknown",
                impact_score=0.0,
            ),
        ]

        metrics = calculator.calculate_by_language(items)

        # Should track both Python and skipped
        assert "python" in metrics
        assert "skipped" in metrics

        # Skipped should have 1 item, 0 documented
        skipped_metrics = metrics["skipped"]
        assert skipped_metrics.total_items == 1
        assert skipped_metrics.documented_items == 0
        assert skipped_metrics.coverage_percent == 0.0
