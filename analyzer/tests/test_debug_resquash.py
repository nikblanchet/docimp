"""Debug test for re-squash strategy."""

import tempfile
from pathlib import Path

from src.writer.transaction_manager import TransactionManager
from src.utils.git_helper import GitHelper


def test_debug_resquash():
    """Debug the re-squash workflow step by step."""
    with tempfile.TemporaryDirectory() as tmpdir:
        manager = TransactionManager(base_path=Path(tmpdir))
        manifest = manager.begin_transaction('test-session')

        # Create 3 changes
        for i in range(3):
            file = Path(tmpdir) / f'file{i}.py'
            file.write_text(f'def func{i}(): pass')
            manager.record_write(
                manifest, str(file), f'{file}.bak',
                f'func{i}', 'function', 'python'
            )

        print("\n=== After recording 3 changes ===")
        log = GitHelper.run_git_command(['log', '--oneline', '--all'], Path(tmpdir))
        print(log.stdout)

        # Get change IDs
        changes = manager.list_session_changes('test-session')
        assert len(changes) == 3
        second_change_id = changes[1].entry_id
        print(f"\nSecond change ID: {second_change_id}")

        # Commit the session
        manager.commit_transaction(manifest)

        print("\n=== After commit_transaction (squash) ===")
        log = GitHelper.run_git_command(['log', '--oneline', '--all'], Path(tmpdir))
        print(log.stdout)

        branches = GitHelper.run_git_command(['branch', '-a'], Path(tmpdir))
        print("\nBranches:")
        print(branches.stdout)

        current_branch = GitHelper.run_git_command(['rev-parse', '--abbrev-ref', 'HEAD'], Path(tmpdir))
        print(f"\nCurrent branch: {current_branch.stdout.strip()}")

        # Now rollback the second change
        print(f"\n=== Rolling back change {second_change_id} ===")
        result = manager.rollback_change(second_change_id)

        print(f"Rollback result: success={result.success}, status={result.status}")

        print("\n=== After rollback ===")
        log = GitHelper.run_git_command(['log', '--oneline', '--all'], Path(tmpdir))
        print(log.stdout)

        current_branch = GitHelper.run_git_command(['rev-parse', '--abbrev-ref', 'HEAD'], Path(tmpdir))
        print(f"\nCurrent branch: {current_branch.stdout.strip()}")

        print("\n=== Main branch log ===")
        log_main = GitHelper.run_git_command(['log', '--oneline', 'main'], Path(tmpdir))
        print(log_main.stdout)

        print("\n=== Session branch log ===")
        log_session = GitHelper.run_git_command(['log', '--oneline', 'docimp/session-test-session'], Path(tmpdir))
        print(log_session.stdout)


if __name__ == '__main__':
    test_debug_resquash()
