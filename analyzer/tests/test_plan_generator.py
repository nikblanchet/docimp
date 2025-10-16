"""Tests for the plan generator module."""

import sys
from pathlib import Path
import tempfile

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.planning.plan_generator import generate_plan
from src.models.code_item import CodeItem
from src.models.analysis_result import AnalysisResult, LanguageMetrics
from src.audit.quality_rater import AuditResult, save_audit_results


class TestPlanGenerator:
    """Test suite for plan generation functionality."""

    @pytest.fixture
    def sample_items(self):
        """Return a list of sample CodeItems for testing."""
        return [
            CodeItem(
                name='undocumented_func',
                type='function',
                filepath='test.py',
                line_number=1,
                language='python',
                complexity=10,
                has_docs=False,
                export_type='internal',
                module_system='unknown',
                impact_score=50.0,
                audit_rating=None
            ),
            CodeItem(
                name='documented_terrible',
                type='function',
                filepath='test.py',
                line_number=10,
                language='python',
                complexity=8,
                has_docs=True,
                export_type='internal',
                module_system='unknown',
                impact_score=40.0,
                audit_rating=None,
                docstring='Terrible docs'
            ),
            CodeItem(
                name='documented_ok',
                type='function',
                filepath='test.py',
                line_number=20,
                language='python',
                complexity=6,
                has_docs=True,
                export_type='internal',
                module_system='unknown',
                impact_score=30.0,
                audit_rating=None,
                docstring='OK docs'
            ),
            CodeItem(
                name='documented_good',
                type='function',
                filepath='test.py',
                line_number=30,
                language='python',
                complexity=5,
                has_docs=True,
                export_type='internal',
                module_system='unknown',
                impact_score=25.0,
                audit_rating=None,
                docstring='Good docs'
            ),
            CodeItem(
                name='documented_excellent',
                type='function',
                filepath='test.py',
                line_number=40,
                language='python',
                complexity=4,
                has_docs=True,
                export_type='internal',
                module_system='unknown',
                impact_score=20.0,
                audit_rating=None,
                docstring='Excellent docs'
            ),
        ]

    @pytest.fixture
    def sample_result(self, sample_items):
        """Return a sample AnalysisResult for testing."""
        return AnalysisResult(
            items=sample_items,
            coverage_percent=80.0,
            total_items=5,
            documented_items=4,
            by_language={
                'python': LanguageMetrics(
                    language='python',
                    total_items=5,
                    documented_items=4,
                    coverage_percent=80.0,
                    avg_complexity=6.6,
                    avg_impact_score=33.0
                )
            }
        )

    @pytest.fixture
    def sample_audit(self):
        """Return a sample AuditResult for testing."""
        audit = AuditResult(ratings={})
        audit.set_rating('test.py', 'documented_terrible', 1)  # Terrible
        audit.set_rating('test.py', 'documented_ok', 2)  # OK
        audit.set_rating('test.py', 'documented_good', 3)  # Good
        audit.set_rating('test.py', 'documented_excellent', 4)  # Excellent
        return audit

    def test_generate_plan_without_audit(self, sample_result):
        """Test plan generation without audit file."""
        # Use non-existent audit file
        with tempfile.NamedTemporaryFile(suffix='.json', delete=True) as tmp:
            audit_file = Path(tmp.name)

        # File doesn't exist
        assert not audit_file.exists()

        # Should work without crashing
        plan = generate_plan(sample_result, audit_file=audit_file)

        # Should include only undocumented items
        assert plan.total_items == 1
        assert plan.missing_docs_count == 1
        assert plan.poor_quality_count == 0
        assert plan.items[0].name == 'undocumented_func'

    def test_generate_plan_with_nonexistent_audit_file(self, sample_result):
        """Test graceful degradation when audit file doesn't exist."""
        # Create a path that doesn't exist
        audit_file = Path('/tmp/nonexistent_audit_file_12345.json')

        # Should not crash
        plan = generate_plan(sample_result, audit_file=audit_file)

        # Should only include items without docs
        assert plan.total_items == 1
        assert plan.items[0].has_docs is False

    def test_generate_plan_applies_audit_ratings(self, sample_result, sample_audit):
        """Test that audit ratings are applied to items."""
        # Save audit to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp:
            audit_file = Path(tmp.name)
            save_audit_results(sample_audit, audit_file)

        try:
            # Generate plan (side effect: applies ratings to items)
            _ = generate_plan(sample_result, audit_file=audit_file)

            # Find the items in the original result to verify ratings were applied
            terrible_item = next(i for i in sample_result.items if i.name == 'documented_terrible')
            ok_item = next(i for i in sample_result.items if i.name == 'documented_ok')
            good_item = next(i for i in sample_result.items if i.name == 'documented_good')
            excellent_item = next(i for i in sample_result.items if i.name == 'documented_excellent')

            # Verify ratings were applied
            assert terrible_item.audit_rating == 1
            assert ok_item.audit_rating == 2
            assert good_item.audit_rating == 3
            assert excellent_item.audit_rating == 4
        finally:
            audit_file.unlink()

    def test_generate_plan_recalculates_impact_scores(self, sample_result, sample_audit):
        """Test that impact scores are recalculated with audit ratings."""
        # Save initial scores
        initial_scores = {item.name: item.impact_score for item in sample_result.items}

        # Save audit to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp:
            audit_file = Path(tmp.name)
            save_audit_results(sample_audit, audit_file)

        try:
            # Generate plan (side effect: recalculates impact scores)
            _ = generate_plan(sample_result, audit_file=audit_file)

            # Verify impact scores changed for items with audit ratings
            terrible_item = next(i for i in sample_result.items if i.name == 'documented_terrible')
            ok_item = next(i for i in sample_result.items if i.name == 'documented_ok')

            # Impact scores should be different from initial (because audit ratings were applied)
            assert terrible_item.impact_score != initial_scores['documented_terrible']
            assert ok_item.impact_score != initial_scores['documented_ok']

            # Impact score for terrible docs should be higher than for OK docs
            # (both have audit ratings applied, but terrible gets higher penalty)
            assert terrible_item.impact_score > ok_item.impact_score
        finally:
            audit_file.unlink()

    def test_generate_plan_filters_by_quality_threshold(self, sample_result, sample_audit):
        """Test that only poor quality items are included based on threshold."""
        # Save audit to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp:
            audit_file = Path(tmp.name)
            save_audit_results(sample_audit, audit_file)

        try:
            # Generate plan with threshold=2 (include Terrible=1 and OK=2)
            plan = generate_plan(sample_result, audit_file=audit_file, quality_threshold=2)

            # Should include: undocumented + terrible + ok
            assert plan.total_items == 3
            assert plan.missing_docs_count == 1
            assert plan.poor_quality_count == 2

            # Verify the items
            item_names = {item.name for item in plan.items}
            assert 'undocumented_func' in item_names
            assert 'documented_terrible' in item_names
            assert 'documented_ok' in item_names
            assert 'documented_good' not in item_names
            assert 'documented_excellent' not in item_names
        finally:
            audit_file.unlink()

    def test_generate_plan_matches_by_filepath_and_name(self, sample_result):
        """Test that ratings are matched correctly by filepath and name."""
        # Create audit with rating for different file
        audit = AuditResult(ratings={})
        audit.set_rating('other.py', 'documented_terrible', 1)  # Different file
        audit.set_rating('test.py', 'wrong_name', 1)  # Different name
        audit.set_rating('test.py', 'documented_terrible', 1)  # Correct match

        # Save audit to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp:
            audit_file = Path(tmp.name)
            save_audit_results(audit, audit_file)

        try:
            # Generate plan (side effect: applies ratings to matching items)
            _ = generate_plan(sample_result, audit_file=audit_file)

            # Only the correct match should have audit rating applied
            terrible_item = next(i for i in sample_result.items if i.name == 'documented_terrible')
            ok_item = next(i for i in sample_result.items if i.name == 'documented_ok')

            assert terrible_item.audit_rating == 1
            assert ok_item.audit_rating is None  # No rating in audit
        finally:
            audit_file.unlink()

    def test_generate_plan_handles_missing_rating(self, sample_result):
        """Test that items without audit ratings are handled correctly."""
        # Create audit with only some items rated
        audit = AuditResult(ratings={})
        audit.set_rating('test.py', 'documented_terrible', 1)
        # Don't rate the other items

        # Save audit to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp:
            audit_file = Path(tmp.name)
            save_audit_results(audit, audit_file)

        try:
            # Generate plan
            plan = generate_plan(sample_result, audit_file=audit_file)

            # Should include undocumented + terrible (rated as 1)
            # Should NOT include ok/good/excellent (no ratings, so not included)
            assert plan.total_items == 2
            assert plan.missing_docs_count == 1
            assert plan.poor_quality_count == 1

            item_names = {item.name for item in plan.items}
            assert 'undocumented_func' in item_names
            assert 'documented_terrible' in item_names
        finally:
            audit_file.unlink()
