"""Integration tests for complete workflows."""

import sys
from pathlib import Path
import tempfile
import shutil

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.analysis.analyzer import DocumentationAnalyzer
from src.parsers.python_parser import PythonParser
from src.scoring.impact_scorer import ImpactScorer
from src.planning.plan_generator import generate_plan
from src.audit.quality_rater import AuditResult, save_audit_results


class TestWorkflowIntegration:
    """Integration tests for end-to-end workflows."""

    @pytest.fixture
    def analyzer(self):
        """Create a DocumentationAnalyzer with Python parser."""
        return DocumentationAnalyzer(
            parsers={'python': PythonParser()},
            scorer=ImpactScorer()
        )

    @pytest.fixture
    def sample_python_file(self):
        """Create a temporary Python file for testing."""
        code = '''def undocumented_func():
    pass

def documented_func():
    """This function has documentation.

    It does something important.
    """
    if True:
        pass
    return True
'''
        # Create a dedicated temp directory for this test
        temp_dir = tempfile.mkdtemp()
        temp_file = Path(temp_dir) / 'test_sample.py'
        temp_file.write_text(code)
        return temp_file

    def test_workflow_a_analyze_plan(self, analyzer, sample_python_file):
        """Test Workflow A: analyze → plan (no audit, complexity-only)."""
        try:
            # Step 1: Analyze
            result = analyzer.analyze(str(sample_python_file.parent))

            # Verify we found some items (we created a file with 2 functions)
            assert result.total_items >= 2, f"Expected at least 2 items, got {result.total_items}"

            # Step 2: Plan (without audit)
            with tempfile.NamedTemporaryFile(suffix='.json', delete=True) as tmp:
                audit_file = Path(tmp.name)
            # audit_file doesn't exist

            plan = generate_plan(result, audit_file=audit_file)

            # Verify plan was created
            assert plan is not None
            assert plan.total_items >= 0

            # All items should have None audit_rating (no audit was done)
            for item in result.items:
                if item.has_docs:
                    # Documented items should not have audit ratings without audit
                    assert item.audit_rating is None, f"Item {item.name} has audit_rating={item.audit_rating}, expected None"
        finally:
            # Clean up temp directory
            shutil.rmtree(sample_python_file.parent)

    def test_workflow_b_analyze_audit_plan(self, analyzer, sample_python_file):
        """Test Workflow B: analyze → audit → plan (with audit)."""
        try:
            # Step 1: Analyze
            result = analyzer.analyze(str(sample_python_file.parent))

            # Verify we found some items
            assert result.total_items >= 2, f"Expected at least 2 items, got {result.total_items}"

            # Find documented items
            documented_items = [item for item in result.items if item.has_docs]
            assert len(documented_items) >= 1, "Expected at least one documented item"

            # Step 2: Audit (simulate user rating items)
            audit = AuditResult(ratings={})
            for item in documented_items:
                # Rate as "OK" (rating=2)
                audit.set_rating(item.filepath, item.name, 2)

            # Save audit results
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp:
                audit_file = Path(tmp.name)
                save_audit_results(audit, audit_file)

            # Step 3: Plan (with audit)
            plan = generate_plan(result, audit_file=audit_file, quality_threshold=2)

            # Verify audit ratings were applied to documented items
            for item in documented_items:
                # Should have audit rating applied
                assert item.audit_rating == 2, f"Item {item.name} has audit_rating={item.audit_rating}, expected 2"

            # Verify plan includes items with rating <= threshold
            # Items with rating=2 should be in plan
            plan_names = {item.name for item in plan.items}
            for item in documented_items:
                assert item.name in plan_names, f"Item {item.name} with rating={item.audit_rating} should be in plan"

            # Clean up
            audit_file.unlink()
        finally:
            # Clean up temp directory
            shutil.rmtree(sample_python_file.parent)

    def test_audit_ratings_affect_plan_priorities(self, analyzer, sample_python_file):
        """Test that audit ratings change impact scores and plan priorities."""
        try:
            # Step 1: Analyze
            result = analyzer.analyze(str(sample_python_file.parent))

            # Verify we found some items
            assert result.total_items >= 2, f"Expected at least 2 items, got {result.total_items}"

            # Find documented items
            documented_items = [item for item in result.items if item.has_docs]

            if len(documented_items) == 0:
                pytest.skip("No documented items found in test file")

            # Save original impact scores (complexity-only)
            original_scores = {item.name: item.impact_score for item in documented_items}

            # Step 2: Create audit with poor ratings
            audit = AuditResult(ratings={})
            for item in documented_items:
                # Rate as "Terrible" (rating=1) to maximize quality penalty
                audit.set_rating(item.filepath, item.name, 1)

            # Save audit results
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp:
                audit_file = Path(tmp.name)
                save_audit_results(audit, audit_file)

            # Step 3: Plan (with audit)
            plan = generate_plan(result, audit_file=audit_file, quality_threshold=2)

            # Verify impact scores changed
            scores_changed = False
            for item in documented_items:
                if item.impact_score != original_scores[item.name]:
                    scores_changed = True
                    break

            # At least one score should have changed
            assert scores_changed, "Impact scores should change when audit ratings are applied"

            # Verify items with terrible ratings have impact scores different from original
            # (because quality penalty for rating=1 is 80, which changes the score)
            for item in documented_items:
                if item.audit_rating == 1:
                    # With rating=1, impact score formula is:
                    # 0.6 * complexity_score + 0.4 * 80 (quality penalty for terrible)
                    # This should be different from complexity-only score
                    assert item.impact_score != original_scores[item.name], \
                        f"Item {item.name} impact score should change with audit rating"

            # Clean up
            audit_file.unlink()
        finally:
            # Clean up temp directory
            shutil.rmtree(sample_python_file.parent)
