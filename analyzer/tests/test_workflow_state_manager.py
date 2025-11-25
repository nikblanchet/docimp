"""
Unit tests for WorkflowStateManager.

Tests atomic read/write operations, state updates, and error handling.
"""

import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.models.workflow_state import CommandState, WorkflowState
from src.utils.workflow_state_manager import WorkflowStateManager


@pytest.fixture
def mock_state_dir(tmp_path):
    """Create a temporary state directory for testing."""
    state_dir = tmp_path / ".docimp"
    state_dir.mkdir()
    return state_dir


@pytest.fixture
def sample_command_state():
    """Create a sample command state for testing."""
    return CommandState(
        timestamp="2025-01-01T00:00:00Z",
        item_count=10,
        file_checksums={"file.py": "abc123", "file2.py": "def456"},
    )


@pytest.fixture
def sample_workflow_state(sample_command_state):
    """Create a sample workflow state for testing."""
    return WorkflowState(
        schema_version="1.0",
        last_analyze=sample_command_state,
        last_audit=None,
        last_plan=None,
        last_improve=None,
    )


class TestWorkflowStateManager:
    """Test suite for WorkflowStateManager."""

    def test_save_workflow_state_atomic_write(
        self, mock_state_dir, sample_workflow_state
    ):
        """Test that save uses atomic write pattern (temp + rename)."""
        with (
            patch(
                "src.utils.workflow_state_manager.StateManager.get_state_dir",
                return_value=mock_state_dir,
            ),
            patch("src.utils.workflow_state_manager.StateManager.ensure_state_dir"),
        ):
            WorkflowStateManager.save_workflow_state(sample_workflow_state)

            # Check that final file exists
            workflow_file = mock_state_dir / "workflow-state.json"
            assert workflow_file.exists()

            # Temp file should not exist after atomic rename
            temp_file = mock_state_dir / "workflow-state.json.tmp"
            assert not temp_file.exists()

    def test_save_workflow_state_creates_directory(
        self, mock_state_dir, sample_workflow_state
    ):
        """Test that save ensures state directory exists."""
        with (
            patch(
                "src.utils.workflow_state_manager.StateManager.get_state_dir",
                return_value=mock_state_dir,
            ),
            patch(
                "src.utils.workflow_state_manager.StateManager.ensure_state_dir"
            ) as mock_ensure,
        ):
            WorkflowStateManager.save_workflow_state(sample_workflow_state)
            mock_ensure.assert_called_once()

    def test_save_workflow_state_serializes_correctly(
        self, mock_state_dir, sample_workflow_state
    ):
        """Test that state is serialized to JSON with proper formatting."""
        with (
            patch(
                "src.utils.workflow_state_manager.StateManager.get_state_dir",
                return_value=mock_state_dir,
            ),
            patch("src.utils.workflow_state_manager.StateManager.ensure_state_dir"),
        ):
            WorkflowStateManager.save_workflow_state(sample_workflow_state)

            workflow_file = mock_state_dir / "workflow-state.json"
            with workflow_file.open(encoding="utf-8") as f:
                data = json.load(f)

            assert data["schema_version"] == "1.0"
            assert data["last_analyze"] is not None
            assert data["last_audit"] is None
            assert data["last_plan"] is None
            assert data["last_improve"] is None
            assert data["last_analyze"]["item_count"] == 10

    def test_load_workflow_state_from_file(self, mock_state_dir, sample_workflow_state):
        """Test loading workflow state from existing file."""
        with (
            patch(
                "src.utils.workflow_state_manager.StateManager.get_state_dir",
                return_value=mock_state_dir,
            ),
            patch("src.utils.workflow_state_manager.StateManager.ensure_state_dir"),
        ):
            # Save first
            WorkflowStateManager.save_workflow_state(sample_workflow_state)

            # Then load
            loaded = WorkflowStateManager.load_workflow_state()

            assert loaded.schema_version == "1.0"
            assert loaded.last_analyze is not None
            assert loaded.last_analyze.item_count == 10
            assert loaded.last_analyze.file_checksums == {
                "file.py": "abc123",
                "file2.py": "def456",
            }

    def test_load_workflow_state_returns_empty_if_not_exists(self, mock_state_dir):
        """Test that load returns empty state if file doesn't exist."""
        with patch(
            "src.utils.workflow_state_manager.StateManager.get_state_dir",
            return_value=mock_state_dir,
        ):
            loaded = WorkflowStateManager.load_workflow_state()

            assert loaded.schema_version == "1.0"
            assert loaded.last_analyze is None
            assert loaded.last_audit is None
            assert loaded.last_plan is None
            assert loaded.last_improve is None

    def test_load_workflow_state_invalid_json(self, mock_state_dir):
        """Test that load raises error for malformed JSON."""
        workflow_file = mock_state_dir / "workflow-state.json"
        workflow_file.write_text("{ invalid json", encoding="utf-8")

        with (
            patch(
                "src.utils.workflow_state_manager.StateManager.get_state_dir",
                return_value=mock_state_dir,
            ),
            pytest.raises(ValueError, match="Failed to load workflow state"),
        ):
            WorkflowStateManager.load_workflow_state()

    def test_load_workflow_state_invalid_schema_version(self, mock_state_dir):
        """Test that load raises error for unsupported schema version."""
        invalid_state = {"schema_version": "2.0", "last_analyze": None}
        workflow_file = mock_state_dir / "workflow-state.json"
        workflow_file.write_text(json.dumps(invalid_state), encoding="utf-8")

        with (
            patch(
                "src.utils.workflow_state_manager.StateManager.get_state_dir",
                return_value=mock_state_dir,
            ),
            pytest.raises(ValueError, match="Unknown source version"),
        ):
            WorkflowStateManager.load_workflow_state()

    def test_update_command_state_analyze(self, mock_state_dir, sample_command_state):
        """Test updating analyze command state."""
        with (
            patch(
                "src.utils.workflow_state_manager.StateManager.get_state_dir",
                return_value=mock_state_dir,
            ),
            patch("src.utils.workflow_state_manager.StateManager.ensure_state_dir"),
        ):
            WorkflowStateManager.update_command_state("analyze", sample_command_state)

            loaded = WorkflowStateManager.load_workflow_state()
            assert loaded.last_analyze is not None
            assert loaded.last_analyze.item_count == 10

    def test_update_command_state_audit(self, mock_state_dir, sample_command_state):
        """Test updating audit command state."""
        with (
            patch(
                "src.utils.workflow_state_manager.StateManager.get_state_dir",
                return_value=mock_state_dir,
            ),
            patch("src.utils.workflow_state_manager.StateManager.ensure_state_dir"),
        ):
            WorkflowStateManager.update_command_state("audit", sample_command_state)

            loaded = WorkflowStateManager.load_workflow_state()
            assert loaded.last_audit is not None
            assert loaded.last_audit.item_count == 10

    def test_update_command_state_plan(self, mock_state_dir, sample_command_state):
        """Test updating plan command state."""
        with (
            patch(
                "src.utils.workflow_state_manager.StateManager.get_state_dir",
                return_value=mock_state_dir,
            ),
            patch("src.utils.workflow_state_manager.StateManager.ensure_state_dir"),
        ):
            WorkflowStateManager.update_command_state("plan", sample_command_state)

            loaded = WorkflowStateManager.load_workflow_state()
            assert loaded.last_plan is not None
            assert loaded.last_plan.item_count == 10

    def test_update_command_state_improve(self, mock_state_dir, sample_command_state):
        """Test updating improve command state."""
        with (
            patch(
                "src.utils.workflow_state_manager.StateManager.get_state_dir",
                return_value=mock_state_dir,
            ),
            patch("src.utils.workflow_state_manager.StateManager.ensure_state_dir"),
        ):
            WorkflowStateManager.update_command_state("improve", sample_command_state)

            loaded = WorkflowStateManager.load_workflow_state()
            assert loaded.last_improve is not None
            assert loaded.last_improve.item_count == 10

    def test_update_command_state_preserves_others(
        self, mock_state_dir, sample_command_state
    ):
        """Test that updating one command preserves other command states."""
        with (
            patch(
                "src.utils.workflow_state_manager.StateManager.get_state_dir",
                return_value=mock_state_dir,
            ),
            patch("src.utils.workflow_state_manager.StateManager.ensure_state_dir"),
        ):
            # Set analyze and audit states
            analyze_state = CommandState.create(10, {"a.py": "xxx"})
            audit_state = CommandState.create(8, {"b.py": "yyy"})

            WorkflowStateManager.update_command_state("analyze", analyze_state)
            WorkflowStateManager.update_command_state("audit", audit_state)

            # Update plan state
            plan_state = CommandState.create(5, {"c.py": "zzz"})
            WorkflowStateManager.update_command_state("plan", plan_state)

            # All states should be preserved
            loaded = WorkflowStateManager.load_workflow_state()
            assert loaded.last_analyze.item_count == 10
            assert loaded.last_audit.item_count == 8
            assert loaded.last_plan.item_count == 5
            assert loaded.last_improve is None

    def test_update_command_state_invalid_command(self, sample_command_state):
        """Test that invalid command name raises ValueError."""
        with pytest.raises(ValueError, match="Invalid command"):
            WorkflowStateManager.update_command_state("invalid", sample_command_state)

    def test_get_command_state_analyze(self, mock_state_dir, sample_command_state):
        """Test getting analyze command state."""
        with (
            patch(
                "src.utils.workflow_state_manager.StateManager.get_state_dir",
                return_value=mock_state_dir,
            ),
            patch("src.utils.workflow_state_manager.StateManager.ensure_state_dir"),
        ):
            WorkflowStateManager.update_command_state("analyze", sample_command_state)

            result = WorkflowStateManager.get_command_state("analyze")
            assert result is not None
            assert result.item_count == 10

    def test_get_command_state_returns_none_if_not_set(self, mock_state_dir):
        """Test that get returns None if command state not set."""
        with patch(
            "src.utils.workflow_state_manager.StateManager.get_state_dir",
            return_value=mock_state_dir,
        ):
            result = WorkflowStateManager.get_command_state("audit")
            assert result is None

    def test_get_command_state_invalid_command(self):
        """Test that invalid command name raises ValueError."""
        with pytest.raises(ValueError, match="Invalid command"):
            WorkflowStateManager.get_command_state("invalid")

    def test_clear_workflow_state(self, mock_state_dir, sample_workflow_state):
        """Test clearing workflow state file."""
        with (
            patch(
                "src.utils.workflow_state_manager.StateManager.get_state_dir",
                return_value=mock_state_dir,
            ),
            patch("src.utils.workflow_state_manager.StateManager.ensure_state_dir"),
        ):
            # Save state first
            WorkflowStateManager.save_workflow_state(sample_workflow_state)
            assert WorkflowStateManager.exists()

            # Clear state
            WorkflowStateManager.clear_workflow_state()
            assert not WorkflowStateManager.exists()

    def test_clear_workflow_state_no_error_if_not_exists(self, mock_state_dir):
        """Test that clear doesn't error if file doesn't exist."""
        with patch(
            "src.utils.workflow_state_manager.StateManager.get_state_dir",
            return_value=mock_state_dir,
        ):
            # Should not raise error
            WorkflowStateManager.clear_workflow_state()
            assert not WorkflowStateManager.exists()

    def test_exists_returns_true_if_file_exists(
        self, mock_state_dir, sample_workflow_state
    ):
        """Test that exists returns True if workflow state file exists."""
        with (
            patch(
                "src.utils.workflow_state_manager.StateManager.get_state_dir",
                return_value=mock_state_dir,
            ),
            patch("src.utils.workflow_state_manager.StateManager.ensure_state_dir"),
        ):
            WorkflowStateManager.save_workflow_state(sample_workflow_state)
            assert WorkflowStateManager.exists()

    def test_exists_returns_false_if_file_not_exists(self, mock_state_dir):
        """Test that exists returns False if workflow state file doesn't exist."""
        with patch(
            "src.utils.workflow_state_manager.StateManager.get_state_dir",
            return_value=mock_state_dir,
        ):
            assert not WorkflowStateManager.exists()


class TestCommandState:
    """Test suite for CommandState model."""

    def test_create_command_state_with_current_timestamp(self):
        """Test that create sets current timestamp in ISO format."""
        state = CommandState.create(10, {"file.py": "abc"})

        assert state.item_count == 10
        assert state.file_checksums == {"file.py": "abc"}
        assert "T" in state.timestamp
        assert state.timestamp.endswith("Z")

    def test_command_state_to_dict(self):
        """Test CommandState serialization to dictionary."""
        state = CommandState(
            timestamp="2025-01-01T00:00:00Z",
            item_count=5,
            file_checksums={"a.py": "xxx"},
        )

        data = state.to_dict()

        assert data == {
            "timestamp": "2025-01-01T00:00:00Z",
            "item_count": 5,
            "file_checksums": {"a.py": "xxx"},
        }

    def test_command_state_from_dict(self):
        """Test CommandState deserialization from dictionary."""
        data = {
            "timestamp": "2025-01-01T00:00:00Z",
            "item_count": 5,
            "file_checksums": {"a.py": "xxx"},
        }

        state = CommandState.from_dict(data)

        assert state.timestamp == "2025-01-01T00:00:00Z"
        assert state.item_count == 5
        assert state.file_checksums == {"a.py": "xxx"}


class TestWorkflowState:
    """Test suite for WorkflowState model."""

    def test_create_empty_workflow_state(self):
        """Test creating empty workflow state."""
        state = WorkflowState.create_empty()

        assert state.schema_version == "1.0"
        assert state.last_analyze is None
        assert state.last_audit is None
        assert state.last_plan is None
        assert state.last_improve is None

    def test_workflow_state_to_dict(self):
        """Test WorkflowState serialization to dictionary."""
        command_state = CommandState(
            timestamp="2025-01-01T00:00:00Z",
            item_count=10,
            file_checksums={"file.py": "abc"},
        )

        state = WorkflowState(
            schema_version="1.0",
            last_analyze=command_state,
            last_audit=None,
            last_plan=None,
            last_improve=None,
        )

        data = state.to_dict()

        assert data["schema_version"] == "1.0"
        assert data["last_analyze"] is not None
        assert data["last_analyze"]["item_count"] == 10
        assert data["last_audit"] is None

    def test_workflow_state_from_dict(self):
        """Test WorkflowState deserialization from dictionary."""
        data = {
            "schema_version": "1.0",
            "last_analyze": {
                "timestamp": "2025-01-01T00:00:00Z",
                "item_count": 10,
                "file_checksums": {"file.py": "abc"},
            },
            "last_audit": None,
            "last_plan": None,
            "last_improve": None,
        }

        state = WorkflowState.from_dict(data)

        assert state.schema_version == "1.0"
        assert state.last_analyze is not None
        assert state.last_analyze.item_count == 10
        assert state.last_audit is None


class TestWorkflowHistoryMethods:
    """Tests for workflow history snapshot methods."""

    def test_save_history_snapshot(self, tmp_path):
        """Test saving timestamped history snapshot."""
        # Setup test history directory
        history_dir = tmp_path / ".docimp" / "history"
        history_dir.mkdir(parents=True)

        # Mock StateManager to return our test directory
        with patch(
            "src.utils.workflow_state_manager.StateManager.get_history_dir"
        ) as mock_history_dir:
            mock_history_dir.return_value = history_dir

            # Create a workflow state
            state = WorkflowState.create_empty()

            # Save snapshot
            snapshot_path = WorkflowStateManager.save_history_snapshot(state)

            # Verify snapshot was created
            assert snapshot_path.exists()
            assert snapshot_path.parent == history_dir

            # Verify filename format (cross-platform safe)
            filename = snapshot_path.name
            assert filename.startswith("workflow-state-")
            assert filename.endswith(".json")
            # Should not contain : or . except before extension
            assert ":" not in filename
            assert filename.count(".") == 1  # Only .json extension

    def test_save_history_snapshot_content(self, tmp_path):
        """Test snapshot content matches workflow state."""
        history_dir = tmp_path / ".docimp" / "history"
        history_dir.mkdir(parents=True)

        with patch(
            "src.utils.workflow_state_manager.StateManager.get_history_dir"
        ) as mock_history_dir:
            mock_history_dir.return_value = history_dir

            # Create state with data
            command_state = CommandState(
                timestamp="2025-01-01T00:00:00Z",
                item_count=10,
                file_checksums={"file.py": "abc123"},
            )
            state = WorkflowState(
                schema_version="1.0",
                last_analyze=command_state,
                last_audit=None,
                last_plan=None,
                last_improve=None,
            )

            snapshot_path = WorkflowStateManager.save_history_snapshot(state)

            # Load and verify content
            with snapshot_path.open() as f:
                data = json.load(f)

            assert data["schema_version"] == "1.0"
            assert data["last_analyze"]["item_count"] == 10
            assert data["last_analyze"]["file_checksums"] == {"file.py": "abc123"}

    def test_list_history_snapshots(self, tmp_path):
        """Test listing history snapshots sorted newest first."""
        history_dir = tmp_path / ".docimp" / "history"
        history_dir.mkdir(parents=True)

        # Create test snapshots (out of order)
        snapshot1 = history_dir / "workflow-state-2025-01-01T10-00-00-000Z.json"
        snapshot2 = history_dir / "workflow-state-2025-01-03T10-00-00-000Z.json"
        snapshot3 = history_dir / "workflow-state-2025-01-02T10-00-00-000Z.json"
        other_file = history_dir / "audit.json"

        for f in [snapshot1, snapshot2, snapshot3, other_file]:
            f.write_text("{}")

        with patch(
            "src.utils.workflow_state_manager.StateManager.get_history_dir"
        ) as mock_history_dir:
            mock_history_dir.return_value = history_dir

            snapshots = WorkflowStateManager.list_history_snapshots()

            # Should return 3 snapshots (not other_file)
            assert len(snapshots) == 3

            # Should be sorted newest first
            assert "2025-01-03" in str(snapshots[0])  # Newest
            assert "2025-01-02" in str(snapshots[1])
            assert "2025-01-01" in str(snapshots[2])  # Oldest

    def test_list_history_snapshots_empty_directory(self, tmp_path):
        """Test listing snapshots from empty directory."""
        history_dir = tmp_path / ".docimp" / "history"
        history_dir.mkdir(parents=True)

        with patch(
            "src.utils.workflow_state_manager.StateManager.get_history_dir"
        ) as mock_history_dir:
            mock_history_dir.return_value = history_dir

            snapshots = WorkflowStateManager.list_history_snapshots()
            assert snapshots == []

    def test_list_history_snapshots_missing_directory(self, tmp_path):
        """Test listing snapshots when directory doesn't exist."""
        history_dir = tmp_path / ".docimp" / "history"  # Not created

        with patch(
            "src.utils.workflow_state_manager.StateManager.get_history_dir"
        ) as mock_history_dir:
            mock_history_dir.return_value = history_dir

            snapshots = WorkflowStateManager.list_history_snapshots()
            assert snapshots == []

    def test_rotate_history_count_limit(self, tmp_path):
        """Test rotation with count limit exceeded."""
        history_dir = tmp_path / ".docimp" / "history"
        history_dir.mkdir(parents=True)

        # Create 55 snapshots (exceeds default 50 limit)
        for i in range(55):
            snapshot = (
                history_dir / f"workflow-state-2025-01-01T{i:02d}-00-00-000Z.json"
            )
            snapshot.write_text("{}")

        with patch(
            "src.utils.workflow_state_manager.StateManager.get_history_dir"
        ) as mock_history_dir:
            mock_history_dir.return_value = history_dir

            WorkflowStateManager.rotate_history(max_snapshots=50, max_age_days=30)

            # Should have 50 files remaining
            remaining = list(history_dir.glob("workflow-state-*.json"))
            assert len(remaining) == 50

    def test_rotate_history_age_limit(self, tmp_path):
        """Test rotation with age limit exceeded."""
        import time

        history_dir = tmp_path / ".docimp" / "history"
        history_dir.mkdir(parents=True)

        # Create 2 snapshots
        new_snapshot = history_dir / "workflow-state-2025-01-02T00-00-00-000Z.json"
        old_snapshot = history_dir / "workflow-state-2025-01-01T00-00-00-000Z.json"

        new_snapshot.write_text("{}")
        old_snapshot.write_text("{}")

        # Make old_snapshot appear 40 days old
        now = time.time()
        old_time = now - (40 * 24 * 60 * 60)  # 40 days ago
        import os

        os.utime(old_snapshot, (old_time, old_time))

        with patch(
            "src.utils.workflow_state_manager.StateManager.get_history_dir"
        ) as mock_history_dir:
            mock_history_dir.return_value = history_dir

            WorkflowStateManager.rotate_history(max_snapshots=50, max_age_days=30)

            # Old snapshot should be deleted
            assert new_snapshot.exists()
            assert not old_snapshot.exists()

    def test_rotate_history_hybrid_strategy(self, tmp_path):
        """Test hybrid rotation (OR logic: count OR age)."""
        import time

        history_dir = tmp_path / ".docimp" / "history"
        history_dir.mkdir(parents=True)

        # Create 2 snapshots, both within count limit
        new_snapshot = history_dir / "workflow-state-2025-01-02T00-00-00-000Z.json"
        old_snapshot = history_dir / "workflow-state-2025-01-01T00-00-00-000Z.json"

        new_snapshot.write_text("{}")
        old_snapshot.write_text("{}")

        # Make old_snapshot 40 days old (violates time limit)
        now = time.time()
        old_time = now - (40 * 24 * 60 * 60)
        import os

        os.utime(old_snapshot, (old_time, old_time))

        with patch(
            "src.utils.workflow_state_manager.StateManager.get_history_dir"
        ) as mock_history_dir:
            mock_history_dir.return_value = history_dir

            # Count limit not exceeded (2 < 50), but age limit exceeded for one file
            WorkflowStateManager.rotate_history(max_snapshots=50, max_age_days=30)

            # Old file should be deleted even though count is fine
            assert new_snapshot.exists()
            assert not old_snapshot.exists()

    def test_rotate_history_empty_directory(self, tmp_path):
        """Test rotation with no snapshots."""
        history_dir = tmp_path / ".docimp" / "history"
        history_dir.mkdir(parents=True)

        with patch(
            "src.utils.workflow_state_manager.StateManager.get_history_dir"
        ) as mock_history_dir:
            mock_history_dir.return_value = history_dir

            # Should not raise error
            WorkflowStateManager.rotate_history(max_snapshots=50, max_age_days=30)

    def test_rotate_history_custom_limits(self, tmp_path):
        """Test rotation with custom limits."""
        history_dir = tmp_path / ".docimp" / "history"
        history_dir.mkdir(parents=True)

        # Create 15 snapshots
        for i in range(15):
            snapshot = (
                history_dir / f"workflow-state-2025-01-{i + 1:02d}T00-00-00-000Z.json"
            )
            snapshot.write_text("{}")

        with patch(
            "src.utils.workflow_state_manager.StateManager.get_history_dir"
        ) as mock_history_dir:
            mock_history_dir.return_value = history_dir

            # Keep only last 10
            WorkflowStateManager.rotate_history(max_snapshots=10, max_age_days=30)

            remaining = list(history_dir.glob("workflow-state-*.json"))
            assert len(remaining) == 10
