"""Tests for the DocumentationAnalyzer core orchestration."""

import sys
from pathlib import Path
import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.analysis.analyzer import DocumentationAnalyzer
from src.parsers.python_parser import PythonParser
from src.parsers.typescript_parser import TypeScriptParser
from src.scoring.impact_scorer import ImpactScorer


class TestDocumentationAnalyzer:
    """Test suite for DocumentationAnalyzer with dependency injection."""

    @pytest.fixture
    def analyzer(self):
        """Create analyzer instance with all parsers."""
        return DocumentationAnalyzer(
            parsers={
                'python': PythonParser(),
                'typescript': TypeScriptParser(),
                'javascript': TypeScriptParser()
            },
            scorer=ImpactScorer()
        )

    @pytest.fixture
    def examples_dir(self):
        """Return path to examples directory."""
        project_root = Path(__file__).parent.parent.parent
        return str(project_root / 'examples')

    def test_analyze_examples_directory(self, analyzer, examples_dir):
        """Test analyzing the examples directory."""
        result = analyzer.analyze(examples_dir)

        # Basic assertions
        assert len(result.items) >= 5, "Should find at least 5 code items in examples"
        assert result.total_items == len(result.items)
        assert 0 <= result.coverage_percent <= 100
        assert result.documented_items <= result.total_items

    def test_language_breakdown(self, analyzer, examples_dir):
        """Test that analyzer correctly categorizes items by language."""
        result = analyzer.analyze(examples_dir)

        # Check language-specific items
        python_items = [i for i in result.items if i.language == 'python']
        typescript_items = [i for i in result.items if i.language == 'typescript']
        javascript_items = [i for i in result.items if i.language == 'javascript']

        # Verify we have items from multiple languages
        assert len(python_items) > 0, "Should find Python items"
        assert len(typescript_items) + len(javascript_items) > 0, "Should find TS/JS items"

        print(f'✓ Python items: {len(python_items)}')
        print(f'✓ TypeScript items: {len(typescript_items)}')
        print(f'✓ JavaScript items: {len(javascript_items)}')

    def test_impact_scores_calculated(self, analyzer, examples_dir):
        """Test that impact scores are calculated for all items."""
        result = analyzer.analyze(examples_dir)

        for item in result.items:
            assert 0 <= item.impact_score <= 100, \
                f"Impact score for {item.name} should be 0-100, got {item.impact_score}"

    def test_by_language_metrics(self, analyzer, examples_dir):
        """Test that per-language metrics are computed."""
        result = analyzer.analyze(examples_dir)

        assert len(result.by_language) > 0, "Should have language-specific metrics"

        for language, metrics in result.by_language.items():
            assert metrics.language == language
            assert metrics.total_items > 0
            assert 0 <= metrics.coverage_percent <= 100
            assert metrics.avg_complexity >= 0

    def test_file_exclusions(self, analyzer):
        """Test that excluded directories are skipped."""
        # Analyzer should have default exclusions
        assert 'node_modules' in analyzer.exclude_patterns
        assert 'venv' in analyzer.exclude_patterns
        assert '__pycache__' in analyzer.exclude_patterns

    def test_single_file_analysis(self, analyzer):
        """Test analyzing a single file."""
        project_root = Path(__file__).parent.parent.parent
        test_file = project_root / 'examples' / 'test_simple.py'

        result = analyzer.analyze(str(test_file))

        assert len(result.items) > 0, "Should parse items from single file"
        assert all(item.language == 'python' for item in result.items)

    def test_nonexistent_path_raises_error(self, analyzer):
        """Test that analyzing nonexistent path raises FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            analyzer.analyze('/nonexistent/path/that/does/not/exist')

    def test_custom_exclude_patterns(self):
        """Test that custom exclude patterns are merged with defaults."""
        custom_excludes = {'custom_dir', 'temp'}
        analyzer = DocumentationAnalyzer(
            parsers={'python': PythonParser()},
            scorer=ImpactScorer(),
            exclude_patterns=custom_excludes
        )

        # Should have both default and custom excludes
        assert 'node_modules' in analyzer.exclude_patterns
        assert 'custom_dir' in analyzer.exclude_patterns
        assert 'temp' in analyzer.exclude_patterns
