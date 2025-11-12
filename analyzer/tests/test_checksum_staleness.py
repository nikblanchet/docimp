"""
Unit tests for checksum-based staleness detection.

Tests the compare_file_checksums and is_stale functions
that use file-level checksums to detect stale workflow states.
"""

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
    return args


class TestCompareFileChecksums:
    """Test suite for compare_file_checksums helper function."""

    def test_no_changes_when_checksums_match(self, mock_args, capsys):
        """Test that no changes detected when all checksums match."""
        state = WorkflowState(
            schema_version="1.0",
            last_analyze=CommandState(
                timestamp="2025-01-01T12:00:00Z",
                item_count=5,
                file_checksums={
                    "file1.ts": "checksum1",
                    "file2.ts": "checksum2",
                    "file3.ts": "checksum3",
                },
            ),
            last_audit=CommandState(
                timestamp="2025-01-01T10:00:00Z",
                item_count=5,
                file_checksums={
                    "file1.ts": "checksum1",
                    "file2.ts": "checksum2",
                    "file3.ts": "checksum3",
                },
            ),
            last_plan=None,
            last_improve=None,
        )

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # Should not detect audit staleness
            audit_stale = any(
                "audit is stale" in warning for warning in result["staleness_warnings"]
            )
            assert not audit_stale

    def test_detects_modified_file(self, mock_args, capsys):
        """Test detection of modified file (different checksum)."""
        state = WorkflowState(
            schema_version="1.0",
            last_analyze=CommandState(
                timestamp="2025-01-01T12:00:00Z",
                item_count=3,
                file_checksums={
                    "file1.ts": "newchecksum",  # Modified
                    "file2.ts": "checksum2",
                    "file3.ts": "checksum3",
                },
            ),
            last_audit=CommandState(
                timestamp="2025-01-01T10:00:00Z",
                item_count=3,
                file_checksums={
                    "file1.ts": "oldchecksum",  # Original
                    "file2.ts": "checksum2",
                    "file3.ts": "checksum3",
                },
            ),
            last_plan=None,
            last_improve=None,
        )

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # Should detect audit staleness with 1 file changed
            assert any(
                "audit is stale" in warning and "1 file" in warning
                for warning in result["staleness_warnings"]
            )

    def test_detects_removed_file(self, mock_args, capsys):
        """Test detection of removed file (present in older state, absent in newer)."""
        state = WorkflowState(
            schema_version="1.0",
            last_analyze=CommandState(
                timestamp="2025-01-01T12:00:00Z",
                item_count=2,
                file_checksums={
                    "file1.ts": "checksum1",
                    "file2.ts": "checksum2",
                    # file3.ts removed
                },
            ),
            last_audit=CommandState(
                timestamp="2025-01-01T10:00:00Z",
                item_count=3,
                file_checksums={
                    "file1.ts": "checksum1",
                    "file2.ts": "checksum2",
                    "file3.ts": "checksum3",  # This file was removed
                },
            ),
            last_plan=None,
            last_improve=None,
        )

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # Should detect audit staleness with 1 file changed (removed)
            assert any(
                "audit is stale" in warning and "1 file" in warning
                for warning in result["staleness_warnings"]
            )

    def test_detects_added_file(self, mock_args, capsys):
        """Test detection of added file (absent in older state, present in newer)."""
        state = WorkflowState(
            schema_version="1.0",
            last_analyze=CommandState(
                timestamp="2025-01-01T12:00:00Z",
                item_count=3,
                file_checksums={
                    "file1.ts": "checksum1",
                    "file2.ts": "checksum2",
                    "file3.ts": "checksum3",  # New file
                },
            ),
            last_audit=CommandState(
                timestamp="2025-01-01T10:00:00Z",
                item_count=2,
                file_checksums={
                    "file1.ts": "checksum1",
                    "file2.ts": "checksum2",
                    # file3.ts didn't exist yet
                },
            ),
            last_plan=None,
            last_improve=None,
        )

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # Should detect audit staleness with 1 file changed (added)
            assert any(
                "audit is stale" in warning and "1 file" in warning
                for warning in result["staleness_warnings"]
            )

    def test_detects_multiple_changes(self, mock_args, capsys):
        """Test detection of multiple file changes (modified, added, removed)."""
        state = WorkflowState(
            schema_version="1.0",
            last_analyze=CommandState(
                timestamp="2025-01-01T12:00:00Z",
                item_count=4,
                file_checksums={
                    "file1.ts": "newchecksum1",  # Modified
                    "file2.ts": "newchecksum2",  # Modified
                    "file3.ts": "checksum3",  # Unchanged
                    "file4.ts": "checksum4",  # Added
                    # removed.ts removed
                },
            ),
            last_audit=CommandState(
                timestamp="2025-01-01T10:00:00Z",
                item_count=4,
                file_checksums={
                    "file1.ts": "oldchecksum1",  # Modified
                    "file2.ts": "oldchecksum2",  # Modified
                    "file3.ts": "checksum3",  # Unchanged
                    "removed.ts": "removed",  # Removed
                },
            ),
            last_plan=None,
            last_improve=None,
        )

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # Should detect audit staleness with 4 files changed
            # (2 modified + 1 added + 1 removed = 4)
            assert any(
                "audit is stale" in warning and "4 file" in warning
                for warning in result["staleness_warnings"]
            )

    def test_legacy_fallback_when_checksums_missing(self, mock_args, capsys):
        """Test fallback to timestamp comparison when checksums missing."""
        state = WorkflowState(
            schema_version="1.0",
            last_analyze=CommandState(
                timestamp="2025-01-01T12:00:00Z",
                item_count=5,
                file_checksums={},  # Empty checksums (legacy data)
            ),
            last_audit=CommandState(
                timestamp="2025-01-01T10:00:00Z",
                item_count=3,
                file_checksums={},  # Empty checksums (legacy data)
            ),
            last_plan=None,
            last_improve=None,
        )

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # Should fall back to timestamp comparison
            # (analyze timestamp > audit timestamp, so audit is stale)
            assert any(
                "audit is stale" in warning for warning in result["staleness_warnings"]
            )


class TestIsStalePlan:
    """Test suite for is_stale function with plan command."""

    def test_plan_not_stale_when_checksums_match(self, mock_args, capsys):
        """Test plan not stale when analyze checksums match plan checksums."""
        state = WorkflowState(
            schema_version="1.0",
            last_analyze=CommandState(
                timestamp="2025-01-01T12:00:00Z",
                item_count=5,
                file_checksums={
                    "file1.ts": "checksum1",
                    "file2.ts": "checksum2",
                },
            ),
            last_audit=None,
            last_plan=CommandState(
                timestamp="2025-01-01T10:00:00Z",
                item_count=3,
                file_checksums={
                    "file1.ts": "checksum1",
                    "file2.ts": "checksum2",
                },
            ),
            last_improve=None,
        )

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # Plan should not be stale
            plan_stale = any(
                "plan is stale" in warning for warning in result["staleness_warnings"]
            )
            assert not plan_stale

    def test_plan_stale_when_files_modified(self, mock_args, capsys):
        """Test plan stale when files modified since plan."""
        state = WorkflowState(
            schema_version="1.0",
            last_analyze=CommandState(
                timestamp="2025-01-01T12:00:00Z",
                item_count=5,
                file_checksums={
                    "file1.ts": "newchecksum1",  # Modified
                    "file2.ts": "checksum2",
                },
            ),
            last_audit=None,
            last_plan=CommandState(
                timestamp="2025-01-01T10:00:00Z",
                item_count=5,
                file_checksums={
                    "file1.ts": "oldchecksum1",  # Original
                    "file2.ts": "checksum2",
                },
            ),
            last_improve=None,
        )

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # Plan should be stale with 1 file changed
            assert any(
                "plan is stale" in warning and "1 file" in warning
                for warning in result["staleness_warnings"]
            )

    def test_plan_stale_when_files_added(self, mock_args, capsys):
        """Test plan stale when new files added since plan."""
        state = WorkflowState(
            schema_version="1.0",
            last_analyze=CommandState(
                timestamp="2025-01-01T12:00:00Z",
                item_count=3,
                file_checksums={
                    "file1.ts": "checksum1",
                    "file2.ts": "checksum2",
                    "file3.ts": "checksum3",  # New file
                },
            ),
            last_audit=None,
            last_plan=CommandState(
                timestamp="2025-01-01T10:00:00Z",
                item_count=2,
                file_checksums={
                    "file1.ts": "checksum1",
                    "file2.ts": "checksum2",
                },
            ),
            last_improve=None,
        )

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # Plan should be stale with 1 file changed (added)
            assert any(
                "plan is stale" in warning and "1 file" in warning
                for warning in result["staleness_warnings"]
            )

    def test_plan_stale_when_files_removed(self, mock_args, capsys):
        """Test plan stale when files removed since plan."""
        state = WorkflowState(
            schema_version="1.0",
            last_analyze=CommandState(
                timestamp="2025-01-01T12:00:00Z",
                item_count=2,
                file_checksums={
                    "file1.ts": "checksum1",
                    "file2.ts": "checksum2",
                },
            ),
            last_audit=None,
            last_plan=CommandState(
                timestamp="2025-01-01T10:00:00Z",
                item_count=3,
                file_checksums={
                    "file1.ts": "checksum1",
                    "file2.ts": "checksum2",
                    "file3.ts": "checksum3",  # This file was removed
                },
            ),
            last_improve=None,
        )

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # Plan should be stale with 1 file changed (removed)
            assert any(
                "plan is stale" in warning and "1 file" in warning
                for warning in result["staleness_warnings"]
            )

    def test_plan_multiple_changes(self, mock_args, capsys):
        """Test plan staleness with multiple file changes."""
        state = WorkflowState(
            schema_version="1.0",
            last_analyze=CommandState(
                timestamp="2025-01-01T12:00:00Z",
                item_count=3,
                file_checksums={
                    "file1.ts": "newchecksum1",  # Modified
                    "file2.ts": "checksum2",  # Unchanged
                    "file3.ts": "checksum3",  # Added
                    # removed.ts removed
                },
            ),
            last_audit=None,
            last_plan=CommandState(
                timestamp="2025-01-01T10:00:00Z",
                item_count=3,
                file_checksums={
                    "file1.ts": "oldchecksum1",  # Modified
                    "file2.ts": "checksum2",  # Unchanged
                    "removed.ts": "removed",  # Removed
                },
            ),
            last_improve=None,
        )

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # Plan should be stale with 3 files changed
            # (1 modified + 1 added + 1 removed = 3)
            assert any(
                "plan is stale" in warning and "3 file" in warning
                for warning in result["staleness_warnings"]
            )


class TestIsStaleNotRun:
    """Test suite for is_stale when commands not run."""

    def test_no_staleness_when_audit_not_run(self, mock_args, capsys):
        """Test no staleness reported when audit hasn't been run."""
        state = WorkflowState(
            schema_version="1.0",
            last_analyze=CommandState(
                timestamp="2025-01-01T12:00:00Z",
                item_count=5,
                file_checksums={"file1.ts": "checksum1"},
            ),
            last_audit=None,  # Audit not run
            last_plan=None,
            last_improve=None,
        )

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # No staleness warnings (can't be stale if never run)
            audit_stale = any(
                "audit is stale" in warning for warning in result["staleness_warnings"]
            )
            assert not audit_stale

    def test_no_staleness_when_plan_not_run(self, mock_args, capsys):
        """Test no staleness reported when plan hasn't been run."""
        state = WorkflowState(
            schema_version="1.0",
            last_analyze=CommandState(
                timestamp="2025-01-01T12:00:00Z",
                item_count=5,
                file_checksums={"file1.ts": "checksum1"},
            ),
            last_audit=None,
            last_plan=None,  # Plan not run
            last_improve=None,
        )

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # No staleness warnings (can't be stale if never run)
            plan_stale = any(
                "plan is stale" in warning for warning in result["staleness_warnings"]
            )
            assert not plan_stale

    def test_no_staleness_when_analyze_not_run(self, mock_args, capsys):
        """Test no staleness reported when analyze hasn't been run."""
        state = WorkflowState(
            schema_version="1.0",
            last_analyze=None,  # Analyze not run
            last_audit=None,
            last_plan=None,
            last_improve=None,
        )

        with patch(
            "src.main.WorkflowStateManager.load_workflow_state", return_value=state
        ):
            exit_code = cmd_status(mock_args)

            assert exit_code == 0
            captured = capsys.readouterr()
            result = json.loads(captured.out)

            # No staleness warnings (nothing to compare against)
            assert result["staleness_warnings"] == []
