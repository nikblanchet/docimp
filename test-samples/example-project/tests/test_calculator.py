"""Tests for calculator module.

This test file should be analyzed by default in MVP since test
exclusion is configured in docimp.config.js but not enforced yet.
"""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / 'src' / 'python'))

from calculator import add, subtract, multiply, divide


def test_add():
    """Test addition function."""
    assert add(2, 3) == 5
    assert add(-1, 1) == 0
    assert add(0, 0) == 0


def test_subtract():
    assert subtract(5, 3) == 2
    assert subtract(0, 5) == -5


def test_multiply():
    """Test multiplication."""
    assert multiply(2, 3) == 6
    assert multiply(-2, 3) == -6


def test_divide():
    """Test division with error handling."""
    assert divide(6, 2) == 3
    assert divide(5, 2) == 2.5

    try:
        divide(1, 0)
        assert False, "Should raise ValueError"
    except ValueError:
        pass
