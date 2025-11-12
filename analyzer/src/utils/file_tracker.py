"""File tracker for detecting source file modifications.

Provides checksum and timestamp-based file modification detection for session resume.
"""

import hashlib
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class FileSnapshot:
    """Snapshot of a source file for modification detection.

    Attributes:
        filepath: Absolute or relative path to file
        timestamp: File modification time (os.path.getmtime())
        checksum: SHA256 hex digest of file contents
        size: File size in bytes
    """

    filepath: str
    timestamp: float
    checksum: str
    size: int

    def to_dict(self) -> dict[str, Any]:
        """Convert to JSON-serializable dict."""
        return {
            "filepath": self.filepath,
            "timestamp": self.timestamp,
            "checksum": self.checksum,
            "size": self.size,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "FileSnapshot":
        """Create from JSON-deserialized dict."""
        return cls(
            filepath=data["filepath"],
            timestamp=data["timestamp"],
            checksum=data["checksum"],
            size=data["size"],
        )


class FileTracker:
    """Tracks file modifications using checksums and timestamps."""

    @staticmethod
    def _compute_snapshot(filepath: str) -> FileSnapshot | None:
        """Compute snapshot for a single file.

        Args:
            filepath: Path to file

        Returns:
            FileSnapshot or None if file cannot be read
        """
        path = Path(filepath)

        # Skip if file doesn't exist or is not readable
        if not path.exists() or not path.is_file():
            return None

        try:
            # Get file metadata
            stat = path.stat()
            timestamp = stat.st_mtime
            size = stat.st_size

            # Compute SHA256 checksum
            sha256_hash = hashlib.sha256()
            with path.open("rb") as f:
                # Read in chunks to handle large files efficiently
                for chunk in iter(lambda: f.read(8192), b""):
                    sha256_hash.update(chunk)
            checksum = sha256_hash.hexdigest()

            # Create snapshot
            return FileSnapshot(
                filepath=filepath,
                timestamp=timestamp,
                checksum=checksum,
                size=size,
            )

        except PermissionError:
            # Log permission errors but continue with other files
            logger.warning(f"Permission denied when reading {filepath}")
            return None
        except OSError:
            # Skip other OS errors (e.g., file is a directory)
            return None

    @staticmethod
    def create_snapshot(filepaths: list[str]) -> dict[str, FileSnapshot]:
        """Create snapshots of files for modification detection.

        Checksums are calculated in parallel for improved performance
        on large file sets.

        Args:
            filepaths: List of file paths to snapshot

        Returns:
            dict: Mapping of filepath -> FileSnapshot

        Note:
            Missing or unreadable files are skipped silently
        """
        snapshots: dict[str, FileSnapshot] = {}

        # Process files in parallel using thread pool
        with ThreadPoolExecutor() as executor:
            # Submit all file processing tasks
            future_to_filepath = {
                executor.submit(FileTracker._compute_snapshot, fp): fp
                for fp in filepaths
            }

            # Collect results as they complete
            for future in as_completed(future_to_filepath):
                snapshot = future.result()
                if snapshot is not None:
                    snapshots[snapshot.filepath] = snapshot

        return snapshots

    @staticmethod
    def _check_file_changed(
        filepath: str, old_snapshot: FileSnapshot
    ) -> str | None:
        """Check if a single file has changed since snapshot.

        Args:
            filepath: Path to file
            old_snapshot: Previous snapshot to compare against

        Returns:
            Filepath if changed, None if unchanged
        """
        path = Path(filepath)

        # File deleted
        if not path.exists():
            return filepath

        try:
            # Recompute checksum
            sha256_hash = hashlib.sha256()
            with path.open("rb") as f:
                for chunk in iter(lambda: f.read(8192), b""):
                    sha256_hash.update(chunk)
            new_checksum = sha256_hash.hexdigest()

            # Compare checksums (timestamp changes alone don't count)
            if new_checksum != old_snapshot.checksum:
                return filepath
            return None

        except PermissionError:
            # Log permission errors
            logger.warning(f"Permission denied when reading {filepath}")
            return filepath
        except OSError:
            # Can't read file for other reasons - consider it changed
            return filepath

    @staticmethod
    def detect_changes(snapshot: dict[str, FileSnapshot]) -> list[str]:
        """Detect which files have changed since snapshot was created.

        Files are considered changed if:
        - Checksum differs (content modified)
        - File no longer exists (deleted)
        - File added (not in snapshot, skipped in this method)

        Timestamp-only changes (same checksum) are NOT considered modifications.

        Checksums are recalculated in parallel for improved performance
        on large file sets.

        Args:
            snapshot: File snapshots from create_snapshot()

        Returns:
            list[str]: List of filepaths that have changed
        """
        changed_files: list[str] = []

        # Process files in parallel using thread pool
        with ThreadPoolExecutor() as executor:
            # Submit all change detection tasks
            future_to_filepath = {
                executor.submit(
                    FileTracker._check_file_changed, filepath, old_snapshot
                ): filepath
                for filepath, old_snapshot in snapshot.items()
            }

            # Collect results as they complete
            for future in as_completed(future_to_filepath):
                result = future.result()
                if result is not None:
                    changed_files.append(result)

        return changed_files

    @staticmethod
    def get_changed_items(changed_files: list[str], items: list[Any]) -> list[Any]:
        """Filter items to only those whose files have changed.

        Args:
            changed_files: List of changed file paths from detect_changes()
            items: List of CodeItem objects (or any objects with 'filepath' attribute)

        Returns:
            list: Items whose filepath is in changed_files
        """
        changed_set = set(changed_files)
        return [
            item for item in items if getattr(item, "filepath", None) in changed_set
        ]
