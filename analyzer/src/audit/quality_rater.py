"""Quality rating system for existing documentation.

This module handles persistence and management of documentation quality ratings
collected during interactive audits. Ratings are stored in
.docimp/session-reports/audit.json for use in impact scoring calculations.
"""

import json
from dataclasses import asdict, dataclass
from pathlib import Path

from ..utils.state_manager import StateManager


@dataclass
class AuditResult:
    """Container for audit ratings.

    Stores quality ratings for documented code items, organized by filepath
    and item name.

    Attributes:
        ratings: Nested dict mapping filepath -> item_name -> rating.
                 Rating scale: 1=Terrible, 2=OK, 3=Good, 4=Excellent, None=Skipped.
    """

    ratings: dict[str, dict[str, int | None]]

    def get_rating(self, filepath: str, item_name: str) -> int | None:
        """Get audit rating for a specific item.

        Args:
            filepath: Path to the source file.
            item_name: Name of the function/class/method.

        Returns:
            Rating (1-4) if found, None if not found or skipped.
        """
        return self.ratings.get(filepath, {}).get(item_name)

    def set_rating(self, filepath: str, item_name: str, rating: int | None) -> None:
        """Set audit rating for a specific item.

        Args:
            filepath: Path to the source file.
            item_name: Name of the function/class/method.
            rating: Quality rating (1-4) or None for skipped.
        """
        if filepath not in self.ratings:
            self.ratings[filepath] = {}
        self.ratings[filepath][item_name] = rating

    def to_dict(self) -> dict:
        """Serialize to dictionary.

        Returns:
            Dictionary representation.
        """
        return asdict(self)


def load_audit_results(audit_file: Path | None = None) -> AuditResult:
    """Load audit results from JSON file.

    Args:
        audit_file: Path to the audit results file. If None, uses
            StateManager.get_audit_file().

    Returns:
        AuditResult with loaded ratings, or empty if file doesn't exist.
    """
    if audit_file is None:
        audit_file = StateManager.get_audit_file()
    if not audit_file.exists():
        return AuditResult(ratings={})

    try:
        with audit_file.open() as f:
            data = json.load(f)
        return AuditResult(ratings=data.get("ratings", {}))
    except (OSError, json.JSONDecodeError):
        # If file is corrupted, start fresh
        return AuditResult(ratings={})


def save_audit_results(
    audit_result: AuditResult, audit_file: Path | None = None
) -> None:
    """Save audit results to JSON file.

    Args:
        audit_result: AuditResult to save.
        audit_file: Path to the audit results file. If None, uses
            StateManager.get_audit_file().
    """
    if audit_file is None:
        audit_file = StateManager.get_audit_file()

    # Ensure state directory exists before writing
    StateManager.ensure_state_dir()
    with audit_file.open("w") as f:
        json.dump(audit_result.to_dict(), f, indent=2)
