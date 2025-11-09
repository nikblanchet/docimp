"""Integration tests for analyze command auto-clean functionality."""

import json
import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.main import main
from src.utils.state_manager import StateManager


class TestAnalyzeAutoClean:
    """Test auto-clean behavior of analyze command."""

    def test_analyze_clears_old_audit_by_default(self):
        """Test that analyze clears old audit.json by default."""
        with TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            original_cwd = Path.cwd()

            try:
                # Change to temp directory so StateManager uses it as base
                os.chdir(temp_path)

                # Setup: Create a simple Python file to analyze
                test_file = temp_path / "test.py"
                test_file.write_text("def foo():\n    pass\n")

                # Setup: Create state directory with old audit file
                StateManager.ensure_state_dir()
                audit_file = StateManager.get_audit_file()
                audit_file.write_text('{"ratings": {"old": "data"}}')

                # Verify audit file exists before
                assert audit_file.exists()

                # Run analyze
                result = main(["analyze", ".", "--format", "json"])

                # Should succeed
                assert result == 0

                # Verify audit file was cleared
                assert not audit_file.exists()
            finally:
                # Restore original working directory
                os.chdir(original_cwd)

    def test_analyze_clears_old_plan_by_default(self):
        """Test that analyze clears old plan.json by default."""
        with TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            original_cwd = Path.cwd()

            try:
                # Change to temp directory so StateManager uses it as base
                os.chdir(temp_path)

                # Setup: Create a simple Python file to analyze
                test_file = temp_path / "test.py"
                test_file.write_text("def foo():\n    pass\n")

                # Setup: Create state directory with old plan file
                StateManager.ensure_state_dir()
                plan_file = StateManager.get_plan_file()
                plan_file.write_text('{"items": [{"name": "old"}]}')

                # Verify plan file exists before
                assert plan_file.exists()

                # Run analyze
                result = main(["analyze", ".", "--format", "json"])

                # Should succeed
                assert result == 0

                # Verify plan file was cleared
                assert not plan_file.exists()
            finally:
                # Restore original working directory
                os.chdir(original_cwd)

    def test_analyze_saves_result_to_analyze_latest(self):
        """Test that analyze saves result to analyze-latest.json."""
        with TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            original_cwd = Path.cwd()

            try:
                # Change to temp directory so StateManager uses it as base
                os.chdir(temp_path)

                # Setup: Create a simple Python file to analyze
                test_file = temp_path / "test.py"
                test_file.write_text("def foo():\n    pass\n")

                # Run analyze
                result = main(["analyze", ".", "--format", "json"])

                # Should succeed
                assert result == 0

                # Verify analyze-latest.json was created
                analyze_file = StateManager.get_analyze_file()
                assert analyze_file.exists()

                # Verify content is valid JSON with expected structure
                content = json.loads(analyze_file.read_text())
                assert "coverage_percent" in content
                assert "total_items" in content
                assert "documented_items" in content
                assert "items" in content
                assert "by_language" in content
            finally:
                # Restore original working directory
                os.chdir(original_cwd)

    def test_analyze_clears_multiple_files(self):
        """Test that analyze clears all files in session-reports."""
        with TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            original_cwd = Path.cwd()

            try:
                # Change to temp directory so StateManager uses it as base
                os.chdir(temp_path)

                # Setup: Create a simple Python file to analyze
                test_file = temp_path / "test.py"
                test_file.write_text("def foo():\n    pass\n")

                # Setup: Create state directory with multiple old files
                StateManager.ensure_state_dir()
                session_dir = StateManager.get_session_reports_dir()

                audit_file = session_dir / "audit.json"
                plan_file = session_dir / "plan.json"
                old_analyze_file = session_dir / "analyze-latest.json"

                audit_file.write_text('{"ratings": {}}')
                plan_file.write_text('{"items": []}')
                old_analyze_file.write_text('{"old": "analysis"}')

                # Verify all files exist before
                assert audit_file.exists()
                assert plan_file.exists()
                assert old_analyze_file.exists()

                # Run analyze
                result = main(["analyze", ".", "--format", "json"])

                # Should succeed
                assert result == 0

                # Verify old files were cleared
                assert not audit_file.exists()
                assert not plan_file.exists()

                # New analyze-latest.json should exist with new content
                new_analyze_file = StateManager.get_analyze_file()
                assert new_analyze_file.exists()
                new_content = json.loads(new_analyze_file.read_text())
                assert (
                    "old" not in new_content
                )  # Should be new analysis, not old content
            finally:
                # Restore original working directory
                os.chdir(original_cwd)

    def test_analyze_preserves_history_directory(self):
        """Test that analyze does not touch the history directory."""
        with TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            original_cwd = Path.cwd()

            try:
                # Change to temp directory so StateManager uses it as base
                os.chdir(temp_path)

                # Setup: Create a simple Python file to analyze
                test_file = temp_path / "test.py"
                test_file.write_text("def foo():\n    pass\n")

                # Setup: Create state directory with history file
                StateManager.ensure_state_dir()
                history_dir = StateManager.get_history_dir()
                history_file = history_dir / "old-audit.json"
                history_file.write_text('{"historical": "data"}')

                # Verify history file exists before
                assert history_file.exists()

                # Run analyze
                result = main(["analyze", ".", "--format", "json"])

                # Should succeed
                assert result == 0

                # Verify history file was preserved
                assert history_file.exists()
                content = json.loads(history_file.read_text())
                assert content["historical"] == "data"
            finally:
                # Restore original working directory
                os.chdir(original_cwd)

    def test_analyze_creates_state_dir_if_missing(self):
        """Test that analyze creates state directory if it doesn't exist."""
        with TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            original_cwd = Path.cwd()

            try:
                # Change to temp directory so StateManager uses it as base
                os.chdir(temp_path)

                # Setup: Create a simple Python file to analyze
                test_file = temp_path / "test.py"
                test_file.write_text("def foo():\n    pass\n")

                # Verify state directory doesn't exist
                state_dir = StateManager.get_state_dir()
                assert not state_dir.exists()

                # Run analyze
                result = main(["analyze", ".", "--format", "json"])

                # Should succeed
                assert result == 0

                # Verify state directory was created
                assert state_dir.exists()
                assert StateManager.get_session_reports_dir().exists()
                assert StateManager.get_history_dir().exists()

                # Verify analyze-latest.json was created
                analyze_file = StateManager.get_analyze_file()
                assert analyze_file.exists()
            finally:
                # Restore original working directory
                os.chdir(original_cwd)
