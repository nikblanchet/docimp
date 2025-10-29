"""Transaction tracking for rollback capability.

This module provides transaction management for the DocImp improve workflow,
enabling users to rollback documentation changes if needed. Transactions track
all file modifications during an improve session and preserve backup files
until the transaction is committed or rolled back.

Key components:
- TransactionEntry: Records a single file modification
- TransactionManifest: Tracks all modifications in a session
- TransactionManager: Manages transaction lifecycle
"""

from dataclasses import dataclass, asdict, field
from typing import List, Optional
from pathlib import Path
import json
import shutil
from datetime import datetime


@dataclass
class TransactionEntry:
    """Record of a single file modification during an improve session.

    Attributes:
        filepath: Absolute path to the modified file
        backup_path: Path to the backup file (.bak)
        timestamp: ISO format timestamp of when the write occurred
        item_name: Name of the function/class/method that was documented
        item_type: Type of code item ('function', 'class', 'method')
        language: Programming language ('python', 'javascript', 'typescript')
        success: Whether the write operation succeeded
    """
    filepath: str
    backup_path: str
    timestamp: str
    item_name: str
    item_type: str
    language: str
    success: bool


@dataclass
class TransactionManifest:
    """Manifest tracking all writes in an improve session.

    The manifest is serialized to JSON and stored in .docimp/session-reports/transactions/
    to enable rollback functionality. Each improve session gets a unique manifest file
    identified by its session_id (UUID).

    Attributes:
        session_id: Unique identifier for this session (UUID)
        started_at: ISO timestamp when the session began
        completed_at: ISO timestamp when session ended, None if in progress
        entries: List of file modifications made during the session
        status: Current state ('in_progress', 'committed', 'rolled_back')
        git_commit_sha: Optional git commit SHA for future git integration
    """
    session_id: str
    started_at: str
    completed_at: Optional[str] = None
    entries: List[TransactionEntry] = field(default_factory=list)
    status: str = 'in_progress'
    git_commit_sha: Optional[str] = None


class TransactionManager:
    """Manages transaction lifecycle for rollback capability.

    The TransactionManager handles the complete lifecycle of a documentation
    improvement transaction:

    1. Begin: Create new manifest when session starts
    2. Record: Track each file modification with backup path
    3. Commit: Mark successful completion and cleanup backups
    4. Rollback: Restore files from backups on user request
    5. Cleanup: Delete old transaction manifests based on retention policy

    Example:
        >>> manager = TransactionManager()
        >>> manifest = manager.begin_transaction('session-uuid-123')
        >>> manager.record_write(
        ...     manifest, '/path/to/file.py', '/path/to/file.py.bak',
        ...     'foo', 'function', 'python'
        ... )
        >>> manager.commit_transaction(manifest)
    """

    def begin_transaction(self, session_id: str) -> TransactionManifest:
        """Create a new transaction manifest for an improve session.

        Parameters:
            session_id: Unique identifier for the session (typically a UUID)

        Returns:
            New TransactionManifest with status 'in_progress'
        """
        return TransactionManifest(
            session_id=session_id,
            started_at=datetime.utcnow().isoformat()
        )

    def record_write(
        self,
        manifest: TransactionManifest,
        filepath: str,
        backup_path: str,
        item_name: str,
        item_type: str,
        language: str
    ) -> None:
        """Add a file modification entry to the transaction manifest.

        Call this after each successful docstring write to record the modification
        and its backup location for potential rollback.

        Parameters:
            manifest: Transaction manifest to update
            filepath: Absolute path to the modified file
            backup_path: Path to the backup file (typically filepath + '.bak')
            item_name: Name of the documented function/class/method
            item_type: Type of code item ('function', 'class', 'method')
            language: Programming language ('python', 'javascript', 'typescript')
        """
        entry = TransactionEntry(
            filepath=filepath,
            backup_path=backup_path,
            timestamp=datetime.utcnow().isoformat(),
            item_name=item_name,
            item_type=item_type,
            language=language,
            success=True
        )
        manifest.entries.append(entry)

    def commit_transaction(self, manifest: TransactionManifest) -> None:
        """Mark transaction as committed and delete all backup files.

        Call this when an improve session completes successfully. This marks
        the transaction as 'committed', sets the completion timestamp, and
        deletes all backup files since the changes are now permanent.

        Parameters:
            manifest: Transaction manifest to commit
        """
        manifest.status = 'committed'
        manifest.completed_at = datetime.utcnow().isoformat()

        # Delete all backup files
        for entry in manifest.entries:
            backup = Path(entry.backup_path)
            if backup.exists():
                backup.unlink()

    def rollback_transaction(self, manifest: TransactionManifest) -> int:
        """Restore all files from backups and mark transaction as rolled back.

        This undoes all documentation changes made during the improve session
        by restoring files from their backup copies. Backup files are deleted
        after restoration.

        Parameters:
            manifest: Transaction manifest to rollback

        Returns:
            Number of files successfully restored

        Raises:
            ValueError: If transaction is already committed or rolled back
        """
        if manifest.status == 'committed':
            raise ValueError(
                f"Cannot rollback committed transaction {manifest.session_id}"
            )
        if manifest.status == 'rolled_back':
            raise ValueError(
                f"Transaction {manifest.session_id} already rolled back"
            )

        restored_count = 0
        for entry in manifest.entries:
            backup = Path(entry.backup_path)
            target = Path(entry.filepath)

            if backup.exists():
                shutil.copy2(backup, target)
                backup.unlink()
                restored_count += 1

        manifest.status = 'rolled_back'
        manifest.completed_at = datetime.utcnow().isoformat()
        return restored_count

    def save_manifest(self, manifest: TransactionManifest, path: Path) -> None:
        """Serialize transaction manifest to JSON file.

        The manifest is saved as a JSON file in .docimp/session-reports/transactions/
        with the filename transaction-{session_id}.json.

        Parameters:
            manifest: Transaction manifest to serialize
            path: Path where manifest should be saved (including filename)
        """
        path.parent.mkdir(parents=True, exist_ok=True)

        # Convert manifest to dict, handling TransactionEntry objects
        manifest_dict = asdict(manifest)

        with open(path, 'w') as f:
            json.dump(manifest_dict, f, indent=2)

    def load_manifest(self, path: Path) -> TransactionManifest:
        """Deserialize transaction manifest from JSON file.

        Parameters:
            path: Path to the manifest JSON file

        Returns:
            Reconstructed TransactionManifest object

        Raises:
            FileNotFoundError: If manifest file doesn't exist
            json.JSONDecodeError: If manifest file is invalid JSON
        """
        with open(path, 'r') as f:
            data = json.load(f)

        # Reconstruct TransactionEntry objects from dicts
        if 'entries' in data and data['entries']:
            data['entries'] = [TransactionEntry(**e) for e in data['entries']]

        return TransactionManifest(**data)

    def list_uncommitted_transactions(
        self,
        transactions_dir: Path
    ) -> List[TransactionManifest]:
        """List all uncommitted transaction manifests.

        Returns only transactions with status 'in_progress', sorted by
        modification time (newest first). Committed and rolled back transactions
        are filtered out.

        Parameters:
            transactions_dir: Path to .docimp/session-reports/transactions/

        Returns:
            List of uncommitted TransactionManifest objects
        """
        if not transactions_dir.exists():
            return []

        uncommitted = []
        for manifest_file in sorted(
            transactions_dir.glob('transaction-*.json'),
            key=lambda p: p.stat().st_mtime,
            reverse=True
        ):
            manifest = self.load_manifest(manifest_file)
            if manifest.status == 'in_progress':
                uncommitted.append(manifest)

        return uncommitted

    def cleanup_old_transactions(
        self,
        transactions_dir: Path,
        keep_count: int
    ) -> int:
        """Delete old committed/rolled_back manifests beyond retention limit.

        This maintains a clean transactions directory by deleting old manifest files
        while preserving:
        - All uncommitted (in_progress) transactions (always kept for rollback)
        - The most recent N committed/rolled_back transactions (based on keep_count)

        Parameters:
            transactions_dir: Path to .docimp/session-reports/transactions/
            keep_count: Number of recent committed/rolled_back manifests to keep

        Returns:
            Number of manifest files deleted
        """
        if not transactions_dir.exists():
            return 0

        # Get all manifests sorted by modification time (newest first)
        all_manifests = sorted(
            transactions_dir.glob('transaction-*.json'),
            key=lambda p: p.stat().st_mtime,
            reverse=True
        )

        # Separate uncommitted (always keep) from committed/rolled_back
        uncommitted_files = []
        completed_files = []

        for manifest_file in all_manifests:
            manifest = self.load_manifest(manifest_file)
            if manifest.status == 'in_progress':
                uncommitted_files.append(manifest_file)
            else:
                completed_files.append(manifest_file)

        # Keep most recent N from completed transactions
        files_to_delete = completed_files[keep_count:]

        deleted_count = 0
        for manifest_file in files_to_delete:
            manifest_file.unlink()
            deleted_count += 1

        return deleted_count
