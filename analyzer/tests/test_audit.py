"""Basic smoke tests for audit functionality."""

import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.audit.quality_rater import AuditResult, load_audit_results, save_audit_results
from src.main import cmd_apply_audit, cmd_audit
from src.parsers.python_parser import PythonParser
from src.parsers.typescript_parser import TypeScriptParser
from src.scoring.impact_scorer import ImpactScorer


class TestAuditCommand:
    """Tests for the audit command."""

    @pytest.fixture
    def mock_analyzer(self):
        """Create a mock analyzer with documented and undocumented items."""
        from src.models.analysis_result import AnalysisResult
        from src.models.code_item import CodeItem

        documented_item = CodeItem(
            name="documented_func",
            type="function",
            filepath="test.py",
            line_number=10,
            end_line=15,
            language="python",
            complexity=5,
            impact_score=25.0,
            has_docs=True,
            parameters=["x", "y"],
            return_type="int",
            docstring="This function has documentation.",
            export_type="named",
            module_system="esm",
            audit_rating=None,
        )

        undocumented_item = CodeItem(
            name="undocumented_func",
            type="function",
            filepath="test.py",
            line_number=20,
            end_line=23,
            language="python",
            complexity=3,
            impact_score=15.0,
            has_docs=False,
            parameters=["a"],
            return_type="str",
            docstring=None,
            export_type="named",
            module_system="esm",
            audit_rating=None,
        )

        result = AnalysisResult(
            items=[documented_item, undocumented_item],
            coverage_percent=50.0,
            total_items=2,
            documented_items=1,
            by_language={},
        )
        return result

    def test_audit_finds_documented_items(self, mock_analyzer, capsys):
        """Test audit command returns only items WITH docs."""
        import argparse

        # Create mock dependencies for DI
        parsers = {
            "python": PythonParser(),
            "typescript": TypeScriptParser(),
            "javascript": TypeScriptParser(),
        }
        scorer = ImpactScorer()

        with patch("src.main.create_analyzer") as mock_create:
            mock_create.return_value.analyze.return_value = mock_analyzer

            args = argparse.Namespace(
                path="./test", verbose=False, audit_file=".docimp-audit.json"
            )

            exit_code = cmd_audit(args, parsers, scorer)

            assert exit_code == 0

            captured = capsys.readouterr()
            output = json.loads(captured.out)

            assert "items" in output
            assert len(output["items"]) == 1
            assert output["items"][0]["name"] == "documented_func"

    def test_audit_excludes_undocumented(self, mock_analyzer, capsys):
        """Test audit command excludes items without docs."""
        import argparse

        # Create mock dependencies for DI
        parsers = {
            "python": PythonParser(),
            "typescript": TypeScriptParser(),
            "javascript": TypeScriptParser(),
        }
        scorer = ImpactScorer()

        with patch("src.main.create_analyzer") as mock_create:
            mock_create.return_value.analyze.return_value = mock_analyzer

            args = argparse.Namespace(
                path="./test", verbose=False, audit_file=".docimp-audit.json"
            )

            exit_code = cmd_audit(args, parsers, scorer)

            assert exit_code == 0

            captured = capsys.readouterr()
            output = json.loads(captured.out)

            # Should NOT contain undocumented_func
            item_names = [item["name"] for item in output["items"]]
            assert "undocumented_func" not in item_names


class TestApplyAuditCommand:
    """Tests for the apply-audit command."""

    def test_apply_audit_saves_ratings(self, tmp_path):
        """Test apply-audit command persists ratings to JSON."""
        import argparse
        from io import StringIO

        audit_file = tmp_path / ".docimp-audit.json"

        audit_data = {"ratings": {"test.py": {"func1": 3, "func2": 2}}}

        args = argparse.Namespace(audit_file=str(audit_file), verbose=False)

        # Mock stdin with StringIO
        mock_stdin = StringIO(json.dumps(audit_data))
        with patch("sys.stdin", mock_stdin):
            exit_code = cmd_apply_audit(args)

        assert exit_code == 0
        assert audit_file.exists()

        # Verify contents
        with open(audit_file) as f:
            saved_data = json.load(f)

        assert saved_data["ratings"] == audit_data["ratings"]


class TestAuditPersistence:
    """Tests for audit result persistence."""

    def test_load_audit_empty_file(self):
        """Test loading when file doesn't exist returns empty."""
        result = load_audit_results(Path("/nonexistent/path/.docimp-audit.json"))

        assert isinstance(result, AuditResult)
        assert result.ratings == {}

    def test_load_audit_existing(self, tmp_path):
        """Test loading existing ratings."""
        audit_file = tmp_path / ".docimp-audit.json"

        test_data = {
            "ratings": {
                "file1.py": {"func_a": 4, "func_b": 2},
                "file2.py": {"func_c": 3},
            }
        }

        with open(audit_file, "w") as f:
            json.dump(test_data, f)

        result = load_audit_results(audit_file)

        assert result.ratings == test_data["ratings"]
        assert result.get_rating("file1.py", "func_a") == 4
        assert result.get_rating("file2.py", "func_c") == 3

    def test_save_audit_creates_file(self, tmp_path):
        """Test saving creates .docimp-audit.json."""
        audit_file = tmp_path / ".docimp-audit.json"

        audit_result = AuditResult(ratings={"test.py": {"my_func": 3}})

        save_audit_results(audit_result, audit_file)

        assert audit_file.exists()

        # Verify contents
        with open(audit_file) as f:
            saved_data = json.load(f)

        assert "ratings" in saved_data
        assert saved_data["ratings"]["test.py"]["my_func"] == 3

    def test_skip_saved_as_none(self, tmp_path):
        """Test that skipped items are saved as None, not a number."""
        audit_file = tmp_path / ".docimp-audit.json"

        audit_result = AuditResult(
            ratings={"test.py": {"rated_func": 3, "skipped_func": None}}
        )

        save_audit_results(audit_result, audit_file)

        # Load and verify
        with open(audit_file) as f:
            saved_data = json.load(f)

        assert saved_data["ratings"]["test.py"]["rated_func"] == 3
        assert saved_data["ratings"]["test.py"]["skipped_func"] is None

        # Also verify through load function
        loaded = load_audit_results(audit_file)
        assert loaded.get_rating("test.py", "rated_func") == 3
        assert loaded.get_rating("test.py", "skipped_func") is None
