"""Audit module for rating documentation quality."""

from .quality_rater import AuditResult, load_audit_results, save_audit_results

__all__ = ['AuditResult', 'load_audit_results', 'save_audit_results']
