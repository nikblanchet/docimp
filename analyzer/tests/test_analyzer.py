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

    def test_strict_path_resolution(self, analyzer):
        """Test that paths are resolved with strict validation."""
        # Nonexistent path should raise FileNotFoundError
        with pytest.raises(FileNotFoundError, match="does not exist or is invalid"):
            analyzer.analyze('/this/path/definitely/does/not/exist/anywhere')

    def test_symlink_resolution(self, analyzer):
        """Test that symlinks are properly resolved during analysis."""
        import tempfile

        with tempfile.TemporaryDirectory() as temp_dir:
            # Create a real directory with a Python file
            real_dir = Path(temp_dir) / 'real_project'
            real_dir.mkdir()
            py_file = real_dir / 'module.py'
            py_file.write_text('def foo():\n    pass')

            # Create a symlink to it
            symlink_dir = Path(temp_dir) / 'link_to_project'
            symlink_dir.symlink_to(real_dir)

            # Analyze via symlink should work and resolve correctly
            result = analyzer.analyze(str(symlink_dir))

            assert len(result.items) > 0, "Should parse file via symlink"
            # The filepath in results should be the resolved real path
            for item in result.items:
                assert str(real_dir) in item.filepath, \
                    "Filepath should be resolved from symlink"

    def test_parse_failure_tracking(self, analyzer):
        """Test that syntax errors are captured in parse_failures."""
        import tempfile

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Create a valid file so analysis doesn't fail entirely
            valid_file = temp_path / 'valid.py'
            valid_file.write_text('def bar():\n    pass')

            # Create a file with syntax error
            broken_file = temp_path / 'broken.py'
            broken_file.write_text('def foo(\n    # Missing closing paren')

            # Analyze should not crash
            result = analyzer.analyze(str(temp_path))

            # Should have captured the parse failure
            assert len(result.parse_failures) == 1, "Should capture one parse failure"
            assert str(broken_file) in result.parse_failures[0].filepath
            assert len(result.parse_failures[0].error) > 0, "Error message should not be empty"

    def test_analysis_continues_after_failures(self, analyzer):
        """Test that analysis continues after encountering parse failures."""
        import tempfile

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Create a valid file
            valid_file = temp_path / 'valid.py'
            valid_file.write_text('def good_function():\n    """A good function."""\n    pass')

            # Create a file with syntax error
            broken_file = temp_path / 'broken.py'
            broken_file.write_text('def bad(\n    # Syntax error')

            # Analyze should process both files
            result = analyzer.analyze(str(temp_path))

            # Should have one successful parse
            assert len(result.items) >= 1, "Should parse valid file"
            assert any('good_function' in item.name for item in result.items)

            # Should have one failure
            assert len(result.parse_failures) == 1, "Should capture parse failure"
            assert str(broken_file) in result.parse_failures[0].filepath

    def test_total_parse_failure_raises_error(self, analyzer):
        """Test that ValueError is raised when all files fail to parse."""
        import tempfile

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Create only broken files
            broken1 = temp_path / 'broken1.py'
            broken1.write_text('def bad1(\n    # Syntax error')

            broken2 = temp_path / 'broken2.py'
            broken2.write_text('class Bad2\n    # Missing colon')

            # Should raise ValueError when all files fail
            with pytest.raises(ValueError, match="Failed to parse all"):
                analyzer.analyze(str(temp_path))

    def test_parse_failures_empty_by_default(self, analyzer, examples_dir):
        """Test that parse_failures is empty when all files parse successfully."""
        result = analyzer.analyze(examples_dir)

        # All example files should parse successfully
        assert isinstance(result.parse_failures, list), "parse_failures should be a list"
        assert len(result.parse_failures) == 0, "Should have no parse failures for valid files"

    def test_empty_error_message_fallback(self, analyzer):
        """Test that empty error messages get fallback text."""
        import tempfile
        from unittest.mock import Mock, patch

        # Create a custom exception with empty string representation
        class EmptyException(Exception):
            def __str__(self):
                return ""

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Create a valid file so analysis doesn't fail entirely
            valid_file = temp_path / 'valid.py'
            valid_file.write_text('def bar():\n    pass')

            # Create a file that will trigger the empty error
            bad_file = temp_path / 'bad.py'
            bad_file.write_text('def foo():\n    pass')

            # Create a mock that raises EmptyException only for bad.py
            original_parse = analyzer.parsers['python'].parse_file
            def mock_parse(filepath):
                if 'bad.py' in filepath:
                    raise EmptyException()
                return original_parse(filepath)

            # Mock the parser to raise exception with empty string for bad.py only
            with patch.object(analyzer.parsers['python'], 'parse_file', side_effect=mock_parse):
                result = analyzer.analyze(str(temp_path))

                # Should have captured the parse failure with fallback message
                assert len(result.parse_failures) == 1, "Should capture one parse failure"
                assert result.parse_failures[0].error == "Unknown parse error", \
                    "Should use fallback message for empty error"
                assert 'bad.py' in result.parse_failures[0].filepath, \
                    "Should capture the bad.py file"
