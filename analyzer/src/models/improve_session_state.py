"""Improve session state model for save/resume functionality.

Provides persistence for in-progress improve sessions, allowing users to interrupt
and resume documentation improvement workflows without losing progress.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from src.utils.file_tracker import FileSnapshot


@dataclass
class ImproveSessionState:
    """State of an in-progress or completed improve session.

    Attributes:
        session_id: Unique identifier for the improve session (UUID string)
        transaction_id: Git transaction ID linking to side-car repository branch
        started_at: ISO 8601 timestamp when session began
        current_index: Current position in plan_items array (0-based)
        total_items: Total number of items to improve
        partial_improvements: Nested dict mapping filepath -> item_name -> status record
            where status record is a dict with:
            - status: 'accepted' | 'skipped' | 'error'
            - timestamp: ISO 8601 timestamp when action occurred
            - suggestion: Optional suggestion text (for accepted items)
        file_snapshot: Dict mapping filepath -> FileSnapshot for modification detection
        config: Improve configuration dict with styleGuides and tone
        completed_at: ISO 8601 timestamp when session completed, or None if in-progress
    """

    session_id: str
    transaction_id: str
    started_at: str
    current_index: int
    total_items: int
    partial_improvements: dict[str, dict[str, dict[str, Any]]]
    file_snapshot: dict[str, FileSnapshot]
    config: dict[str, Any]
    completed_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to JSON-serializable dict.

        Returns:
            dict with all session state fields, FileSnapshot objects converted to dicts
        """
        return {
            "session_id": self.session_id,
            "transaction_id": self.transaction_id,
            "started_at": self.started_at,
            "current_index": self.current_index,
            "total_items": self.total_items,
            "partial_improvements": self.partial_improvements,
            "file_snapshot": {
                filepath: snapshot.to_dict()
                for filepath, snapshot in self.file_snapshot.items()
            },
            "config": self.config,
            "completed_at": self.completed_at,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ImproveSessionState":
        """Create from JSON-deserialized dict.

        Args:
            data: Dictionary with session state fields

        Returns:
            ImproveSessionState instance with FileSnapshot objects reconstructed
        """
        file_snapshot = {
            filepath: FileSnapshot.from_dict(snapshot_data)
            for filepath, snapshot_data in data.get("file_snapshot", {}).items()
        }

        return cls(
            session_id=data["session_id"],
            transaction_id=data["transaction_id"],
            started_at=data["started_at"],
            current_index=data["current_index"],
            total_items=data["total_items"],
            partial_improvements=data["partial_improvements"],
            file_snapshot=file_snapshot,
            config=data["config"],
            completed_at=data.get("completed_at"),
        )

    @classmethod
    def create_initial(
        cls,
        session_id: str,
        transaction_id: str,
        items: list[Any],
        file_snapshot: dict[str, FileSnapshot],
        config: dict[str, Any],
    ) -> "ImproveSessionState":
        """Create initial session state at start of improve workflow.

        Args:
            session_id: UUID string for this session
            transaction_id: Git transaction ID for tracking documentation changes
            items: List of PlanItem objects to improve
            file_snapshot: File snapshots for modification detection
            config: Improve configuration (styleGuides, tone)

        Returns:
            New ImproveSessionState with empty improvements and current_index=0
        """
        # Initialize empty improvements structure: filepath -> item_name -> None
        # Items will be populated with status records as user accepts/skips
        partial_improvements: dict[str, dict[str, dict[str, Any]]] = {}
        for item in items:
            if item.filepath not in partial_improvements:
                partial_improvements[item.filepath] = {}
            # Initialize as empty dict - will be populated with status record on action
            partial_improvements[item.filepath][item.name] = {}

        return cls(
            session_id=session_id,
            transaction_id=transaction_id,
            started_at=datetime.now(UTC).isoformat(),
            current_index=0,
            total_items=len(items),
            partial_improvements=partial_improvements,
            file_snapshot=file_snapshot,
            config=config,
            completed_at=None,
        )
