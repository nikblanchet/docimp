"""
Schema migration framework for workflow-state.json.

Provides migration registry, chain execution, and version-specific migration functions
to enable safe schema evolution without breaking existing workflow state files.
"""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

# Current latest version (update when schema changes)
CURRENT_WORKFLOW_STATE_VERSION = "1.0"

# Type for migration functions
MigrationFunction = Callable[[dict[str, Any]], dict[str, Any]]


# Type for migration log entries
class MigrationLogEntry:
    """Represents a single migration that was applied."""

    def __init__(self, from_version: str, to_version: str, timestamp: str):
        """
        Initialize migration log entry.

        Args:
            from_version: Source schema version
            to_version: Target schema version
            timestamp: ISO 8601 timestamp when migration was applied
        """
        self.from_version = from_version
        self.to_version = to_version
        self.timestamp = timestamp

    def to_dict(self) -> dict[str, str]:
        """Convert to dictionary for JSON serialization."""
        return {
            "from": self.from_version,
            "to": self.to_version,
            "timestamp": self.timestamp,
        }

    @classmethod
    def from_dict(cls, data: dict[str, str]) -> "MigrationLogEntry":
        """Create from dictionary (JSON deserialization)."""
        return cls(
            from_version=data["from"],
            to_version=data["to"],
            timestamp=data["timestamp"],
        )


# Migration registry: maps "from->to" transitions to migration functions
WORKFLOW_STATE_MIGRATIONS: dict[str, MigrationFunction] = {
    # Example for future v1.1:
    # "1.0->1.1": migrate_v1_0_to_v1_1,
}

# Known schema versions in order
KNOWN_VERSIONS = ["1.0"]  # Add "1.1", "1.2", etc. as needed


def build_migration_path(
    from_version: str, to_version: str = CURRENT_WORKFLOW_STATE_VERSION
) -> list[str]:
    """
    Build migration path from source to target version.

    Args:
        from_version: Starting version
        to_version: Target version (default: CURRENT_WORKFLOW_STATE_VERSION)

    Returns:
        List of migration keys (e.g., ["1.0->1.1", "1.1->1.2"])

    Raises:
        ValueError: If versions are unknown or path doesn't exist
    """
    if from_version == to_version:
        return []  # No migration needed

    try:
        from_index = KNOWN_VERSIONS.index(from_version)
    except ValueError as error:
        msg = (
            f"Unknown source version: {from_version}. "
            f"Known versions: {', '.join(KNOWN_VERSIONS)}"
        )
        raise ValueError(msg) from error

    try:
        to_index = KNOWN_VERSIONS.index(to_version)
    except ValueError as error:
        msg = (
            f"Unknown target version: {to_version}. "
            f"Known versions: {', '.join(KNOWN_VERSIONS)}"
        )
        raise ValueError(msg) from error

    if from_index > to_index:
        msg = (
            f"Cannot migrate backwards from {from_version} to {to_version}. "
            f"Downgrading schema versions is not supported."
        )
        raise ValueError(msg)

    path = []
    for i in range(from_index, to_index):
        key = f"{KNOWN_VERSIONS[i]}->{KNOWN_VERSIONS[i + 1]}"
        if key not in WORKFLOW_STATE_MIGRATIONS:
            msg = (
                f"Missing migration function for {key}. "
                f"This indicates a bug in the migration registry."
            )
            raise ValueError(msg)
        path.append(key)

    return path


def apply_migrations(
    data: dict[str, Any], to_version: str = CURRENT_WORKFLOW_STATE_VERSION
) -> dict[str, Any]:
    """
    Apply migration chain to workflow state data.

    Args:
        data: Raw workflow state data (parsed JSON)
        to_version: Target version (default: CURRENT_WORKFLOW_STATE_VERSION)

    Returns:
        Migrated data with migration_log updated

    Raises:
        ValueError: If migration fails or validation fails
    """
    from_version = data.get("schema_version", "legacy")

    # Handle legacy files (no schema_version field)
    if from_version == "legacy":
        data["schema_version"] = "1.0"
        if "migration_log" not in data:
            data["migration_log"] = []
        data["migration_log"].append(
            {
                "from": "legacy",
                "to": "1.0",
                "timestamp": datetime.now(UTC).isoformat(),
            }
        )
        return data

    # Build migration path
    migration_path = build_migration_path(from_version, to_version)

    if not migration_path:
        return data  # Already at target version

    # Initialize migration_log if not present
    if "migration_log" not in data:
        data["migration_log"] = []

    # Apply migrations sequentially
    current = data
    for migration_key in migration_path:
        migration_function = WORKFLOW_STATE_MIGRATIONS[migration_key]
        from_ver, to_ver = migration_key.split("->")

        try:
            current = migration_function(current)

            # Add migration log entry
            current["migration_log"].append(
                {
                    "from": from_ver,
                    "to": to_ver,
                    "timestamp": datetime.now(UTC).isoformat(),
                }
            )
        except Exception as error:
            msg = (
                f"Migration failed at step {migration_key}: {error}\n"
                f"Backup your workflow-state.json and inspect the file manually.\n"
                f"If issue persists, delete the file and re-run 'docimp analyze'."
            )
            raise ValueError(msg) from error

    return current


def is_version_supported(version: str) -> bool:
    """
    Check if a schema version is supported (known and has migration path).

    Args:
        version: Schema version to check

    Returns:
        True if version is known and can be migrated to current
    """
    return version in KNOWN_VERSIONS or version == "legacy"


# Example migration function (for future v1.1):
# def migrate_v1_0_to_v1_1(data: dict[str, Any]) -> dict[str, Any]:
#     return {
#         **data,
#         "schema_version": "1.1",
#         "last_status": None,  # New field with default
#     }
