"""Quality rating system for existing documentation.

This module handles persistence and management of documentation quality ratings
collected during interactive audits. Ratings are stored in .docimp-audit.json
for use in impact scoring calculations.
"""

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Optional


@dataclass
class AuditResult:
    """Container for audit ratings.

    Stores quality ratings for documented code items, organized by filepath
    and item name.

    Attributes:
        ratings: Nested dict mapping filepath -> item_name -> rating.
                 Rating scale: 1=Terrible, 2=OK, 3=Good, 4=Excellent, None=Skipped.
    """

    ratings: Dict[str, Dict[str, Optional[int]]]

    def get_rating(self, filepath: str, item_name: str) -> Optional[int]:
        """Get audit rating for a specific item.

        Args:
            filepath: Path to the source file.
            item_name: Name of the function/class/method.

        Returns:
            Rating (1-4) if found, None if not found or skipped.
        """
        return self.ratings.get(filepath, {}).get(item_name)

    def set_rating(self, filepath: str, item_name: str, rating: Optional[int]) -> None:
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


def load_audit_results(audit_file: Path = Path('.docimp-audit.json')) -> AuditResult:
    """Load audit results from JSON file.

    Args:
        audit_file: Path to the audit results file.

    Returns:
        AuditResult with loaded ratings, or empty if file doesn't exist.
    """
    if not audit_file.exists():
        return AuditResult(ratings={})

    try:
        with open(audit_file, 'r') as f:
            data = json.load(f)
        return AuditResult(ratings=data.get('ratings', {}))
    except (json.JSONDecodeError, IOError) as e:
        # If file is corrupted, start fresh
        return AuditResult(ratings={})


def save_audit_results(
    audit_result: AuditResult,
    audit_file: Path = Path('.docimp-audit.json')
) -> None:
    """Save audit results to JSON file.

    Args:
        audit_result: AuditResult to save.
        audit_file: Path to the audit results file.
    """
    with open(audit_file, 'w') as f:
        json.dump(audit_result.to_dict(), f, indent=2)
