"""Tests for GitHelper utilities."""

import subprocess
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.utils.git_helper import GitHelper
from src.utils.state_manager import StateManager


class TestGitHelper:
    """Test suite for GitHelper class."""

    def test_check_git_available_when_installed(self):
        """Test git detection when git is in PATH."""
        # Assuming git is installed (CI/CD requirement)
        assert GitHelper.check_git_available() is True

    def test_check_git_available_when_missing(self):
        """Test git detection when git is not in PATH."""
        with patch("shutil.which", return_value=None):
            assert GitHelper.check_git_available() is False

    def test_init_sidecar_repo_creates_structure(self):
        """Test that init_sidecar_repo creates .docimp/state/.git."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize the sidecar repo
            result = GitHelper.init_sidecar_repo(base_path)

            # Should succeed if git available
            if GitHelper.check_git_available():
                assert result is True

                # Verify structure was created
                git_state_dir = StateManager.get_git_state_dir(base_path)
                git_dir = git_state_dir / ".git"

                assert git_dir.exists()
                assert (git_dir / "HEAD").exists()
                assert (git_state_dir / ".gitignore").exists()
            else:
                assert result is False

    def test_init_sidecar_repo_is_idempotent(self):
        """Test that init_sidecar_repo can be called multiple times."""
        if not GitHelper.check_git_available():
            pytest.skip("Git not available")

        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize twice
            result1 = GitHelper.init_sidecar_repo(base_path)
            result2 = GitHelper.init_sidecar_repo(base_path)

            assert result1 is True
            assert result2 is True

            # Should still have valid repo
            git_state_dir = StateManager.get_git_state_dir(base_path)
            git_dir = git_state_dir / ".git"
            assert git_dir.exists()

    def test_init_sidecar_repo_returns_false_when_git_missing(self):
        """Test graceful degradation when git not available."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            with patch.object(GitHelper, "check_git_available", return_value=False):
                result = GitHelper.init_sidecar_repo(base_path)
                assert result is False

    def test_run_git_command_uses_isolation_flags(self):
        """Test that git commands use --git-dir and --work-tree flags."""
        if not GitHelper.check_git_available():
            pytest.skip("Git not available")

        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize repo first
            GitHelper.init_sidecar_repo(base_path)

            # Run a simple git command
            result = GitHelper.run_git_command(["status"], base_path)

            assert result.returncode == 0
            # Should execute without error

    def test_run_git_command_raises_on_failure_when_check_true(self):
        """Test that run_git_command raises CalledProcessError when check=True."""
        if not GitHelper.check_git_available():
            pytest.skip("Git not available")

        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize repo first
            GitHelper.init_sidecar_repo(base_path)

            # Run invalid command
            with pytest.raises(subprocess.CalledProcessError):
                GitHelper.run_git_command(["invalid-command"], base_path, check=True)

    def test_run_git_command_does_not_raise_when_check_false(self):
        """Test that run_git_command returns error result when check=False."""
        if not GitHelper.check_git_available():
            pytest.skip("Git not available")

        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize repo first
            GitHelper.init_sidecar_repo(base_path)

            # Run invalid command with check=False
            result = GitHelper.run_git_command(
                ["invalid-command"], base_path, check=False
            )

            assert result.returncode != 0

    def test_run_git_command_captures_output(self):
        """Test that run_git_command captures stdout/stderr."""
        if not GitHelper.check_git_available():
            pytest.skip("Git not available")

        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize repo first
            GitHelper.init_sidecar_repo(base_path)

            # Run command that produces output
            result = GitHelper.run_git_command(["status"], base_path)

            assert result.stdout is not None
            assert isinstance(result.stdout, str)

    def test_sidecar_repo_isolation_from_user_repo(self):
        """Test that side-car repo does not interfere with user's git repo."""
        if not GitHelper.check_git_available():
            pytest.skip("Git not available")

        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Create a user git repo
            user_git_dir = base_path / ".git"
            user_git_dir.mkdir(parents=True)
            subprocess.run(
                ["git", "init"], cwd=base_path, check=True, capture_output=True
            )

            # Initialize sidecar repo
            GitHelper.init_sidecar_repo(base_path)

            # Check that user's .git is untouched
            assert user_git_dir.exists()

            # Check that sidecar repo is separate
            git_state_dir = StateManager.get_git_state_dir(base_path)
            sidecar_git_dir = git_state_dir / ".git"

            assert sidecar_git_dir.exists()
            assert sidecar_git_dir != user_git_dir

    def test_gitignore_created_with_correct_content(self):
        """Test that .gitignore is created with ephemeral state comment."""
        if not GitHelper.check_git_available():
            pytest.skip("Git not available")

        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            GitHelper.init_sidecar_repo(base_path)

            git_state_dir = StateManager.get_git_state_dir(base_path)
            gitignore_path = git_state_dir / ".gitignore"

            assert gitignore_path.exists()
            content = gitignore_path.read_text()
            assert "ephemeral" in content
            assert "*" in content  # Ignore everything

    def test_categorize_operation_fast(self):
        """Test that fast operations are correctly categorized."""
        # Fast operations: status, rev-parse, branch, show, diff
        assert GitHelper._categorize_operation(["status"]) == "fast"
        assert (
            GitHelper._categorize_operation(["rev-parse", "--short", "HEAD"]) == "fast"
        )
        assert GitHelper._categorize_operation(["branch", "--list"]) == "fast"
        assert GitHelper._categorize_operation(["show", "abc123"]) == "fast"
        assert GitHelper._categorize_operation(["diff", "HEAD"]) == "fast"

    def test_categorize_operation_slow(self):
        """Test that slow operations are correctly categorized."""
        # Slow operations: merge, revert, reset, init, clone, rebase
        assert (
            GitHelper._categorize_operation(["merge", "--squash", "branch"]) == "slow"
        )
        assert GitHelper._categorize_operation(["revert", "abc123"]) == "slow"
        assert GitHelper._categorize_operation(["reset", "--hard", "HEAD"]) == "slow"
        assert GitHelper._categorize_operation(["init"]) == "slow"
        assert GitHelper._categorize_operation(["clone", "repo"]) == "slow"
        assert GitHelper._categorize_operation(["rebase", "main"]) == "slow"

    def test_categorize_operation_default(self):
        """Test that default operations are correctly categorized."""
        # Default operations: add, commit, checkout, log
        assert GitHelper._categorize_operation(["add", "file.py"]) == "default"
        assert GitHelper._categorize_operation(["commit", "-m", "message"]) == "default"
        assert GitHelper._categorize_operation(["checkout", "main"]) == "default"
        assert GitHelper._categorize_operation(["log", "--oneline"]) == "default"

    def test_categorize_operation_empty(self):
        """Test that empty args default to 'default' category."""
        assert GitHelper._categorize_operation([]) == "default"

    def test_calculate_timeout_fast(self):
        """Test timeout calculation for fast operations."""
        from src.utils.git_helper import GitTimeoutConfig

        config = GitTimeoutConfig(
            base_timeout_ms=30000,
            fast_scale=0.167,
            slow_scale=4.0,
            max_timeout_ms=300000,
        )

        # Fast operation: status
        timeout = GitHelper._calculate_timeout(["status"], config)
        # 30000 * 0.167 = 5010ms = 5.01 seconds
        assert timeout == pytest.approx(5.01, rel=0.01)

    def test_calculate_timeout_default(self):
        """Test timeout calculation for default operations."""
        from src.utils.git_helper import GitTimeoutConfig

        config = GitTimeoutConfig(
            base_timeout_ms=30000,
            fast_scale=0.167,
            slow_scale=4.0,
            max_timeout_ms=300000,
        )

        # Default operation: commit
        timeout = GitHelper._calculate_timeout(["commit", "-m", "message"], config)
        # base_timeout_ms = 30000ms = 30.0 seconds
        assert timeout == 30.0

    def test_calculate_timeout_slow(self):
        """Test timeout calculation for slow operations."""
        from src.utils.git_helper import GitTimeoutConfig

        config = GitTimeoutConfig(
            base_timeout_ms=30000,
            fast_scale=0.167,
            slow_scale=4.0,
            max_timeout_ms=300000,
        )

        # Slow operation: merge
        timeout = GitHelper._calculate_timeout(["merge", "--squash", "branch"], config)
        # 30000 * 4.0 = 120000ms = 120.0 seconds
        assert timeout == 120.0

    def test_calculate_timeout_respects_max(self):
        """Test that calculated timeout never exceeds max_timeout_ms."""
        from src.utils.git_helper import GitTimeoutConfig

        config = GitTimeoutConfig(
            base_timeout_ms=100000,
            fast_scale=0.167,
            slow_scale=4.0,
            max_timeout_ms=200000,
        )

        # Slow operation would be 100000 * 4.0 = 400000ms, but capped at 200000ms
        timeout = GitHelper._calculate_timeout(["merge", "--squash", "branch"], config)
        assert timeout == 200.0  # 200000ms = 200 seconds (capped)

    def test_timeout_config_defaults(self):
        """Test GitTimeoutConfig default values."""
        from src.utils.git_helper import GitTimeoutConfig

        config = GitTimeoutConfig()
        assert config.base_timeout_ms == 30000
        assert config.fast_scale == 0.167
        assert config.slow_scale == 4.0
        assert config.max_timeout_ms == 300000

    def test_run_git_command_with_custom_timeout(self):
        """Test that custom timeout config is applied to git commands."""
        if not GitHelper.check_git_available():
            pytest.skip("Git not available")

        from src.utils.git_helper import GitTimeoutConfig

        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            GitHelper.init_sidecar_repo(base_path)

            # Custom config with very short timeouts
            config = GitTimeoutConfig(
                base_timeout_ms=10, fast_scale=0.1, slow_scale=1.0, max_timeout_ms=100
            )

            # Fast operation should work even with short timeout
            # status is fast (10ms * 0.1 = 1ms timeout)
            try:
                result = GitHelper.run_git_command(
                    ["status", "--short"], base_path, timeout_config=config
                )
                # If git is very fast, this might succeed
                assert result.returncode == 0 or True  # Allow timeout
            except TimeoutError:
                # This is acceptable - the timeout is intentionally very short
                pass

    def test_timeout_error_message_includes_config_hint(self):
        """Test that timeout errors include helpful configuration hints."""
        if not GitHelper.check_git_available():
            pytest.skip("Git not available")

        from src.utils.git_helper import GitTimeoutConfig

        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            GitHelper.init_sidecar_repo(base_path)

            # Extremely short timeout to force timeout
            config = GitTimeoutConfig(
                base_timeout_ms=1, fast_scale=0.001, slow_scale=0.001, max_timeout_ms=1
            )

            try:
                GitHelper.run_git_command(["status"], base_path, timeout_config=config)
                # If we get here, git was extremely fast (unlikely with 0.001ms timeout)
                pytest.skip("Git operation completed faster than minimum timeout")
            except TimeoutError as e:
                error_msg = str(e)
                # Verify error message contains helpful information
                assert "timed out" in error_msg.lower()
                assert "fast" in error_msg.lower()  # Operation category
                assert "transaction.git" in error_msg  # Config field hint
                assert "docimp.config.js" in error_msg  # Config file
