"""Tests for AuditSessionState model."""

import uuid
from datetime import UTC, datetime

import pytest

from src.models import AuditSessionState, FileSnapshot


@pytest.fixture
def sample_file_snapshot():
    """Create sample file snapshots for testing."""
    return {
        "src/example.py": FileSnapshot(
            filepath="src/example.py",
            timestamp=1699123456.789,
            checksum="abc123def456",
            size=1024,
        ),
        "src/utils.py": FileSnapshot(
            filepath="src/utils.py",
            timestamp=1699123457.890,
            checksum="def456ghi789",
            size=2048,
        ),
    }


@pytest.fixture
def sample_partial_ratings():
    """Create sample partial ratings for testing."""
    return {
        "src/example.py": {
            "calculate_score": 3,
            "format_output": None,  # Skipped
        },
        "src/utils.py": {
            "parse_data": 4,
        },
    }


@pytest.fixture
def sample_audit_session_state(sample_file_snapshot, sample_partial_ratings):
    """Create sample AuditSessionState for testing."""
    return AuditSessionState(
        session_id=str(uuid.uuid4()),
        started_at=datetime.now(UTC).isoformat(),
        current_index=2,
        total_items=10,
        partial_ratings=sample_partial_ratings,
        file_snapshot=sample_file_snapshot,
        config={"showCodeMode": "truncated", "maxLines": 20},
        completed_at=None,
    )


def test_to_dict(sample_audit_session_state):
    """Test AuditSessionState serialization to dict."""
    result = sample_audit_session_state.to_dict()

    assert result["session_id"] == sample_audit_session_state.session_id
    assert result["started_at"] == sample_audit_session_state.started_at
    assert result["current_index"] == 2
    assert result["total_items"] == 10
    assert result["partial_ratings"] == sample_audit_session_state.partial_ratings
    assert result["config"] == {"showCodeMode": "truncated", "maxLines": 20}
    assert result["completed_at"] is None

    # Verify file_snapshot serialized correctly
    assert "src/example.py" in result["file_snapshot"]
    assert result["file_snapshot"]["src/example.py"]["filepath"] == "src/example.py"
    assert result["file_snapshot"]["src/example.py"]["checksum"] == "abc123def456"


def test_from_dict(sample_file_snapshot, sample_partial_ratings):
    """Test AuditSessionState deserialization from dict."""
    session_id = str(uuid.uuid4())
    started_at = datetime.now(UTC).isoformat()

    data = {
        "session_id": session_id,
        "started_at": started_at,
        "current_index": 5,
        "total_items": 20,
        "partial_ratings": sample_partial_ratings,
        "file_snapshot": {
            filepath: snapshot.to_dict()
            for filepath, snapshot in sample_file_snapshot.items()
        },
        "config": {"showCodeMode": "complete", "maxLines": 50},
        "completed_at": None,
    }

    state = AuditSessionState.from_dict(data)

    assert state.session_id == session_id
    assert state.started_at == started_at
    assert state.current_index == 5
    assert state.total_items == 20
    assert state.partial_ratings == sample_partial_ratings
    assert state.config == {"showCodeMode": "complete", "maxLines": 50}
    assert state.completed_at is None

    # Verify file_snapshot reconstructed correctly as FileSnapshot objects
    assert isinstance(state.file_snapshot["src/example.py"], FileSnapshot)
    assert state.file_snapshot["src/example.py"].filepath == "src/example.py"
    assert state.file_snapshot["src/example.py"].checksum == "abc123def456"


def test_round_trip_serialization(sample_audit_session_state):
    """Test that to_dict followed by from_dict preserves state."""
    # Serialize to dict
    data = sample_audit_session_state.to_dict()

    # Deserialize back to AuditSessionState
    restored_state = AuditSessionState.from_dict(data)

    # Verify all fields match
    assert restored_state.session_id == sample_audit_session_state.session_id
    assert restored_state.started_at == sample_audit_session_state.started_at
    assert restored_state.current_index == sample_audit_session_state.current_index
    assert restored_state.total_items == sample_audit_session_state.total_items
    assert restored_state.partial_ratings == sample_audit_session_state.partial_ratings
    assert restored_state.config == sample_audit_session_state.config
    assert restored_state.completed_at == sample_audit_session_state.completed_at

    # Verify file_snapshot objects restored correctly
    for filepath in sample_audit_session_state.file_snapshot:
        original_snapshot = sample_audit_session_state.file_snapshot[filepath]
        restored_snapshot = restored_state.file_snapshot[filepath]

        assert restored_snapshot.filepath == original_snapshot.filepath
        assert restored_snapshot.timestamp == original_snapshot.timestamp
        assert restored_snapshot.checksum == original_snapshot.checksum
        assert restored_snapshot.size == original_snapshot.size


def test_with_completed_at():
    """Test AuditSessionState with completed_at field set."""
    completed_at = datetime.now(UTC).isoformat()
    state = AuditSessionState(
        session_id=str(uuid.uuid4()),
        started_at=datetime.now(UTC).isoformat(),
        current_index=10,
        total_items=10,
        partial_ratings={},
        file_snapshot={},
        config={},
        completed_at=completed_at,
    )

    # Verify completed_at is preserved in serialization
    data = state.to_dict()
    assert data["completed_at"] == completed_at

    # Verify completed_at is preserved in deserialization
    restored_state = AuditSessionState.from_dict(data)
    assert restored_state.completed_at == completed_at


def test_nested_structures(sample_file_snapshot):
    """Test AuditSessionState with complex nested partial_ratings."""
    # Create deeply nested ratings structure
    partial_ratings = {
        "file1.py": {"func1": 1, "func2": 2, "func3": None},
        "file2.py": {"ClassA.method1": 3, "ClassA.method2": 4},
        "file3.py": {"func_a": None, "func_b": None, "func_c": 2},
    }

    state = AuditSessionState(
        session_id=str(uuid.uuid4()),
        started_at=datetime.now(UTC).isoformat(),
        current_index=5,
        total_items=8,
        partial_ratings=partial_ratings,
        file_snapshot=sample_file_snapshot,
        config={"showCodeMode": "signature", "maxLines": 30},
        completed_at=None,
    )

    # Verify serialization preserves nested structure
    data = state.to_dict()
    assert data["partial_ratings"] == partial_ratings

    # Verify deserialization preserves nested structure
    restored_state = AuditSessionState.from_dict(data)
    assert restored_state.partial_ratings == partial_ratings


def test_create_initial():
    """Test create_initial factory method."""

    # Create mock CodeItem objects
    class MockCodeItem:
        def __init__(self, filepath, name):
            self.filepath = filepath
            self.name = name

    items = [
        MockCodeItem("src/file1.py", "func1"),
        MockCodeItem("src/file1.py", "func2"),
        MockCodeItem("src/file2.py", "ClassA"),
        MockCodeItem("src/file3.py", "parse_data"),
    ]

    file_snapshot = {
        "src/file1.py": FileSnapshot(
            filepath="src/file1.py",
            timestamp=1699123456.0,
            checksum="abc123",
            size=512,
        ),
        "src/file2.py": FileSnapshot(
            filepath="src/file2.py",
            timestamp=1699123457.0,
            checksum="def456",
            size=1024,
        ),
    }

    config = {"showCodeMode": "complete", "maxLines": 50}
    session_id = str(uuid.uuid4())

    # Create initial state
    state = AuditSessionState.create_initial(
        session_id=session_id,
        items=items,
        file_snapshot=file_snapshot,
        config=config,
    )

    # Verify initial state
    assert state.session_id == session_id
    assert state.current_index == 0
    assert state.total_items == 4
    assert state.completed_at is None
    assert state.config == config
    assert state.file_snapshot == file_snapshot

    # Verify partial_ratings initialized with None values
    assert state.partial_ratings["src/file1.py"]["func1"] is None
    assert state.partial_ratings["src/file1.py"]["func2"] is None
    assert state.partial_ratings["src/file2.py"]["ClassA"] is None
    assert state.partial_ratings["src/file3.py"]["parse_data"] is None

    # Verify started_at is a valid ISO 8601 timestamp
    datetime.fromisoformat(state.started_at)  # Should not raise exception
