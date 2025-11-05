"""Tests for ImproveSessionState model."""

import uuid
from datetime import UTC, datetime

import pytest

from src.models import FileSnapshot, ImproveSessionState


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
def sample_partial_improvements():
    """Create sample partial improvements for testing."""
    return {
        "src/example.py": {
            "calculate_score": {
                "status": "accepted",
                "timestamp": "2024-11-05T10:30:00.123456+00:00",
                "suggestion": "Calculate priority score based on complexity",
            },
            "format_output": {
                "status": "skipped",
                "timestamp": "2024-11-05T10:31:00.123456+00:00",
            },
        },
        "src/utils.py": {
            "parse_data": {
                "status": "error",
                "timestamp": "2024-11-05T10:32:00.123456+00:00",
            },
        },
    }


@pytest.fixture
def sample_improve_session_state(sample_file_snapshot, sample_partial_improvements):
    """Create sample ImproveSessionState for testing."""
    return ImproveSessionState(
        session_id=str(uuid.uuid4()),
        transaction_id=str(uuid.uuid4()),
        started_at=datetime.now(UTC).isoformat(),
        current_index=2,
        total_items=10,
        partial_improvements=sample_partial_improvements,
        file_snapshot=sample_file_snapshot,
        config={"styleGuides": {"python": "google"}, "tone": "concise"},
        completed_at=None,
    )


def test_to_dict(sample_improve_session_state):
    """Test ImproveSessionState serialization to dict."""
    result = sample_improve_session_state.to_dict()

    assert result["session_id"] == sample_improve_session_state.session_id
    assert result["transaction_id"] == sample_improve_session_state.transaction_id
    assert result["started_at"] == sample_improve_session_state.started_at
    assert result["current_index"] == 2
    assert result["total_items"] == 10
    assert (
        result["partial_improvements"]
        == sample_improve_session_state.partial_improvements
    )
    assert result["config"] == {"styleGuides": {"python": "google"}, "tone": "concise"}
    assert result["completed_at"] is None

    # Verify file_snapshot serialized correctly
    assert "src/example.py" in result["file_snapshot"]
    assert result["file_snapshot"]["src/example.py"]["filepath"] == "src/example.py"
    assert result["file_snapshot"]["src/example.py"]["checksum"] == "abc123def456"


def test_from_dict(sample_file_snapshot, sample_partial_improvements):
    """Test ImproveSessionState deserialization from dict."""
    session_id = str(uuid.uuid4())
    transaction_id = str(uuid.uuid4())
    started_at = datetime.now(UTC).isoformat()

    data = {
        "session_id": session_id,
        "transaction_id": transaction_id,
        "started_at": started_at,
        "current_index": 5,
        "total_items": 20,
        "partial_improvements": sample_partial_improvements,
        "file_snapshot": {
            filepath: snapshot.to_dict()
            for filepath, snapshot in sample_file_snapshot.items()
        },
        "config": {
            "styleGuides": {"python": "google", "typescript": "tsdoc-typedoc"},
            "tone": "detailed",
        },
        "completed_at": None,
    }

    state = ImproveSessionState.from_dict(data)

    assert state.session_id == session_id
    assert state.transaction_id == transaction_id
    assert state.started_at == started_at
    assert state.current_index == 5
    assert state.total_items == 20
    assert state.partial_improvements == sample_partial_improvements
    assert state.config == {
        "styleGuides": {"python": "google", "typescript": "tsdoc-typedoc"},
        "tone": "detailed",
    }
    assert state.completed_at is None

    # Verify file_snapshot reconstructed correctly as FileSnapshot objects
    assert isinstance(state.file_snapshot["src/example.py"], FileSnapshot)
    assert state.file_snapshot["src/example.py"].filepath == "src/example.py"
    assert state.file_snapshot["src/example.py"].checksum == "abc123def456"


def test_round_trip_serialization(sample_improve_session_state):
    """Test that to_dict followed by from_dict preserves state."""
    # Serialize to dict
    data = sample_improve_session_state.to_dict()

    # Deserialize back to ImproveSessionState
    restored_state = ImproveSessionState.from_dict(data)

    # Verify all fields match
    assert restored_state.session_id == sample_improve_session_state.session_id
    assert restored_state.transaction_id == sample_improve_session_state.transaction_id
    assert restored_state.started_at == sample_improve_session_state.started_at
    assert restored_state.current_index == sample_improve_session_state.current_index
    assert restored_state.total_items == sample_improve_session_state.total_items
    assert (
        restored_state.partial_improvements
        == sample_improve_session_state.partial_improvements
    )
    assert restored_state.config == sample_improve_session_state.config
    assert restored_state.completed_at == sample_improve_session_state.completed_at

    # Verify file_snapshot objects restored correctly
    for filepath in sample_improve_session_state.file_snapshot:
        original_snapshot = sample_improve_session_state.file_snapshot[filepath]
        restored_snapshot = restored_state.file_snapshot[filepath]

        assert restored_snapshot.filepath == original_snapshot.filepath
        assert restored_snapshot.timestamp == original_snapshot.timestamp
        assert restored_snapshot.checksum == original_snapshot.checksum
        assert restored_snapshot.size == original_snapshot.size


def test_with_completed_at():
    """Test ImproveSessionState with completed_at field set."""
    completed_at = datetime.now(UTC).isoformat()
    state = ImproveSessionState(
        session_id=str(uuid.uuid4()),
        transaction_id=str(uuid.uuid4()),
        started_at=datetime.now(UTC).isoformat(),
        current_index=10,
        total_items=10,
        partial_improvements={},
        file_snapshot={},
        config={},
        completed_at=completed_at,
    )

    # Verify completed_at is preserved in serialization
    data = state.to_dict()
    assert data["completed_at"] == completed_at

    # Verify completed_at is preserved in deserialization
    restored_state = ImproveSessionState.from_dict(data)
    assert restored_state.completed_at == completed_at


def test_nested_structures(sample_file_snapshot):
    """Test ImproveSessionState with complex nested partial_improvements."""
    # Create deeply nested improvements structure with status records
    partial_improvements = {
        "file1.py": {
            "func1": {"status": "accepted", "timestamp": "2024-11-05T10:00:00+00:00"},
            "func2": {
                "status": "accepted",
                "timestamp": "2024-11-05T10:01:00+00:00",
                "suggestion": "Parse input data and validate schema",
            },
            "func3": {"status": "skipped", "timestamp": "2024-11-05T10:02:00+00:00"},
        },
        "file2.py": {
            "ClassA.method1": {
                "status": "accepted",
                "timestamp": "2024-11-05T10:03:00+00:00",
            },
            "ClassA.method2": {
                "status": "error",
                "timestamp": "2024-11-05T10:04:00+00:00",
            },
        },
        "file3.py": {
            "func_a": {"status": "skipped", "timestamp": "2024-11-05T10:05:00+00:00"},
            "func_b": {"status": "skipped", "timestamp": "2024-11-05T10:06:00+00:00"},
            "func_c": {
                "status": "accepted",
                "timestamp": "2024-11-05T10:07:00+00:00",
                "suggestion": "Process data efficiently",
            },
        },
    }

    state = ImproveSessionState(
        session_id=str(uuid.uuid4()),
        transaction_id=str(uuid.uuid4()),
        started_at=datetime.now(UTC).isoformat(),
        current_index=5,
        total_items=8,
        partial_improvements=partial_improvements,
        file_snapshot=sample_file_snapshot,
        config={
            "styleGuides": {"python": "google", "javascript": "jsdoc-vanilla"},
            "tone": "friendly",
        },
        completed_at=None,
    )

    # Verify serialization preserves nested structure
    data = state.to_dict()
    assert data["partial_improvements"] == partial_improvements

    # Verify deserialization preserves nested structure
    restored_state = ImproveSessionState.from_dict(data)
    assert restored_state.partial_improvements == partial_improvements


def test_create_initial():
    """Test create_initial factory method."""

    # Create mock PlanItem objects
    class MockPlanItem:
        def __init__(self, filepath, name):
            self.filepath = filepath
            self.name = name

    items = [
        MockPlanItem("src/file1.py", "func1"),
        MockPlanItem("src/file1.py", "func2"),
        MockPlanItem("src/file2.py", "ClassA"),
        MockPlanItem("src/file3.py", "parse_data"),
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

    config = {
        "styleGuides": {"python": "google", "typescript": "tsdoc-typedoc"},
        "tone": "concise",
    }
    session_id = str(uuid.uuid4())
    transaction_id = str(uuid.uuid4())

    # Create initial state
    state = ImproveSessionState.create_initial(
        session_id=session_id,
        transaction_id=transaction_id,
        items=items,
        file_snapshot=file_snapshot,
        config=config,
    )

    # Verify initial state
    assert state.session_id == session_id
    assert state.transaction_id == transaction_id
    assert state.current_index == 0
    assert state.total_items == 4
    assert state.completed_at is None
    assert state.config == config
    assert state.file_snapshot == file_snapshot

    # Verify partial_improvements initialized with empty dict values
    # (will be populated with status records when user accepts/skips)
    assert state.partial_improvements["src/file1.py"]["func1"] == {}
    assert state.partial_improvements["src/file1.py"]["func2"] == {}
    assert state.partial_improvements["src/file2.py"]["ClassA"] == {}
    assert state.partial_improvements["src/file3.py"]["parse_data"] == {}

    # Verify started_at is a valid ISO 8601 timestamp
    datetime.fromisoformat(state.started_at)  # Should not raise exception
