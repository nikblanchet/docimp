"""Data models for code analysis results.

This module defines the core data structures used throughout DocImp:
- CodeItem: Represents a single parsed code element (function, class, method)
- AnalysisResult: Aggregated analysis results with coverage metrics
"""

from .code_item import CodeItem
from .analysis_result import AnalysisResult, LanguageMetrics

__all__ = ["CodeItem", "AnalysisResult", "LanguageMetrics"]
