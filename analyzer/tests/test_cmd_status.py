"""
Unit tests for cmd_status function.

Tests business logic for status command including staleness detection,
file modification tracking, and suggestion generation.
"""

import hashlib
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.main import cmd_status
from src.models.workflow_state import CommandState, WorkflowState


@pytest.fixture
def mock_args():
    """Create mock command-line arguments."""
    args = MagicMock()
    args.verbose = False
    args.base_path = None  # Use current directory (default behavior)
    return args


@pytest.fixture
def empty_workflow_state():
    """Create an empty workflow state (no commands run)."""
    return WorkflowState(
        schema_version="1.0",
        last_analyze=None,
        last_audit=None,
        last_plan=None,
        last_improve=None,
    )


@pytest.fixture
def workflow_with_analyze():
    """Create workflow state with only analyze run."""
    return WorkflowState(
        schema_version="1.0",
        last_analyze=CommandState(
            timestamp="2025-01-01T10:00:00Z",
            item_count=23,
            file_checksums={"file1.py": "abc123", "file2.py": "def456"},
        ),
        last_audit=None,
        last_plan=None,
        last_improve=None,
    )


@pytest.fixture
def workflow_with_stale_audit():
    """Create workflow state where analyze was re-run after audit."""
    return WorkflowState(
        schema_version="1.0",
        last_analyze=CommandState(
            timestamp="2025-01-01T12:00:00Z",  # Later
            item_count=23,
            file_checksums={"file1.py": "abc123"},
        ),
        last_audit=CommandState(
            timestamp="2025-01-01T10:00:00Z",  # Earlier
            item_count=18,
            file_checksums={},
        ),
        last_plan=None,
        last_improve=None,
    )


@pytest.fixture
def workflow_with_stale_plan():
    """Create workflow state where analyze was re-run after plan."""
    return WorkflowState(
        schema_version="1.0",
        last_analyze=CommandState(
            timestamp="2025-01-01T12:00:00Z",  # Later
            item_count=23,
            file_checksums={"file1.py": "abc123"},
        ),
        last_audit=CommandState(
            timestamp="2025-01-01T11:00:00Z",
            item_count=18,
            file_checksums={},
        ),
        last_plan=CommandState(
            timestamp="2025-01-01T10:00:00Z",  # Earliest
            item_count=12,
            file_checksums={},
        ),
        last_improve=None,
    )


class TestCmdStatus:
    """Test suite for cmd_status function."""

    def test_cmd_status_empty_workflow(self, mock_args, empty_workflow_state, capsys):
        """Test status with no commands run yet."""
        with patch(
            "src.main.WorkflowStateManager.load_workflow_state",
            return_value=empty_workflow_state,
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # All commands should show as not_run
            assert len(result["commands"]) == 4
            assert all(cmd["status"] == "not_run" for cmd in result["commands"])

            # No staleness warnings (nothing to be stale)
            assert result["staleness_warnings"] == []

            # Should suggest running analyze first
            assert len(result["suggestions"]) == 1
            assert "analyze" in result["suggestions"][0]

            # No file modifications (no analyze run yet)
            assert result["file_modifications"] == 0

    def test_cmd_status_analyze_only(
        self, mock_args, workflow_with_analyze, capsys, tmp_path
    ):
        """Test status with only analyze run."""
        # Create test files with matching checksums
        file1 = tmp_path / "file1.py"
        file2 = tmp_path / "file2.py"
        file1.write_text("content1")
        file2.write_text("content2")

        # Patch file paths to use tmp_path
        state = workflow_with_analyze
        state.last_analyze.file_checksums = {
            str(file1): hashlib.sha256(b"content1").hexdigest(),
            str(file2): hashlib.sha256(b"content2").hexdigest(),
        }

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # Analyze should show as run
            analyze_cmd = next(
                cmd for cmd in result["commands"] if cmd["command"] == "analyze"
            )
            assert analyze_cmd["status"] == "run"
            assert analyze_cmd["item_count"] == 23
            assert analyze_cmd["file_count"] == 2

            # Others should be not_run
            assert (
                sum(1 for cmd in result["commands"] if cmd["status"] == "not_run") == 3
            )

            # No staleness warnings
            assert result["staleness_warnings"] == []

            # Should suggest running audit next
            assert len(result["suggestions"]) == 1
            assert "audit" in result["suggestions"][0]

            # No file modifications
            assert result["file_modifications"] == 0

    def test_cmd_status_staleness_detect_audit(
        self, mock_args, workflow_with_stale_audit, capsys, tmp_path
    ):
        """Test staleness detection when analyze re-run after audit."""
        # Create test file
        file1 = tmp_path / "file1.py"
        file1.write_text("content")

        state = workflow_with_stale_audit
        state.last_analyze.file_checksums = {
            str(file1): hashlib.sha256(b"content").hexdigest()
        }

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # Should detect audit staleness
            assert len(result["staleness_warnings"]) >= 1
            assert any(
                "audit is stale" in warning for warning in result["staleness_warnings"]
            )

            # Should suggest re-running audit
            assert len(result["suggestions"]) >= 1
            assert any("audit" in sug for sug in result["suggestions"])

    def test_cmd_status_staleness_detect_plan(
        self, mock_args, workflow_with_stale_plan, capsys, tmp_path
    ):
        """Test staleness detection when analyze re-run after plan."""
        # Create test file
        file1 = tmp_path / "file1.py"
        file1.write_text("content")

        state = workflow_with_stale_plan
        state.last_analyze.file_checksums = {
            str(file1): hashlib.sha256(b"content").hexdigest()
        }

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # Should detect plan staleness
            assert len(result["staleness_warnings"]) >= 1
            assert any(
                "plan is stale" in warning for warning in result["staleness_warnings"]
            )

            # Note: Suggestion prioritizes audit over plan
            # (both are stale in this fixture)
            # So suggestion will be "refresh audit" not "regenerate plan"
            assert len(result["suggestions"]) >= 1
            assert any("audit" in sug or "plan" in sug for sug in result["suggestions"])

    def test_cmd_status_file_modifications_detected(
        self, mock_args, workflow_with_analyze, capsys, tmp_path
    ):
        """Test detection of file modifications via checksum changes."""
        # Create test files
        file1 = tmp_path / "file1.py"
        file2 = tmp_path / "file2.py"
        file1.write_text("modified_content")  # Different from original
        file2.write_text("content2")  # Same as original

        # Store original checksums in state
        state = workflow_with_analyze
        state.last_analyze.file_checksums = {
            str(file1): hashlib.sha256(b"original_content").hexdigest(),
            str(file2): hashlib.sha256(b"content2").hexdigest(),
        }

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # Should detect 1 file modification
            assert result["file_modifications"] == 1

            # Should warn about stale analyze
            assert len(result["staleness_warnings"]) >= 1
            assert any(
                "analyze is stale" in warning and "1 file" in warning
                for warning in result["staleness_warnings"]
            )

            # Should suggest incremental re-analysis
            assert len(result["suggestions"]) >= 1
            assert any("--incremental" in sug for sug in result["suggestions"])

    def test_cmd_status_file_deleted(
        self, mock_args, workflow_with_analyze, capsys, tmp_path
    ):
        """Test detection of deleted files."""
        # File exists in checksums but not on disk
        nonexistent_file = tmp_path / "deleted_file.py"

        state = workflow_with_analyze
        state.last_analyze.file_checksums = {
            str(nonexistent_file): "abc123",  # File doesn't exist
        }

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # Deleted file should count as modification
            assert result["file_modifications"] == 1

            # Should warn about stale analyze
            assert len(result["staleness_warnings"]) >= 1
            assert any(
                "analyze is stale" in warning
                for warning in result["staleness_warnings"]
            )

    def test_cmd_status_suggestion_priority(
        self, mock_args, empty_workflow_state, capsys
    ):
        """Test suggestion priority algorithm."""
        with patch(
            "src.main.WorkflowStateManager.load_workflow_state",
            return_value=empty_workflow_state,
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # With no commands run, should suggest analyze
            assert len(result["suggestions"]) == 1
            assert "analyze" in result["suggestions"][0].lower()

    def test_cmd_status_error_corrupted_state(self, mock_args, capsys):
        """Test error handling for corrupted workflow state."""
        with patch(
            "src.main.WorkflowStateManager.load_workflow_state",
            side_effect=ValueError("Invalid JSON"),
        ):
            exit_code = cmd_status(mock_args)

            # Should return error code
            assert exit_code == 1

            # Should print error message
            captured = capsys.readouterr()
            assert "Error:" in captured.err
