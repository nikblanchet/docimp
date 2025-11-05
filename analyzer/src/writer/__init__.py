"""Module for writing documentation to source files.

This module provides functionality to insert documentation into Python,
TypeScript, and JavaScript source files while preserving formatting and
ensuring idempotency.
"""

from .docstring_writer import DocstringWriter

__all__ = ["DocstringWriter"]
