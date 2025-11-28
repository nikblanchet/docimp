"""Tests for rollback CLI commands."""

import argparse
import sys
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.main import (
    cmd_interactive_rollback,
    cmd_list_changes,
    cmd_list_sessions,
    cmd_rollback_change,
    cmd_rollback_session,
)
from src.writer.transaction_manager import (
    RollbackResult,
    TransactionEntry,
    TransactionManifest,
)


class TestListSessions:
    """Test cmd_list_sessions command."""

    def test_list_sessions_with_sessions(self, capsys):
        """Test listing sessions when sessions exist."""
        # Create mock manager
        manager = Mock()

        # Create mock sessions
        session1 = TransactionManifest(
            session_id="44444444-4444-4444-8444-444444444444",
            started_at="2024-01-01T10:00:00",
            status="in_progress",
            entries=[
                TransactionEntry(
                    entry_id="abc123",
                    filepath="/test/file1.py",
                    backup_path="/test/file1.py.bak",
                    timestamp="2024-01-01T10:01:00",
                    item_name="func1",
                    item_type="function",
                    language="python",
                    success=True,
                )
            ],
        )
        session2 = TransactionManifest(
            session_id="55555555-5555-4555-8555-555555555555",
            started_at="2024-01-01T11:00:00",
            status="in_progress",
            entries=[],
        )

        manager.list_uncommitted_transactions.return_value = [session1, session2]

        # Create mock args
        args = argparse.Namespace(verbose=False, format="table")

        # Mock GitHelper.check_git_available
        with patch("src.main.GitHelper.check_git_available", return_value=True):
            result = cmd_list_sessions(args, manager)

        assert result == 0

        # Check output
        captured = capsys.readouterr()
        assert "Active DocImp Sessions" in captured.out
        assert "44444444-4444-4444-8444-444444444444" in captured.out
        assert "55555555-5555-4555-8555-555555555555" in captured.out
        assert "Total: 2 session(s)" in captured.out

    def test_list_sessions_no_sessions(self, capsys):
        """Test listing sessions when no sessions exist."""
        manager = Mock()
        manager.list_uncommitted_transactions.return_value = []

        args = argparse.Namespace(verbose=False, format="table")

        with patch("src.main.GitHelper.check_git_available", return_value=True):
            result = cmd_list_sessions(args, manager)

        assert result == 0
        captured = capsys.readouterr()
        assert "No active sessions found" in captured.out

    def test_list_sessions_git_unavailable(self, capsys):
        """Test listing sessions when git is not available."""
        manager = Mock()
        args = argparse.Namespace(verbose=False, format="table")

        with patch("src.main.GitHelper.check_git_available", return_value=False):
            result = cmd_list_sessions(args, manager)

        assert result == 1
        captured = capsys.readouterr()
        assert "Git not installed" in captured.err


class TestListChanges:
    """Test cmd_list_changes command."""

    def test_list_changes_with_changes(self, capsys):
        """Test listing changes when changes exist."""
        manager = Mock()

        # Create mock changes
        change1 = TransactionEntry(
            entry_id="abc123",
            filepath="/test/file1.py",
            backup_path="/test/file1.py.bak",
            timestamp="2024-01-01T10:01:00",
            item_name="func1",
            item_type="function",
            language="python",
            success=True,
        )
        change2 = TransactionEntry(
            entry_id="def456",
            filepath="/test/file2.py",
            backup_path="/test/file2.py.bak",
            timestamp="2024-01-01T10:02:00",
            item_name="func2",
            item_type="function",
            language="python",
            success=True,
        )

        manager.list_session_changes.return_value = [change1, change2]

        test_uuid = "11111111-1111-4111-8111-111111111111"
        args = argparse.Namespace(session_id=test_uuid, verbose=False, format="table")

        with patch("src.main.GitHelper.check_git_available", return_value=True):
            result = cmd_list_changes(args, manager)

        assert result == 0
        captured = capsys.readouterr()
        assert f"Changes in Session: {test_uuid}" in captured.out
        assert "abc123" in captured.out
        assert "def456" in captured.out
        assert "Total: 2 change(s)" in captured.out

    def test_list_changes_invalid_session(self, capsys):
        """Test listing changes for invalid session."""
        manager = Mock()
        manager.list_session_changes.side_effect = ValueError("Session does not exist")

        args = argparse.Namespace(
            session_id="invalid-session-id", verbose=False, format="table"
        )

        with patch("src.main.GitHelper.check_git_available", return_value=True):
            result = cmd_list_changes(args, manager)

        assert result == 1
        captured = capsys.readouterr()
        assert "Invalid session ID format" in captured.err
        assert "UUID format" in captured.err


class TestRollbackSession:
    """Test cmd_rollback_session command."""

    def test_rollback_session_last_flag(self, capsys):
        """Test rolling back most recent session using 'last' keyword."""
        manager = Mock()

        # Create two mock sessions with different timestamps
        session1 = TransactionManifest(
            session_id="22222222-2222-4222-8222-222222222222",
            started_at="2024-01-01T10:00:00",
            status="in_progress",
            entries=[
                TransactionEntry(
                    entry_id="abc123",
                    filepath="/test/file1.py",
                    backup_path="/test/file1.py.bak",
                    timestamp="2024-01-01T10:01:00",
                    item_name="func1",
                    item_type="function",
                    language="python",
                    success=True,
                )
            ],
        )
        session2 = TransactionManifest(
            session_id="33333333-3333-4333-8333-333333333333",
            started_at="2024-01-01T11:00:00",
            status="in_progress",
            entries=[
                TransactionEntry(
                    entry_id="def456",
                    filepath="/test/file2.py",
                    backup_path="/test/file2.py.bak",
                    timestamp="2024-01-01T11:01:00",
                    item_name="func2",
                    item_type="function",
                    language="python",
                    success=True,
                )
            ],
        )

        # list_uncommitted_transactions returns both sessions
        manager.list_uncommitted_transactions.return_value = [session1, session2]
        manager.load_manifest.return_value = session2  # Most recent
        manager.rollback_transaction.return_value = 1

        args = argparse.Namespace(
            session_id="last", verbose=False, format="table", no_confirm=True
        )

        with (
            patch("src.main.GitHelper.check_git_available", return_value=True),
            patch("src.main.Path.exists", return_value=True),
        ):
            result = cmd_rollback_session(args, manager)

        assert result == 0
        # Verify the most recent session was loaded
        newer_uuid = "33333333-3333-4333-8333-333333333333"
        manager.load_manifest.assert_called_once()
        assert newer_uuid in str(manager.load_manifest.call_args)

    def test_rollback_session_last_no_sessions(self, capsys):
        """Test 'last' flag when no sessions exist."""
        manager = Mock()
        manager.list_uncommitted_transactions.return_value = []

        args = argparse.Namespace(
            session_id="last", verbose=False, format="table", no_confirm=False
        )

        with patch("src.main.GitHelper.check_git_available", return_value=True):
            result = cmd_rollback_session(args, manager)

        assert result == 1
        captured = capsys.readouterr()
        assert "No active sessions found" in captured.err

    def test_rollback_session_success(self, capsys):
        """Test successful session rollback."""
        manager = Mock()

        # Create mock manifest
        manifest = TransactionManifest(
            session_id="11111111-1111-4111-8111-111111111111",
            started_at="2024-01-01T10:00:00",
            status="in_progress",
            entries=[
                TransactionEntry(
                    entry_id="abc123",
                    filepath="/test/file1.py",
                    backup_path="/test/file1.py.bak",
                    timestamp="2024-01-01T10:01:00",
                    item_name="func1",
                    item_type="function",
                    language="python",
                    success=True,
                )
            ],
        )

        manager.load_manifest.return_value = manifest
        manager.rollback_transaction.return_value = 1

        test_uuid = "11111111-1111-4111-8111-111111111111"
        args = argparse.Namespace(
            session_id=test_uuid, verbose=False, format="table", no_confirm=False
        )

        # Mock Path.exists to return True for manifest
        with (
            patch("src.main.GitHelper.check_git_available", return_value=True),
            patch("src.main.Path.exists", return_value=True),
            patch("builtins.input", return_value="y"),
        ):
            result = cmd_rollback_session(args, manager)

        assert result == 0
        captured = capsys.readouterr()
        assert "Success! Rolled back 1 file(s)" in captured.out

    def test_rollback_session_cancelled(self, capsys):
        """Test cancelling session rollback."""
        manager = Mock()

        manifest = TransactionManifest(
            session_id="11111111-1111-4111-8111-111111111111",
            started_at="2024-01-01T10:00:00",
            status="in_progress",
            entries=[],
        )

        manager.load_manifest.return_value = manifest

        test_uuid = "11111111-1111-4111-8111-111111111111"
        args = argparse.Namespace(
            session_id=test_uuid, verbose=False, format="table", no_confirm=False
        )

        with (
            patch("src.main.GitHelper.check_git_available", return_value=True),
            patch("src.main.Path.exists", return_value=True),
            patch("builtins.input", return_value="n"),
        ):
            result = cmd_rollback_session(args, manager)

        assert result == 0
        captured = capsys.readouterr()
        assert "Rollback cancelled" in captured.out
        manager.rollback_transaction.assert_not_called()

    def test_rollback_session_not_found(self, capsys):
        """Test rollback for non-existent session."""
        manager = Mock()
        nonexistent_uuid = "99999999-9999-4999-8999-999999999999"
        args = argparse.Namespace(
            session_id=nonexistent_uuid, verbose=False, format="table", no_confirm=False
        )

        with (
            patch("src.main.GitHelper.check_git_available", return_value=True),
            patch("src.main.Path.exists", return_value=False),
        ):
            result = cmd_rollback_session(args, manager)

        assert result == 1
        captured = capsys.readouterr()
        assert f"Session not found: {nonexistent_uuid}" in captured.err


class TestRollbackChange:
    """Test cmd_rollback_change command."""

    def test_rollback_change_last_flag(self, capsys):
        """Test rolling back most recent change using 'last' keyword."""
        manager = Mock()

        # Create mock sessions with changes
        session1 = TransactionManifest(
            session_id="44444444-4444-4444-8444-444444444444",
            started_at="2024-01-01T10:00:00",
            status="in_progress",
            entries=[],
        )
        session2 = TransactionManifest(
            session_id="55555555-5555-4555-8555-555555555555",
            started_at="2024-01-01T11:00:00",
            status="in_progress",
            entries=[],
        )

        # Create changes with different timestamps
        change1 = TransactionEntry(
            entry_id="abc123",
            filepath="/test/file1.py",
            backup_path="/test/file1.py.bak",
            timestamp="2024-01-01T10:01:00",
            item_name="func1",
            item_type="function",
            language="python",
            success=True,
        )
        change2 = TransactionEntry(
            entry_id="def456",
            filepath="/test/file2.py",
            backup_path="/test/file2.py.bak",
            timestamp="2024-01-01T11:01:00",  # Most recent
            item_name="func2",
            item_type="function",
            language="python",
            success=True,
        )
        change3 = TransactionEntry(
            entry_id="ghi789",
            filepath="/test/file3.py",
            backup_path="/test/file3.py.bak",
            timestamp="2024-01-01T10:30:00",
            item_name="func3",
            item_type="function",
            language="python",
            success=True,
        )

        manager.list_uncommitted_transactions.return_value = [session1, session2]
        session1_uuid = "44444444-4444-4444-8444-444444444444"
        manager.list_session_changes.side_effect = lambda sid: (
            [change1, change3] if sid == session1_uuid else [change2]
        )
        manager.get_change_diff.return_value = "diff --git a/file2.py b/file2.py\n..."
        manager.rollback_change.return_value = RollbackResult(
            success=True,
            restored_count=1,
            failed_count=0,
            conflicts=[],
            status="completed",
        )

        args = argparse.Namespace(
            entry_id="last", verbose=False, format="table", no_confirm=True
        )

        with patch("src.main.GitHelper.check_git_available", return_value=True):
            result = cmd_rollback_change(args, manager)

        assert result == 0
        # Verify the most recent change (def456) was used
        manager.get_change_diff.assert_called_with("def456")
        manager.rollback_change.assert_called_with("def456")

    def test_rollback_change_last_no_sessions(self, capsys):
        """Test 'last' flag when no sessions exist."""
        manager = Mock()
        manager.list_uncommitted_transactions.return_value = []

        args = argparse.Namespace(
            entry_id="last", verbose=False, format="table", no_confirm=False
        )

        with patch("src.main.GitHelper.check_git_available", return_value=True):
            result = cmd_rollback_change(args, manager)

        assert result == 1
        captured = capsys.readouterr()
        assert "No active sessions found" in captured.err

    def test_rollback_change_last_no_changes(self, capsys):
        """Test 'last' flag when sessions exist but have no changes."""
        manager = Mock()

        session = TransactionManifest(
            session_id="44444444-4444-4444-8444-444444444444",
            started_at="2024-01-01T10:00:00",
            status="in_progress",
            entries=[],
        )

        manager.list_uncommitted_transactions.return_value = [session]
        manager.list_session_changes.return_value = []

        args = argparse.Namespace(
            entry_id="last", verbose=False, format="table", no_confirm=False
        )

        with patch("src.main.GitHelper.check_git_available", return_value=True):
            result = cmd_rollback_change(args, manager)

        assert result == 1
        captured = capsys.readouterr()
        assert "No changes found" in captured.err

    def test_rollback_change_success(self, capsys):
        """Test successful change rollback."""
        manager = Mock()
        manager.get_change_diff.return_value = "diff --git a/file.py b/file.py\n..."
        manager.rollback_change.return_value = RollbackResult(
            success=True,
            restored_count=1,
            failed_count=0,
            conflicts=[],
            status="completed",
        )

        args = argparse.Namespace(
            entry_id="abc123", verbose=False, format="table", no_confirm=False
        )

        with (
            patch("src.main.GitHelper.check_git_available", return_value=True),
            patch("builtins.input", return_value="y"),
        ):
            result = cmd_rollback_change(args, manager)

        assert result == 0
        captured = capsys.readouterr()
        assert "Success! Rolled back 1 file(s)" in captured.out

    def test_rollback_change_with_conflicts(self, capsys):
        """Test change rollback with conflicts."""
        manager = Mock()
        manager.get_change_diff.return_value = "diff --git a/file.py b/file.py\n..."
        manager.rollback_change.return_value = RollbackResult(
            success=False,
            restored_count=0,
            failed_count=1,
            conflicts=["/test/file.py"],
            status="failed",
        )

        args = argparse.Namespace(
            entry_id="abc123", verbose=False, format="table", no_confirm=False
        )

        with (
            patch("src.main.GitHelper.check_git_available", return_value=True),
            patch("builtins.input", return_value="y"),
        ):
            result = cmd_rollback_change(args, manager)

        assert result == 1
        captured = capsys.readouterr()
        assert "Rollback failed" in captured.err
        assert "Conflict Details" in captured.err
        assert "Resolution Options" in captured.err


class TestInteractiveRollback:
    """Test cmd_interactive_rollback command."""

    def test_interactive_rollback_select_change(self, capsys):
        """Test interactive rollback selecting individual change."""
        manager = Mock()

        # Mock session data
        session = TransactionManifest(
            session_id="11111111-1111-4111-8111-111111111111",
            started_at="2024-01-01T10:00:00",
            status="in_progress",
            entries=[],
        )
        manager.list_uncommitted_transactions.return_value = [session]

        # Mock changes data
        change = TransactionEntry(
            entry_id="abc123",
            filepath="/test/file1.py",
            backup_path="/test/file1.py.bak",
            timestamp="2024-01-01T10:01:00",
            item_name="func1",
            item_type="function",
            language="python",
            success=True,
        )
        manager.list_session_changes.return_value = [change]

        # Mock successful rollback
        manager.rollback_change.return_value = RollbackResult(
            success=True,
            restored_count=1,
            failed_count=0,
            conflicts=[],
            status="completed",
        )

        args = argparse.Namespace(verbose=False)

        # Simulate user input: select session 1, change 1, confirm yes
        with (
            patch("src.main.GitHelper.check_git_available", return_value=True),
            patch("builtins.input", side_effect=["1", "1", "y"]),
        ):
            result = cmd_interactive_rollback(args, manager)

        assert result == 0
        captured = capsys.readouterr()
        assert "Success! Rolled back" in captured.out

    def test_interactive_rollback_cancel(self, capsys):
        """Test cancelling interactive rollback."""
        manager = Mock()

        session = TransactionManifest(
            session_id="11111111-1111-4111-8111-111111111111",
            started_at="2024-01-01T10:00:00",
            status="in_progress",
            entries=[],
        )
        manager.list_uncommitted_transactions.return_value = [session]

        args = argparse.Namespace(verbose=False)

        # Simulate user input: quit at session selection
        with (
            patch("src.main.GitHelper.check_git_available", return_value=True),
            patch("builtins.input", return_value="q"),
        ):
            result = cmd_interactive_rollback(args, manager)

        assert result == 0
        captured = capsys.readouterr()
        assert "Cancelled" in captured.out
