"""
Workflow state tracking for bidirectional workflows.

Tracks the state of analyze, audit, plan, and improve commands to enable
workflow validation, stale detection, and incremental re-analysis.
"""

from dataclasses import dataclass
from datetime import UTC, datetime


@dataclass
class CommandState:
    """Represents the state of a single workflow command execution."""

    timestamp: str  # ISO 8601 timestamp
    item_count: int
    file_checksums: dict[str, str]  # filepath -> SHA256 checksum

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "timestamp": self.timestamp,
            "item_count": self.item_count,
            "file_checksums": self.file_checksums,
        }

    @staticmethod
    def from_dict(data: dict) -> "CommandState":
        """Create CommandState from dictionary."""
        return CommandState(
            timestamp=data["timestamp"],
            item_count=data["item_count"],
            file_checksums=data["file_checksums"],
        )

    @staticmethod
    def create(item_count: int, file_checksums: dict[str, str]) -> "CommandState":
        """Create a new CommandState with current timestamp."""
        return CommandState(
            timestamp=datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            item_count=item_count,
            file_checksums=file_checksums,
        )


@dataclass
class WorkflowState:
    """
    Tracks the overall workflow state across all commands.

    Stored in .docimp/workflow-state.json to enable:
    - Workflow dependency validation
    - Stale data detection
    - Incremental re-analysis
    - Bidirectional workflows (analyze ↔ audit ↔ plan)
    """

    schema_version: str
    last_analyze: CommandState | None
    last_audit: CommandState | None
    last_plan: CommandState | None
    last_improve: CommandState | None

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "schema_version": self.schema_version,
            "last_analyze": self.last_analyze.to_dict() if self.last_analyze else None,
            "last_audit": self.last_audit.to_dict() if self.last_audit else None,
            "last_plan": self.last_plan.to_dict() if self.last_plan else None,
            "last_improve": self.last_improve.to_dict() if self.last_improve else None,
        }

    @staticmethod
    def from_dict(data: dict) -> "WorkflowState":
        """Create WorkflowState from dictionary."""
        return WorkflowState(
            schema_version=data["schema_version"],
            last_analyze=CommandState.from_dict(data["last_analyze"])
            if data.get("last_analyze")
            else None,
            last_audit=CommandState.from_dict(data["last_audit"])
            if data.get("last_audit")
            else None,
            last_plan=CommandState.from_dict(data["last_plan"])
            if data.get("last_plan")
            else None,
            last_improve=CommandState.from_dict(data["last_improve"])
            if data.get("last_improve")
            else None,
        )

    @staticmethod
    def create_empty() -> "WorkflowState":
        """Create an empty workflow state."""
        return WorkflowState(
            schema_version="1.0",
            last_analyze=None,
            last_audit=None,
            last_plan=None,
            last_improve=None,
        )
