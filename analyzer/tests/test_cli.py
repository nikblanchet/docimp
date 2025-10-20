"""Tests for the command-line interface."""

import json
import sys
from pathlib import Path
import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.main import main, format_json, format_summary, create_analyzer
from src.analysis.analyzer import DocumentationAnalyzer
from src.models.analysis_result import AnalysisResult, LanguageMetrics
from src.models.code_item import CodeItem


class TestCLI:
    """Test suite for command-line interface."""

    @pytest.fixture
    def examples_dir(self):
        """Return path to examples directory."""
        project_root = Path(__file__).parent.parent.parent
        return str(project_root / 'examples')

    def test_main_no_command(self, capsys):
        """Test that running without command shows help."""
        exit_code = main([])
        captured = capsys.readouterr()

        assert exit_code == 1
        assert 'usage:' in captured.out or 'usage:' in captured.err

    def test_main_help(self, capsys):
        """Test help flag."""
        with pytest.raises(SystemExit) as exc:
            main(['--help'])

        assert exc.value.code == 0
        captured = capsys.readouterr()
        assert 'usage:' in captured.out
        assert 'analyze' in captured.out

    def test_main_version(self, capsys):
        """Test version flag."""
        with pytest.raises(SystemExit) as exc:
            main(['--version'])

        assert exc.value.code == 0
        captured = capsys.readouterr()
        assert 'analyzer' in captured.out
        assert '0.1.0' in captured.out

    def test_analyze_json_format(self, examples_dir, capsys):
        """Test analyze command with JSON output."""
        exit_code = main(['analyze', examples_dir, '--format', 'json'])
        captured = capsys.readouterr()

        assert exit_code == 0

        # Parse JSON output
        data = json.loads(captured.out)

        assert 'coverage_percent' in data
        assert 'total_items' in data
        assert 'documented_items' in data
        assert 'by_language' in data
        assert 'items' in data

        assert isinstance(data['coverage_percent'], (int, float))
        assert isinstance(data['total_items'], int)
        assert isinstance(data['documented_items'], int)
        assert isinstance(data['items'], list)

    def test_analyze_summary_format(self, examples_dir, capsys):
        """Test analyze command with summary output."""
        exit_code = main(['analyze', examples_dir, '--format', 'summary'])
        captured = capsys.readouterr()

        assert exit_code == 0
        assert 'Documentation Coverage Analysis' in captured.out
        assert 'Overall Coverage:' in captured.out
        assert 'By Language:' in captured.out

    def test_analyze_default_format(self, examples_dir, capsys):
        """Test analyze command with default format (summary)."""
        exit_code = main(['analyze', examples_dir])
        captured = capsys.readouterr()

        assert exit_code == 0
        assert 'Documentation Coverage Analysis' in captured.out

    def test_analyze_verbose(self, examples_dir, capsys):
        """Test analyze command with verbose flag."""
        exit_code = main(['analyze', examples_dir, '--verbose'])
        captured = capsys.readouterr()

        assert exit_code == 0
        # Verbose messages go to stderr
        assert 'Analyzing:' in captured.err or len(captured.err) > 0

    def test_analyze_nonexistent_path(self, capsys):
        """Test analyze command with nonexistent path."""
        exit_code = main(['analyze', '/nonexistent/path/that/does/not/exist'])
        captured = capsys.readouterr()

        assert exit_code == 1
        assert 'Error:' in captured.err

    def test_analyze_single_file(self, capsys):
        """Test analyzing a single file."""
        project_root = Path(__file__).parent.parent.parent
        test_file = project_root / 'examples' / 'test_simple.py'

        exit_code = main(['analyze', str(test_file), '--format', 'json'])
        captured = capsys.readouterr()

        assert exit_code == 0

        data = json.loads(captured.out)
        assert data['total_items'] > 0
        # All items should be Python
        assert all(item['language'] == 'python' for item in data['items'])

    def test_create_analyzer(self):
        """Test analyzer factory function."""
        analyzer = create_analyzer()

        assert isinstance(analyzer, DocumentationAnalyzer)
        assert 'python' in analyzer.parsers
        assert 'typescript' in analyzer.parsers
        assert 'javascript' in analyzer.parsers

    def test_format_json_structure(self):
        """Test JSON formatting with mock data."""
        # Create mock result
        item = CodeItem(
            name='test_func',
            type='function',
            filepath='test.py',
            line_number=10,
            end_line=15,
            language='python',
            complexity=5,
            impact_score=25.0,
            has_docs=True,
            export_type='named',
            module_system='esm'
        )

        metrics = LanguageMetrics(
            language='python',
            total_items=1,
            documented_items=1,
            coverage_percent=100.0,
            avg_complexity=5.0,
            avg_impact_score=25.0
        )

        result = AnalysisResult(
            items=[item],
            coverage_percent=100.0,
            total_items=1,
            documented_items=1,
            by_language={'python': metrics}
        )

        json_str = format_json(result)
        data = json.loads(json_str)

        assert data['coverage_percent'] == 100.0
        assert data['total_items'] == 1
        assert data['documented_items'] == 1
        assert 'python' in data['by_language']
        assert len(data['items']) == 1
        assert data['items'][0]['name'] == 'test_func'

    def test_format_summary_structure(self):
        """Test summary formatting with mock data."""
        item1 = CodeItem(
            name='documented_func',
            type='function',
            filepath='test.py',
            line_number=10,
            end_line=15,
            language='python',
            complexity=5,
            impact_score=25.0,
            has_docs=True,
            export_type='named',
            module_system='esm'
        )

        item2 = CodeItem(
            name='undocumented_func',
            type='function',
            filepath='test.py',
            line_number=20,
            end_line=25,
            language='python',
            complexity=10,
            impact_score=50.0,
            has_docs=False,
            export_type='named',
            module_system='esm'
        )

        metrics = LanguageMetrics(
            language='python',
            total_items=2,
            documented_items=1,
            coverage_percent=50.0,
            avg_complexity=7.5,
            avg_impact_score=37.5
        )

        result = AnalysisResult(
            items=[item1, item2],
            coverage_percent=50.0,
            total_items=2,
            documented_items=1,
            by_language={'python': metrics}
        )

        summary = format_summary(result)

        assert 'Documentation Coverage Analysis' in summary
        assert '50.0%' in summary
        assert '(1/2 items)' in summary
        assert 'By Language:' in summary
        assert 'Top Undocumented Items' in summary
        assert 'undocumented_func' in summary
