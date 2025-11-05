"""Tests for SessionStateManager utility."""

import json
import uuid
from datetime import UTC, datetime

import pytest

from src.utils.session_state_manager import SessionStateManager
from src.utils.state_manager import StateManager


@pytest.fixture
def temp_state_dir(tmp_path, monkeypatch):
    """Create a temporary state directory for tests."""
    state_dir = tmp_path / ".docimp"
    session_reports_dir = state_dir / "session-reports"
    session_reports_dir.mkdir(parents=True)

    # Monkeypatch StateManager to use temp directory
    monkeypatch.setattr(StateManager, "get_state_dir", lambda: state_dir)
    monkeypatch.setattr(
        StateManager, "get_session_reports_dir", lambda: session_reports_dir
    )
    monkeypatch.setattr(
        StateManager,
        "ensure_state_dir",
        lambda: session_reports_dir.mkdir(parents=True, exist_ok=True),
    )

    return session_reports_dir


def test_save_session_state_audit(temp_state_dir):
    """Test saving audit session state with atomic write."""
    session_id = str(uuid.uuid4())
    state = {
        "session_id": session_id,
        "started_at": datetime.now(UTC).isoformat(),
        "current_index": 5,
        "total_items": 23,
        "partial_ratings": {"file.py": {"func1": 3, "func2": None}},
    }

    result_id = SessionStateManager.save_session_state(state, "audit")

    assert result_id == session_id

    # Verify file was created
    expected_path = temp_state_dir / f"audit-session-{session_id}.json"
    assert expected_path.exists()

    # Verify contents
    with expected_path.open(encoding="utf-8") as f:
        loaded = json.load(f)
        assert loaded == state

    # Verify no temp file left behind
    temp_files = list(temp_state_dir.glob("*.tmp"))
    assert len(temp_files) == 0


def test_save_session_state_improve(temp_state_dir):
    """Test saving improve session state."""
    session_id = str(uuid.uuid4())
    state = {
        "session_id": session_id,
        "transaction_id": str(uuid.uuid4()),
        "started_at": datetime.now(UTC).isoformat(),
        "current_index": 2,
        "plan_items": [{"name": "func1"}, {"name": "func2"}],
        "progress": {"accepted": 1, "skipped": 0, "errors": 0},
    }

    result_id = SessionStateManager.save_session_state(state, "improve")

    assert result_id == session_id

    # Verify file created
    expected_path = temp_state_dir / f"improve-session-{session_id}.json"
    assert expected_path.exists()


def test_save_session_state_invalid_type(temp_state_dir):
    """Test saving session state with invalid session_type raises ValueError."""
    state = {"session_id": str(uuid.uuid4()), "data": "test"}

    with pytest.raises(ValueError, match="Invalid session_type"):
        SessionStateManager.save_session_state(state, "invalid")


def test_save_session_state_missing_id(temp_state_dir):
    """Test saving session state without session_id raises ValueError."""
    state = {"started_at": datetime.now(UTC).isoformat()}

    with pytest.raises(ValueError, match="must include 'session_id'"):
        SessionStateManager.save_session_state(state, "audit")


def test_load_session_state(temp_state_dir):
    """Test loading session state from JSON file."""
    session_id = str(uuid.uuid4())
    state = {
        "session_id": session_id,
        "started_at": datetime.now(UTC).isoformat(),
        "current_index": 10,
    }

    # Save state
    SessionStateManager.save_session_state(state, "audit")

    # Load state
    loaded = SessionStateManager.load_session_state(session_id, "audit")

    assert loaded == state


def test_load_session_state_not_found(temp_state_dir):
    """Test loading non-existent session raises FileNotFoundError."""
    session_id = str(uuid.uuid4())

    with pytest.raises(FileNotFoundError, match="Session file not found"):
        SessionStateManager.load_session_state(session_id, "audit")


def test_load_session_state_corrupted_json(temp_state_dir):
    """Test loading corrupted JSON file raises JSONDecodeError."""
    session_id = str(uuid.uuid4())
    file_path = temp_state_dir / f"audit-session-{session_id}.json"

    # Write invalid JSON
    with file_path.open("w", encoding="utf-8") as f:
        f.write("{ invalid json }")

    with pytest.raises(json.JSONDecodeError):
        SessionStateManager.load_session_state(session_id, "audit")


def test_list_sessions(temp_state_dir):
    """Test listing all sessions sorted by started_at descending."""
    # Create sessions with different timestamps
    sessions = []
    for i in range(3):
        session_id = str(uuid.uuid4())
        state = {
            "session_id": session_id,
            "started_at": f"2025-11-05T{10 + i:02d}:00:00",
            "data": f"session{i}",
        }
        SessionStateManager.save_session_state(state, "audit")
        sessions.append(state)

    # List sessions
    loaded_sessions = SessionStateManager.list_sessions("audit")

    assert len(loaded_sessions) == 3

    # Verify sorted by started_at descending (newest first)
    assert loaded_sessions[0]["started_at"] == "2025-11-05T12:00:00"
    assert loaded_sessions[1]["started_at"] == "2025-11-05T11:00:00"
    assert loaded_sessions[2]["started_at"] == "2025-11-05T10:00:00"


def test_list_sessions_empty(temp_state_dir):
    """Test listing sessions when no sessions exist returns empty list."""
    sessions = SessionStateManager.list_sessions("audit")
    assert sessions == []


def test_delete_session_state(temp_state_dir):
    """Test deleting session state file."""
    session_id = str(uuid.uuid4())
    state = {"session_id": session_id, "data": "test"}

    # Save state
    SessionStateManager.save_session_state(state, "audit")
    file_path = temp_state_dir / f"audit-session-{session_id}.json"
    assert file_path.exists()

    # Delete state
    SessionStateManager.delete_session_state(session_id, "audit")

    # Verify file deleted
    assert not file_path.exists()


def test_delete_session_state_not_found(temp_state_dir):
    """Test deleting non-existent session (idempotent, no error)."""
    session_id = str(uuid.uuid4())

    # Should not raise error
    SessionStateManager.delete_session_state(session_id, "audit")


def test_get_latest_session(temp_state_dir):
    """Test getting the most recent session."""
    # Create sessions with different timestamps
    session1_id = str(uuid.uuid4())
    state1 = {
        "session_id": session1_id,
        "started_at": "2025-11-05T10:00:00",
        "data": "old",
    }
    SessionStateManager.save_session_state(state1, "audit")

    session2_id = str(uuid.uuid4())
    state2 = {
        "session_id": session2_id,
        "started_at": "2025-11-05T12:00:00",
        "data": "new",
    }
    SessionStateManager.save_session_state(state2, "audit")

    # Get latest
    latest = SessionStateManager.get_latest_session("audit")

    assert latest is not None
    assert latest["session_id"] == session2_id
    assert latest["data"] == "new"


def test_get_latest_session_empty(temp_state_dir):
    """Test getting latest session when no sessions exist returns None."""
    latest = SessionStateManager.get_latest_session("audit")
    assert latest is None
