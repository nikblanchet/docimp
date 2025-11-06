"""Audit session state model for save/resume functionality.

Provides persistence for in-progress audit sessions, allowing users to interrupt
and resume audit workflows without losing progress.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from src.utils.file_tracker import FileSnapshot


@dataclass
class AuditSessionState:
    """State of an in-progress or completed audit session.

    Attributes:
        session_id: Unique identifier for the audit session (UUID string)
        schema_version: Version string for migration support (default '1.0')
        started_at: ISO 8601 timestamp when session began
        current_index: Current position in items array (0-based)
        total_items: Total number of items to audit
        partial_ratings: Nested dict mapping filepath -> item_name -> rating
            where rating is 1-4 (quality score) or None (skipped)
        file_snapshot: Dict mapping filepath -> FileSnapshot for modification detection
        config: Audit configuration dict with showCodeMode and maxLines
        completed_at: ISO 8601 timestamp when session completed, or None if in-progress
    """

    session_id: str
    schema_version: str = '1.0'
    started_at: str = ''
    current_index: int = 0
    total_items: int = 0
    partial_ratings: dict[str, dict[str, int | None]] = None  # type: ignore[assignment]
    file_snapshot: dict[str, FileSnapshot] = None  # type: ignore[assignment]
    config: dict[str, Any] = None  # type: ignore[assignment]
    completed_at: str | None = None

    def __post_init__(self) -> None:
        """Initialize mutable default values."""
        if self.partial_ratings is None:
            self.partial_ratings = {}
        if self.file_snapshot is None:
            self.file_snapshot = {}
        if self.config is None:
            self.config = {}

    def to_dict(self) -> dict[str, Any]:
        """Convert to JSON-serializable dict.

        Returns:
            dict with all session state fields, FileSnapshot objects converted to dicts
        """
        return {
            "session_id": self.session_id,
            "schema_version": self.schema_version,
            "started_at": self.started_at,
            "current_index": self.current_index,
            "total_items": self.total_items,
            "partial_ratings": self.partial_ratings,
            "file_snapshot": {
                filepath: snapshot.to_dict()
                for filepath, snapshot in self.file_snapshot.items()
            },
            "config": self.config,
            "completed_at": self.completed_at,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "AuditSessionState":
        """Create from JSON-deserialized dict.

        Args:
            data: Dictionary with session state fields

        Returns:
            AuditSessionState instance with FileSnapshot objects reconstructed
        """
        file_snapshot = {
            filepath: FileSnapshot.from_dict(snapshot_data)
            for filepath, snapshot_data in data.get("file_snapshot", {}).items()
        }

        return cls(
            session_id=data["session_id"],
            # Default for old sessions without schema_version
            schema_version=data.get("schema_version", "1.0"),
            started_at=data["started_at"],
            current_index=data["current_index"],
            total_items=data["total_items"],
            partial_ratings=data["partial_ratings"],
            file_snapshot=file_snapshot,
            config=data["config"],
            completed_at=data.get("completed_at"),
        )

    @classmethod
    def create_initial(
        cls,
        session_id: str,
        items: list[Any],
        file_snapshot: dict[str, FileSnapshot],
        config: dict[str, Any],
    ) -> "AuditSessionState":
        """Create initial session state at start of audit.

        Args:
            session_id: UUID string for this session
            items: List of CodeItem objects to audit
            file_snapshot: File snapshots for modification detection
            config: Audit configuration (showCodeMode, maxLines)

        Returns:
            New AuditSessionState with empty ratings and current_index=0
        """
        # Initialize empty ratings structure: filepath -> item_name -> None
        partial_ratings: dict[str, dict[str, int | None]] = {}
        for item in items:
            if item.filepath not in partial_ratings:
                partial_ratings[item.filepath] = {}
            partial_ratings[item.filepath][item.name] = None

        return cls(
            session_id=session_id,
            started_at=datetime.now(UTC).isoformat(),
            current_index=0,
            total_items=len(items),
            partial_ratings=partial_ratings,
            file_snapshot=file_snapshot,
            config=config,
            completed_at=None,
        )
