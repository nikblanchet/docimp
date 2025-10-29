"""Tests for dependency injection compliance across the codebase.

This module verifies that components properly accept injected dependencies
rather than hardcoding instantiations, enabling testability and flexibility.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock

# Add parent directory to path for src imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.analysis.analyzer import DocumentationAnalyzer
from src.models.analysis_result import AnalysisResult
from src.models.code_item import CodeItem
from src.parsers.base_parser import BaseParser
from src.planning.plan_generator import generate_plan
from src.scoring.impact_scorer import ImpactScorer


class TestDocumentationAnalyzerDI:
    """Test that DocumentationAnalyzer accepts custom parsers and scorer."""

    def test_analyzer_with_mock_parser(self, tmp_path):
        """Verify DocumentationAnalyzer works with injected mock parser."""
        # Create mock parser that returns predefined items
        mock_parser = MagicMock(spec=BaseParser)
        mock_items = [
            CodeItem(
                name="mock_function",
                type="function",
                filepath="test.py",
                line_number=1,
                end_line=5,
                language="python",
                complexity=3,
                impact_score=15.0,
                has_docs=False,
                parameters=["x", "y"],
                return_type="int",
                docstring=None,
                export_type="internal",
                module_system="unknown",
                audit_rating=None
            )
        ]
        mock_parser.parse_file.return_value = mock_items

        # Create test file
        test_file = tmp_path / "test.py"
        test_file.write_text("def mock_function(x, y): pass")

        # Create analyzer with mock parser injected
        mock_scorer = MagicMock(spec=ImpactScorer)
        mock_scorer.calculate_score.return_value = 15.0

        analyzer = DocumentationAnalyzer(
            parsers={'python': mock_parser},
            scorer=mock_scorer
        )

        # Analyze should use the injected mock parser
        result = analyzer.analyze(str(test_file))

        # Verify mock parser was called
        assert mock_parser.parse_file.called
        assert len(result.items) == 1
        assert result.items[0].name == "mock_function"

    def test_analyzer_with_custom_scorer(self, tmp_path):
        """Verify DocumentationAnalyzer uses injected custom scorer."""
        # Create mock scorer that returns fixed scores
        mock_scorer = MagicMock(spec=ImpactScorer)
        mock_scorer.calculate_score.return_value = 42.0

        # Create mock parser
        mock_parser = MagicMock(spec=BaseParser)
        mock_parser.parse_file.return_value = [
            CodeItem(
                name="test_func",
                type="function",
                filepath="test.py",
                line_number=1,
                end_line=3,
                language="python",
                complexity=5,
                impact_score=0.0,  # Will be overwritten by scorer
                has_docs=False,
                parameters=[],
                return_type=None,
                docstring=None,
                export_type="internal",
                module_system="unknown",
                audit_rating=None
            )
        ]

        # Create test file
        test_file = tmp_path / "test.py"
        test_file.write_text("def test_func(): pass")

        # Create analyzer with injected dependencies
        analyzer = DocumentationAnalyzer(
            parsers={'python': mock_parser},
            scorer=mock_scorer
        )

        result = analyzer.analyze(str(test_file))

        # Verify custom scorer was used
        assert mock_scorer.calculate_score.called
        assert result.items[0].impact_score == 42.0


class TestPlanGeneratorDI:
    """Test that generate_plan accepts custom scorer."""

    def test_generate_plan_with_custom_scorer(self, tmp_path):
        """Verify generate_plan uses injected custom scorer."""
        # Create analysis result with audit data
        items = [
            CodeItem(
                name="documented_func",
                type="function",
                filepath=str(tmp_path / "test.py"),
                line_number=1,
                end_line=10,
                language="python",
                complexity=10,
                impact_score=50.0,
                has_docs=True,
                parameters=[],
                return_type=None,
                docstring="Existing docs",
                export_type="internal",
                module_system="unknown",
                audit_rating=None  # Will be set by generate_plan
            )
        ]

        result = AnalysisResult(
            items=items,
            coverage_percent=100.0,
            total_items=1,
            documented_items=1,
            by_language={},
            parse_failures=[]
        )

        # Create audit file
        audit_file = tmp_path / "audit.json"
        audit_data = {
            "ratings": {
                str(tmp_path / "test.py"): {
                    "documented_func": 1  # Terrible rating
                }
            }
        }
        import json
        audit_file.write_text(json.dumps(audit_data))

        # Create mock scorer that returns a specific value
        mock_scorer = MagicMock(spec=ImpactScorer)
        mock_scorer.calculate_score.return_value = 99.0

        # Generate plan with injected scorer
        generate_plan(
            result=result,
            audit_file=audit_file,
            quality_threshold=2,
            scorer=mock_scorer
        )

        # Verify custom scorer was used
        assert mock_scorer.calculate_score.called
        # Verify score was updated
        assert items[0].impact_score == 99.0

    def test_generate_plan_scorer_optional(self, tmp_path):
        """Verify generate_plan works without scorer (uses default)."""
        items = [
            CodeItem(
                name="undoc_func",
                type="function",
                filepath=str(tmp_path / "test.py"),
                line_number=1,
                end_line=5,
                language="python",
                complexity=5,
                impact_score=25.0,
                has_docs=False,
                parameters=[],
                return_type=None,
                docstring=None,
                export_type="internal",
                module_system="unknown",
                audit_rating=None
            )
        ]

        result = AnalysisResult(
            items=items,
            coverage_percent=0.0,
            total_items=1,
            documented_items=0,
            by_language={},
            parse_failures=[]
        )

        # Generate plan without scorer parameter (should use default)
        plan = generate_plan(
            result=result,
            audit_file=None,
            quality_threshold=2
            # scorer=None is implicit
        )

        # Should work and include the undocumented item
        assert len(plan.items) == 1
        assert plan.items[0].name == "undoc_func"
