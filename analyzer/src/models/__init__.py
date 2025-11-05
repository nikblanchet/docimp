"""Data models for code analysis results.

This module defines the core data structures used throughout DocImp:
- CodeItem: Represents a single parsed code element (function, class, method)
- AnalysisResult: Aggregated analysis results with coverage metrics
- AuditSessionState: Audit session state for save/resume functionality
- ImproveSessionState: Improve session state for save/resume functionality
- FileSnapshot: File snapshot for modification detection (from utils.file_tracker)
"""

from src.utils.file_tracker import FileSnapshot

from .analysis_result import AnalysisResult, LanguageMetrics
from .audit_session_state import AuditSessionState
from .code_item import CodeItem
from .improve_session_state import ImproveSessionState

__all__ = [
    "CodeItem",
    "AnalysisResult",
    "LanguageMetrics",
    "AuditSessionState",
    "ImproveSessionState",
    "FileSnapshot",
]
