"""Tests for state directory management."""

import sys
import tempfile
import shutil
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
        expected = temp_dir / '.docimp'
        assert state_dir == expected.resolve()

    def test_get_session_reports_dir_returns_correct_path(self, temp_dir):
        """Test that get_session_reports_dir returns correct path."""
        session_dir = StateManager.get_session_reports_dir(temp_dir)
        expected = temp_dir / '.docimp' / 'session-reports'
        assert session_dir == expected.resolve()

    def test_get_history_dir_returns_correct_path(self, temp_dir):
        """Test that get_history_dir returns correct path."""
        history_dir = StateManager.get_history_dir(temp_dir)
        expected = temp_dir / '.docimp' / 'history'
        assert history_dir == expected.resolve()

    def test_get_audit_file_returns_correct_path(self, temp_dir):
        """Test that get_audit_file returns correct path."""
        audit_file = StateManager.get_audit_file(temp_dir)
        expected = temp_dir / '.docimp' / 'session-reports' / 'audit.json'
        assert audit_file == expected.resolve()

    def test_get_plan_file_returns_correct_path(self, temp_dir):
        """Test that get_plan_file returns correct path."""
        plan_file = StateManager.get_plan_file(temp_dir)
        expected = temp_dir / '.docimp' / 'session-reports' / 'plan.json'
        assert plan_file == expected.resolve()

    def test_get_analyze_file_returns_correct_path(self, temp_dir):
        """Test that get_analyze_file returns correct path."""
        analyze_file = StateManager.get_analyze_file(temp_dir)
        expected = temp_dir / '.docimp' / 'session-reports' / 'analyze-latest.json'
        assert analyze_file == expected.resolve()

    def test_ensure_state_dir_creates_directories(self, temp_dir):
        """Test that ensure_state_dir creates all required directories."""
        StateManager.ensure_state_dir(temp_dir)

        state_dir = temp_dir / '.docimp'
        session_dir = temp_dir / '.docimp' / 'session-reports'
        history_dir = temp_dir / '.docimp' / 'history'

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
        state_dir = temp_dir / '.docimp'
        assert state_dir.exists()

    def test_clear_session_reports_removes_files(self, temp_dir):
        """Test that clear_session_reports removes all files."""
        # Setup: Create state directory with files
        StateManager.ensure_state_dir(temp_dir)
        session_dir = StateManager.get_session_reports_dir(temp_dir)

        # Create some test files
        (session_dir / 'audit.json').write_text('{"test": "data"}')
        (session_dir / 'plan.json').write_text('{"test": "data"}')
        (session_dir / 'analyze-latest.json').write_text('{"test": "data"}')

        # Verify files exist
        assert (session_dir / 'audit.json').exists()
        assert (session_dir / 'plan.json').exists()
        assert (session_dir / 'analyze-latest.json').exists()

        # Clear
        files_removed = StateManager.clear_session_reports(temp_dir)

        # Verify files removed
        assert files_removed == 3
        assert not (session_dir / 'audit.json').exists()
        assert not (session_dir / 'plan.json').exists()
        assert not (session_dir / 'analyze-latest.json').exists()

        # Verify directory still exists
        assert session_dir.exists()

    def test_clear_session_reports_preserves_history(self, temp_dir):
        """Test that clear_session_reports does not touch history directory."""
        # Setup: Create state directory with files in both session and history
        StateManager.ensure_state_dir(temp_dir)
        session_dir = StateManager.get_session_reports_dir(temp_dir)
        history_dir = StateManager.get_history_dir(temp_dir)

        # Create files in session-reports
        (session_dir / 'audit.json').write_text('{"test": "data"}')

        # Create files in history
        (history_dir / 'old-audit.json').write_text('{"test": "old"}')

        # Clear session reports
        StateManager.clear_session_reports(temp_dir)

        # Verify session file removed
        assert not (session_dir / 'audit.json').exists()

        # Verify history file preserved
        assert (history_dir / 'old-audit.json').exists()

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
        assert state_dir.name == '.docimp'
