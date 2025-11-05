"""Tests for state directory management."""

import shutil
import sys
import tempfile
from pathlib import Path

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.utils.state_manager import StateManager


class TestStateManager:
    """Test suite for StateManager utility."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for testing."""
        temp = Path(tempfile.mkdtemp())
        yield temp
        # Cleanup
        if temp.exists():
            shutil.rmtree(temp)

    def test_get_state_dir_returns_correct_path(self, temp_dir):
        """Test that get_state_dir returns correct path."""
        state_dir = StateManager.get_state_dir(temp_dir)
        expected = temp_dir / ".docimp"
        assert state_dir == expected.resolve()

    def test_get_session_reports_dir_returns_correct_path(self, temp_dir):
        """Test that get_session_reports_dir returns correct path."""
        session_dir = StateManager.get_session_reports_dir(temp_dir)
        expected = temp_dir / ".docimp" / "session-reports"
        assert session_dir == expected.resolve()

    def test_get_history_dir_returns_correct_path(self, temp_dir):
        """Test that get_history_dir returns correct path."""
        history_dir = StateManager.get_history_dir(temp_dir)
        expected = temp_dir / ".docimp" / "history"
        assert history_dir == expected.resolve()

    def test_get_audit_file_returns_correct_path(self, temp_dir):
        """Test that get_audit_file returns correct path."""
        audit_file = StateManager.get_audit_file(temp_dir)
        expected = temp_dir / ".docimp" / "session-reports" / "audit.json"
        assert audit_file == expected.resolve()

    def test_get_plan_file_returns_correct_path(self, temp_dir):
        """Test that get_plan_file returns correct path."""
        plan_file = StateManager.get_plan_file(temp_dir)
        expected = temp_dir / ".docimp" / "session-reports" / "plan.json"
        assert plan_file == expected.resolve()

    def test_get_analyze_file_returns_correct_path(self, temp_dir):
        """Test that get_analyze_file returns correct path."""
        analyze_file = StateManager.get_analyze_file(temp_dir)
        expected = temp_dir / ".docimp" / "session-reports" / "analyze-latest.json"
        assert analyze_file == expected.resolve()

    def test_ensure_state_dir_creates_directories(self, temp_dir):
        """Test that ensure_state_dir creates all required directories."""
        StateManager.ensure_state_dir(temp_dir)

        state_dir = temp_dir / ".docimp"
        session_dir = temp_dir / ".docimp" / "session-reports"
        history_dir = temp_dir / ".docimp" / "history"

        assert state_dir.exists()
        assert state_dir.is_dir()
        assert session_dir.exists()
        assert session_dir.is_dir()
        assert history_dir.exists()
        assert history_dir.is_dir()

    def test_ensure_state_dir_is_idempotent(self, temp_dir):
        """Test that calling ensure_state_dir multiple times is safe."""
        StateManager.ensure_state_dir(temp_dir)
        StateManager.ensure_state_dir(temp_dir)  # Call again
        StateManager.ensure_state_dir(temp_dir)  # And again

        # Should still work fine
        state_dir = temp_dir / ".docimp"
        assert state_dir.exists()

    def test_clear_session_reports_removes_files(self, temp_dir):
        """Test that clear_session_reports removes all files."""
        # Setup: Create state directory with files
        StateManager.ensure_state_dir(temp_dir)
        session_dir = StateManager.get_session_reports_dir(temp_dir)

        # Create some test files
        (session_dir / "audit.json").write_text('{"test": "data"}')
        (session_dir / "plan.json").write_text('{"test": "data"}')
        (session_dir / "analyze-latest.json").write_text('{"test": "data"}')

        # Verify files exist
        assert (session_dir / "audit.json").exists()
        assert (session_dir / "plan.json").exists()
        assert (session_dir / "analyze-latest.json").exists()

        # Clear
        files_removed = StateManager.clear_session_reports(temp_dir)

        # Verify files removed
        assert files_removed == 3
        assert not (session_dir / "audit.json").exists()
        assert not (session_dir / "plan.json").exists()
        assert not (session_dir / "analyze-latest.json").exists()

        # Verify directory still exists
        assert session_dir.exists()

    def test_clear_session_reports_preserves_history(self, temp_dir):
        """Test that clear_session_reports does not touch history directory."""
        # Setup: Create state directory with files in both session and history
        StateManager.ensure_state_dir(temp_dir)
        session_dir = StateManager.get_session_reports_dir(temp_dir)
        history_dir = StateManager.get_history_dir(temp_dir)

        # Create files in session-reports
        (session_dir / "audit.json").write_text('{"test": "data"}')

        # Create files in history
        (history_dir / "old-audit.json").write_text('{"test": "old"}')

        # Clear session reports
        StateManager.clear_session_reports(temp_dir)

        # Verify session file removed
        assert not (session_dir / "audit.json").exists()

        # Verify history file preserved
        assert (history_dir / "old-audit.json").exists()

    def test_clear_session_reports_creates_dir_if_missing(self, temp_dir):
        """Test that clear_session_reports creates directory if it doesn't exist."""
        # Don't call ensure_state_dir first
        files_removed = StateManager.clear_session_reports(temp_dir)

        # Should not error, and should create the directory
        assert files_removed == 0
        assert StateManager.get_session_reports_dir(temp_dir).exists()

    def test_state_dir_exists_returns_true_when_exists(self, temp_dir):
        """Test that state_dir_exists returns True when directory exists."""
        StateManager.ensure_state_dir(temp_dir)
        assert StateManager.state_dir_exists(temp_dir) is True

    def test_state_dir_exists_returns_false_when_missing(self, temp_dir):
        """Test that state_dir_exists returns False when directory missing."""
        assert StateManager.state_dir_exists(temp_dir) is False

    def test_paths_are_absolute(self, temp_dir):
        """Test that all returned paths are absolute."""
        paths = [
            StateManager.get_state_dir(temp_dir),
            StateManager.get_session_reports_dir(temp_dir),
            StateManager.get_history_dir(temp_dir),
            StateManager.get_audit_file(temp_dir),
            StateManager.get_plan_file(temp_dir),
            StateManager.get_analyze_file(temp_dir),
        ]

        for path in paths:
            assert path.is_absolute(), f"Path {path} is not absolute"

    def test_get_methods_work_without_base_path(self):
        """Test that get methods work with default (cwd) when base_path is None."""
        # Should not raise an error
        state_dir = StateManager.get_state_dir()
        assert state_dir.is_absolute()
        assert state_dir.name == ".docimp"

    def test_validate_write_permission_succeeds_for_writable_file(self, temp_dir):
        """Test that validate_write_permission succeeds for writable files."""
        # Create a writable file
        test_file = temp_dir / "writable.json"
        test_file.write_text('{"test": "data"}')

        # Should not raise an exception
        StateManager.validate_write_permission(test_file)

    def test_validate_write_permission_succeeds_for_writable_directory(self, temp_dir):
        """Test that validate_write_permission succeeds when file doesn't

        exist but directory is writable."""
        # File doesn't exist yet, but temp_dir is writable
        test_file = temp_dir / "new-file.json"
        assert not test_file.exists()

        # Should not raise an exception
        StateManager.validate_write_permission(test_file)

    def test_validate_write_permission_fails_for_readonly_file(self, temp_dir):
        """Test that validate_write_permission raises PermissionError for
        read-only files."""
        # Create a read-only file
        test_file = temp_dir / "readonly.json"
        test_file.write_text('{"test": "data"}')
        test_file.chmod(0o444)  # Read-only

        # Should raise PermissionError with helpful message
        with pytest.raises(PermissionError) as exc_info:
            StateManager.validate_write_permission(test_file)

        error_message = str(exc_info.value).lower()
        assert "permission" in error_message
        assert "write" in error_message or "read-only" in error_message

        # Cleanup: restore permissions for deletion
        test_file.chmod(0o644)

    def test_validate_write_permission_fails_for_readonly_directory(self, temp_dir):
        """Test that validate_write_permission raises PermissionError when
        directory is read-only."""
        # Create a read-only directory
        readonly_dir = temp_dir / "readonly"
        readonly_dir.mkdir()
        readonly_dir.chmod(0o555)  # Read and execute only, no write

        test_file = readonly_dir / "new-file.json"
        assert not test_file.exists()

        # Should raise PermissionError with helpful message
        with pytest.raises(PermissionError) as exc_info:
            StateManager.validate_write_permission(test_file)

        error_message = str(exc_info.value).lower()
        assert "permission" in error_message
        assert "write" in error_message or "access" in error_message

        # Cleanup: restore permissions for deletion
        readonly_dir.chmod(0o755)

    def test_validate_write_permission_fails_for_nonexistent_directory(self, temp_dir):
        """Test that validate_write_permission raises PermissionError when
        parent directory doesn't exist."""
        # Parent directory doesn't exist
        test_file = temp_dir / "nonexistent" / "new-file.json"
        assert not test_file.parent.exists()

        # Should raise PermissionError with helpful message
        with pytest.raises(PermissionError) as exc_info:
            StateManager.validate_write_permission(test_file)

        error_message = str(exc_info.value).lower()
        assert "permission" in error_message
        assert "does not exist" in error_message or "directory" in error_message

    def test_get_transactions_dir_returns_correct_path(self, temp_dir):
        """Test that get_transactions_dir returns correct path."""
        transactions_dir = StateManager.get_transactions_dir(temp_dir)
        expected = temp_dir / ".docimp" / "session-reports" / "transactions"
        assert transactions_dir == expected.resolve()

    def test_get_transaction_file_returns_correct_path(self, temp_dir):
        """Test that get_transaction_file returns correct path for session ID."""
        session_id = "abc-123-def"
        transaction_file = StateManager.get_transaction_file(session_id, temp_dir)
        expected = (
            temp_dir
            / ".docimp"
            / "session-reports"
            / "transactions"
            / "transaction-abc-123-def.json"
        )
        assert transaction_file == expected.resolve()

    def test_list_transaction_files_empty_directory(self, temp_dir):
        """Test list_transaction_files when transactions directory doesn't exist."""
        files = StateManager.list_transaction_files(temp_dir)
        assert files == []

    def test_list_transaction_files_returns_sorted_files(self, temp_dir):
        """Test that list_transaction_files returns files sorted by
        modification time."""
        import time

        transactions_dir = StateManager.get_transactions_dir(temp_dir)
        transactions_dir.mkdir(parents=True)

        # Create files with delays to ensure different timestamps
        file1 = transactions_dir / "transaction-1.json"
        file1.write_text("{}")
        time.sleep(0.01)

        file2 = transactions_dir / "transaction-2.json"
        file2.write_text("{}")
        time.sleep(0.01)

        file3 = transactions_dir / "transaction-3.json"
        file3.write_text("{}")

        files = StateManager.list_transaction_files(temp_dir)

        # Should be sorted newest first
        assert len(files) == 3
        assert files[0].name == "transaction-3.json"
        assert files[1].name == "transaction-2.json"
        assert files[2].name == "transaction-1.json"

    def test_list_transaction_files_ignores_non_transaction_files(self, temp_dir):
        """Test that list_transaction_files only returns transaction-*.json files."""
        transactions_dir = StateManager.get_transactions_dir(temp_dir)
        transactions_dir.mkdir(parents=True)

        # Create transaction files
        (transactions_dir / "transaction-1.json").write_text("{}")
        (transactions_dir / "transaction-2.json").write_text("{}")

        # Create non-transaction files (should be ignored)
        (transactions_dir / "other-file.json").write_text("{}")
        (transactions_dir / "README.md").write_text("# Transactions")

        files = StateManager.list_transaction_files(temp_dir)

        # Should only return transaction-* files
        assert len(files) == 2
        assert all("transaction-" in f.name for f in files)
