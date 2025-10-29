"""Tests for rollback CLI commands."""

import sys
from pathlib import Path
from unittest.mock import Mock, patch
import argparse

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.main import (
    cmd_list_sessions,
    cmd_list_changes,
    cmd_rollback_session,
    cmd_rollback_change,
    cmd_interactive_rollback
)
from src.writer.transaction_manager import TransactionManifest, TransactionEntry, RollbackResult


class TestListSessions:
    """Test cmd_list_sessions command."""

    def test_list_sessions_with_sessions(self, capsys):
        """Test listing sessions when sessions exist."""
        # Create mock manager
        manager = Mock()

        # Create mock sessions
        session1 = TransactionManifest(
            session_id='session-1',
            started_at='2024-01-01T10:00:00',
            status='in_progress',
            entries=[
                TransactionEntry(
                    entry_id='abc123',
                    filepath='/test/file1.py',
                    backup_path='/test/file1.py.bak',
                    timestamp='2024-01-01T10:01:00',
                    item_name='func1',
                    item_type='function',
                    language='python',
                    success=True
                )
            ]
        )
        session2 = TransactionManifest(
            session_id='session-2',
            started_at='2024-01-01T11:00:00',
            status='in_progress',
            entries=[]
        )

        manager.list_uncommitted_transactions.return_value = [session1, session2]

        # Create mock args
        args = argparse.Namespace(verbose=False, format='table')

        # Mock GitHelper.check_git_available
        with patch('src.main.GitHelper.check_git_available', return_value=True):
            result = cmd_list_sessions(args, manager)

        assert result == 0

        # Check output
        captured = capsys.readouterr()
        assert 'Active DocImp Sessions' in captured.out
        assert 'session-1' in captured.out
        assert 'session-2' in captured.out
        assert 'Total: 2 session(s)' in captured.out

    def test_list_sessions_no_sessions(self, capsys):
        """Test listing sessions when no sessions exist."""
        manager = Mock()
        manager.list_uncommitted_transactions.return_value = []

        args = argparse.Namespace(verbose=False, format='table')

        with patch('src.main.GitHelper.check_git_available', return_value=True):
            result = cmd_list_sessions(args, manager)

        assert result == 0
        captured = capsys.readouterr()
        assert 'No active sessions found' in captured.out

    def test_list_sessions_git_unavailable(self, capsys):
        """Test listing sessions when git is not available."""
        manager = Mock()
        args = argparse.Namespace(verbose=False, format='table')

        with patch('src.main.GitHelper.check_git_available', return_value=False):
            result = cmd_list_sessions(args, manager)

        assert result == 1
        captured = capsys.readouterr()
        assert 'Git not installed' in captured.err


class TestListChanges:
    """Test cmd_list_changes command."""

    def test_list_changes_with_changes(self, capsys):
        """Test listing changes when changes exist."""
        manager = Mock()

        # Create mock changes
        change1 = TransactionEntry(
            entry_id='abc123',
            filepath='/test/file1.py',
            backup_path='/test/file1.py.bak',
            timestamp='2024-01-01T10:01:00',
            item_name='func1',
            item_type='function',
            language='python',
            success=True
        )
        change2 = TransactionEntry(
            entry_id='def456',
            filepath='/test/file2.py',
            backup_path='/test/file2.py.bak',
            timestamp='2024-01-01T10:02:00',
            item_name='func2',
            item_type='function',
            language='python',
            success=True
        )

        manager.list_session_changes.return_value = [change1, change2]

        args = argparse.Namespace(session_id='test-session', verbose=False, format='table')

        with patch('src.main.GitHelper.check_git_available', return_value=True):
            result = cmd_list_changes(args, manager)

        assert result == 0
        captured = capsys.readouterr()
        assert 'Changes in Session: test-session' in captured.out
        assert 'abc123' in captured.out
        assert 'def456' in captured.out
        assert 'Total: 2 change(s)' in captured.out

    def test_list_changes_invalid_session(self, capsys):
        """Test listing changes for invalid session."""
        manager = Mock()
        manager.list_session_changes.side_effect = ValueError("Session does not exist")

        args = argparse.Namespace(session_id='invalid-session', verbose=False, format='table')

        with patch('src.main.GitHelper.check_git_available', return_value=True):
            result = cmd_list_changes(args, manager)

        assert result == 1
        captured = capsys.readouterr()
        assert 'Session does not exist' in captured.err
        assert 'docimp list-sessions' in captured.err


class TestRollbackSession:
    """Test cmd_rollback_session command."""

    def test_rollback_session_success(self, capsys):
        """Test successful session rollback."""
        manager = Mock()

        # Create mock manifest
        manifest = TransactionManifest(
            session_id='test-session',
            started_at='2024-01-01T10:00:00',
            status='in_progress',
            entries=[
                TransactionEntry(
                    entry_id='abc123',
                    filepath='/test/file1.py',
                    backup_path='/test/file1.py.bak',
                    timestamp='2024-01-01T10:01:00',
                    item_name='func1',
                    item_type='function',
                    language='python',
                    success=True
                )
            ]
        )

        manager.load_manifest.return_value = manifest
        manager.rollback_transaction.return_value = 1

        args = argparse.Namespace(session_id='test-session', verbose=False, format='table', no_confirm=False)

        # Mock Path.exists to return True for manifest
        with patch('src.main.GitHelper.check_git_available', return_value=True), \
             patch('src.main.Path.exists', return_value=True), \
             patch('builtins.input', return_value='y'):
            result = cmd_rollback_session(args, manager)

        assert result == 0
        captured = capsys.readouterr()
        assert 'Success! Rolled back 1 file(s)' in captured.out

    def test_rollback_session_cancelled(self, capsys):
        """Test cancelling session rollback."""
        manager = Mock()

        manifest = TransactionManifest(
            session_id='test-session',
            started_at='2024-01-01T10:00:00',
            status='in_progress',
            entries=[]
        )

        manager.load_manifest.return_value = manifest

        args = argparse.Namespace(session_id='test-session', verbose=False, format='table', no_confirm=False)

        with patch('src.main.GitHelper.check_git_available', return_value=True), \
             patch('src.main.Path.exists', return_value=True), \
             patch('builtins.input', return_value='n'):
            result = cmd_rollback_session(args, manager)

        assert result == 0
        captured = capsys.readouterr()
        assert 'Rollback cancelled' in captured.out
        manager.rollback_transaction.assert_not_called()

    def test_rollback_session_not_found(self, capsys):
        """Test rollback for non-existent session."""
        manager = Mock()
        args = argparse.Namespace(session_id='nonexistent', verbose=False, format='table', no_confirm=False)

        with patch('src.main.GitHelper.check_git_available', return_value=True), \
             patch('src.main.Path.exists', return_value=False):
            result = cmd_rollback_session(args, manager)

        assert result == 1
        captured = capsys.readouterr()
        assert 'Session not found: nonexistent' in captured.err


class TestRollbackChange:
    """Test cmd_rollback_change command."""

    def test_rollback_change_success(self, capsys):
        """Test successful change rollback."""
        manager = Mock()
        manager.get_change_diff.return_value = "diff --git a/file.py b/file.py\n..."
        manager.rollback_change.return_value = RollbackResult(
            success=True,
            restored_count=1,
            failed_count=0,
            conflicts=[],
            status='completed'
        )

        args = argparse.Namespace(entry_id='abc123', verbose=False, format='table', no_confirm=False)

        with patch('src.main.GitHelper.check_git_available', return_value=True), \
             patch('builtins.input', return_value='y'):
            result = cmd_rollback_change(args, manager)

        assert result == 0
        captured = capsys.readouterr()
        assert 'Success! Rolled back 1 file(s)' in captured.out

    def test_rollback_change_with_conflicts(self, capsys):
        """Test change rollback with conflicts."""
        manager = Mock()
        manager.get_change_diff.return_value = "diff --git a/file.py b/file.py\n..."
        manager.rollback_change.return_value = RollbackResult(
            success=False,
            restored_count=0,
            failed_count=1,
            conflicts=['/test/file.py'],
            status='failed'
        )

        args = argparse.Namespace(entry_id='abc123', verbose=False, format='table', no_confirm=False)

        with patch('src.main.GitHelper.check_git_available', return_value=True), \
             patch('builtins.input', return_value='y'):
            result = cmd_rollback_change(args, manager)

        assert result == 1
        captured = capsys.readouterr()
        assert 'Rollback failed' in captured.out
        assert 'conflicts' in captured.out.lower()


class TestInteractiveRollback:
    """Test cmd_interactive_rollback command."""

    def test_interactive_rollback_select_change(self, capsys):
        """Test interactive rollback selecting individual change."""
        manager = Mock()

        # Mock session data
        session = TransactionManifest(
            session_id='test-session',
            started_at='2024-01-01T10:00:00',
            status='in_progress',
            entries=[]
        )
        manager.list_uncommitted_transactions.return_value = [session]

        # Mock changes data
        change = TransactionEntry(
            entry_id='abc123',
            filepath='/test/file1.py',
            backup_path='/test/file1.py.bak',
            timestamp='2024-01-01T10:01:00',
            item_name='func1',
            item_type='function',
            language='python',
            success=True
        )
        manager.list_session_changes.return_value = [change]

        # Mock successful rollback
        manager.rollback_change.return_value = RollbackResult(
            success=True,
            restored_count=1,
            failed_count=0,
            conflicts=[],
            status='completed'
        )

        args = argparse.Namespace(verbose=False)

        # Simulate user input: select session 1, change 1, confirm yes
        with patch('src.main.GitHelper.check_git_available', return_value=True), \
             patch('builtins.input', side_effect=['1', '1', 'y']):
            result = cmd_interactive_rollback(args, manager)

        assert result == 0
        captured = capsys.readouterr()
        assert 'Success! Rolled back' in captured.out

    def test_interactive_rollback_cancel(self, capsys):
        """Test cancelling interactive rollback."""
        manager = Mock()

        session = TransactionManifest(
            session_id='test-session',
            started_at='2024-01-01T10:00:00',
            status='in_progress',
            entries=[]
        )
        manager.list_uncommitted_transactions.return_value = [session]

        args = argparse.Namespace(verbose=False)

        # Simulate user input: quit at session selection
        with patch('src.main.GitHelper.check_git_available', return_value=True), \
             patch('builtins.input', return_value='q'):
            result = cmd_interactive_rollback(args, manager)

        assert result == 0
        captured = capsys.readouterr()
        assert 'Cancelled' in captured.out
