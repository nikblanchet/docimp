"""Tests for calculator module.

This test file is properly excluded from documentation analysis.
Test directories (tests/, test/, __tests__/) are excluded by default.
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
