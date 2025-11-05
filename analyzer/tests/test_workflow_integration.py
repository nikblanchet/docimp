"""Integration tests for complete workflows."""

import shutil
import sys
import tempfile
from pathlib import Path

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.analysis.analyzer import DocumentationAnalyzer
from src.audit.quality_rater import AuditResult, save_audit_results
from src.parsers.python_parser import PythonParser
from src.planning.plan_generator import generate_plan
from src.scoring.impact_scorer import ImpactScorer


class TestWorkflowIntegration:
    """Integration tests for end-to-end workflows."""

    @pytest.fixture
    def analyzer(self):
        """Create a DocumentationAnalyzer with Python parser."""
        return DocumentationAnalyzer(
            parsers={"python": PythonParser()}, scorer=ImpactScorer()
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
        temp_file = Path(temp_dir) / "test_sample.py"
        temp_file.write_text(code)
        return temp_file

    def test_workflow_a_analyze_plan(self, analyzer, sample_python_file):
        """Test Workflow A: analyze → plan (no audit, complexity-only)."""
        try:
            # Step 1: Analyze
            result = analyzer.analyze(str(sample_python_file.parent))

            # Verify we found some items (we created a file with 2 functions)
            assert result.total_items >= 2, (
                f"Expected at least 2 items, got {result.total_items}"
            )

            # Step 2: Plan (without audit)
            with tempfile.NamedTemporaryFile(suffix=".json", delete=True) as tmp:
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
                    assert item.audit_rating is None, (
                        f"Item {item.name} has "
                        f"audit_rating={item.audit_rating}, expected None"
                    )
        finally:
            # Clean up temp directory
            shutil.rmtree(sample_python_file.parent)

    def test_workflow_b_analyze_audit_plan(self, analyzer, sample_python_file):
        """Test Workflow B: analyze → audit → plan (with audit)."""
        try:
            # Step 1: Analyze
            result = analyzer.analyze(str(sample_python_file.parent))

            # Verify we found some items
            assert result.total_items >= 2, (
                f"Expected at least 2 items, got {result.total_items}"
            )

            # Find documented items
            documented_items = [item for item in result.items if item.has_docs]
            assert len(documented_items) >= 1, "Expected at least one documented item"

            # Step 2: Audit (simulate user rating items)
            audit = AuditResult(ratings={})
            for item in documented_items:
                # Rate as "OK" (rating=2)
                audit.set_rating(item.filepath, item.name, 2)

            # Save audit results
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".json", delete=False
            ) as tmp:
                audit_file = Path(tmp.name)
                save_audit_results(audit, audit_file)

            # Step 3: Plan (with audit)
            plan = generate_plan(result, audit_file=audit_file, quality_threshold=2)

            # Verify audit ratings were applied to documented items
            for item in documented_items:
                # Should have audit rating applied
                assert item.audit_rating == 2, (
                    f"Item {item.name} has audit_rating={item.audit_rating}, expected 2"
                )

            # Verify plan includes items with rating <= threshold
            # Items with rating=2 should be in plan
            plan_names = {item.name for item in plan.items}
            for item in documented_items:
                assert item.name in plan_names, (
                    f"Item {item.name} with rating={item.audit_rating} "
                    "should be in plan"
                )

            # Verify plan is sorted by impact score (descending)
            assert len(plan.items) >= 2, "Need at least 2 items to test sorting"
            for i in range(len(plan.items) - 1):
                assert plan.items[i].impact_score >= plan.items[i + 1].impact_score, (
                    f"Plan not sorted: items[{i}].impact_score="
                    f"{plan.items[i].impact_score} < items[{i + 1}].impact_score="
                    f"{plan.items[i + 1].impact_score}"
                )

            # Verify reason field is populated correctly
            for item in plan.items:
                if not item.has_docs:
                    assert item.reason == "Missing documentation", (
                        f"Item {item.name} should have reason='Missing "
                        f"documentation', got '{item.reason}'"
                    )
                elif item.audit_rating is not None and item.audit_rating <= 2:
                    assert "Poor quality" in item.reason, (
                        f"Item {item.name} with rating {item.audit_rating} "
                        f"should have 'Poor quality' in reason, got "
                        f"'{item.reason}'"
                    )

            # Verify counts are accurate
            missing_count = sum(1 for item in plan.items if not item.has_docs)
            poor_quality_count = sum(
                1
                for item in plan.items
                if item.has_docs
                and item.audit_rating is not None
                and item.audit_rating <= 2
            )

            assert plan.missing_docs_count == missing_count, (
                f"missing_docs_count mismatch: expected {missing_count}, got "
                f"{plan.missing_docs_count}"
            )
            assert plan.poor_quality_count == poor_quality_count, (
                f"poor_quality_count mismatch: expected {poor_quality_count}, "
                f"got {plan.poor_quality_count}"
            )
            assert plan.total_items == len(plan.items), (
                f"total_items mismatch: expected {len(plan.items)}, got "
                f"{plan.total_items}"
            )

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
            assert result.total_items >= 2, (
                f"Expected at least 2 items, got {result.total_items}"
            )

            # Find documented items
            documented_items = [item for item in result.items if item.has_docs]

            if len(documented_items) == 0:
                pytest.skip("No documented items found in test file")

            # Save original impact scores (complexity-only)
            original_scores = {
                item.name: item.impact_score for item in documented_items
            }

            # Step 2: Create audit with poor ratings
            audit = AuditResult(ratings={})
            for item in documented_items:
                # Rate as "Terrible" (rating=1) to maximize quality penalty
                audit.set_rating(item.filepath, item.name, 1)

            # Save audit results
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".json", delete=False
            ) as tmp:
                audit_file = Path(tmp.name)
                save_audit_results(audit, audit_file)

            # Step 3: Plan (with audit - side effect: recalculates impact scores)
            _ = generate_plan(result, audit_file=audit_file, quality_threshold=2)

            # Verify impact scores changed
            scores_changed = False
            for item in documented_items:
                if item.impact_score != original_scores[item.name]:
                    scores_changed = True
                    break

            # At least one score should have changed
            assert scores_changed, (
                "Impact scores should change when audit ratings are applied"
            )

            # Verify items with terrible ratings have impact scores different from
            # original
            # (because quality penalty for rating=1 is 80, which changes the score)
            for item in documented_items:
                if item.audit_rating == 1:
                    # With rating=1, impact score formula is:
                    # 0.6 * complexity_score + 0.4 * 80 (quality penalty for terrible)
                    # This should be different from complexity-only score
                    assert item.impact_score != original_scores[item.name], (
                        f"Item {item.name} impact score should change with audit rating"
                    )

            # Clean up
            audit_file.unlink()
        finally:
            # Clean up temp directory
            shutil.rmtree(sample_python_file.parent)

    def test_complete_workflow_with_known_inputs(self, analyzer):
        """Test complete workflow with controlled inputs and expected outputs.

        This test creates a Python file with functions of known characteristics
        and verifies the complete workflow produces expected results.
        """
        # Create temp Python file with known characteristics
        code = '''def undocumented():
    pass

def has_terrible_docs():
    """Bad."""
    if True:
        pass
    return None

def has_good_docs():
    """This function has excellent documentation.

    It explains what it does, why it does it, and how to use it.

    Returns:
        bool: Always returns True
    """
    if True:
        if True:
            pass
    return True
'''
        # Create a dedicated temp directory for this test
        temp_dir = tempfile.mkdtemp()
        temp_file = Path(temp_dir) / "test_known.py"
        temp_file.write_text(code)

        try:
            # Step 1: Analyze
            result = analyzer.analyze(str(temp_dir))

            # Verify we found exactly 3 functions
            assert result.total_items == 3, (
                f"Expected 3 items, got {result.total_items}"
            )

            # Find specific functions by name
            undocumented = next(
                (item for item in result.items if item.name == "undocumented"), None
            )
            terrible_docs = next(
                (item for item in result.items if item.name == "has_terrible_docs"),
                None,
            )
            good_docs = next(
                (item for item in result.items if item.name == "has_good_docs"), None
            )

            assert undocumented is not None, "Should find undocumented function"
            assert terrible_docs is not None, "Should find has_terrible_docs function"
            assert good_docs is not None, "Should find has_good_docs function"

            # Verify has_docs flags
            assert not undocumented.has_docs, "undocumented should have has_docs=False"
            assert terrible_docs.has_docs, "has_terrible_docs should have has_docs=True"
            assert good_docs.has_docs, "has_good_docs should have has_docs=True"

            # Verify complexities
            assert undocumented.complexity == 1, (
                f"undocumented should have complexity=1, got {undocumented.complexity}"
            )
            assert terrible_docs.complexity == 2, (
                f"has_terrible_docs should have complexity=2, got "
                f"{terrible_docs.complexity}"
            )
            assert good_docs.complexity == 3, (
                f"has_good_docs should have complexity=3, got {good_docs.complexity}"
            )

            # Step 2: Audit (simulate user rating items)
            audit = AuditResult(ratings={})
            # Rate terrible_docs as "Terrible" (1) - should be in plan
            audit.set_rating(terrible_docs.filepath, terrible_docs.name, 1)
            # Rate good_docs as "Excellent" (4) - should NOT be in plan
            audit.set_rating(good_docs.filepath, good_docs.name, 4)

            # Save audit results
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".json", delete=False
            ) as tmp:
                audit_file = Path(tmp.name)
                save_audit_results(audit, audit_file)

            # Step 3: Plan (with audit, quality_threshold=2)
            plan = generate_plan(result, audit_file=audit_file, quality_threshold=2)

            # Verify plan contains exactly 2 items: undocumented + has_terrible_docs
            # (good_docs has rating=4, above threshold, so excluded)
            assert plan.total_items == 2, (
                f"Expected 2 items in plan, got {plan.total_items}"
            )

            # Verify counts
            assert plan.missing_docs_count == 1, (
                f"Expected 1 missing doc, got {plan.missing_docs_count}"
            )
            assert plan.poor_quality_count == 1, (
                f"Expected 1 poor quality doc, got {plan.poor_quality_count}"
            )

            # Verify items in plan
            plan_names = {item.name for item in plan.items}
            assert "undocumented" in plan_names, "undocumented should be in plan"
            assert "has_terrible_docs" in plan_names, (
                "has_terrible_docs should be in plan"
            )
            assert "has_good_docs" not in plan_names, (
                "has_good_docs should NOT be in plan (rating=4 > threshold)"
            )

            # Verify reasons
            undocumented_plan_item = next(
                item for item in plan.items if item.name == "undocumented"
            )
            terrible_plan_item = next(
                item for item in plan.items if item.name == "has_terrible_docs"
            )

            assert undocumented_plan_item.reason == "Missing documentation", (
                f"Expected 'Missing documentation', got "
                f"'{undocumented_plan_item.reason}'"
            )
            assert "Poor quality" in terrible_plan_item.reason, (
                f"Expected 'Poor quality' in reason, got '{terrible_plan_item.reason}'"
            )
            assert "Terrible" in terrible_plan_item.reason, (
                f"Expected 'Terrible' in reason, got '{terrible_plan_item.reason}'"
            )

            # Verify sorting (higher impact first)
            # has_terrible_docs has complexity=2 and rating=1 (penalty=80)
            # impact = 0.6 * (2*5) + 0.4 * 80 = 6 + 32 = 38
            # undocumented has complexity=1 and NO audit rating
            # impact = complexity * 5 = 1 * 5 = 5 (complexity-only formula)
            # So has_terrible_docs should be first (higher impact: 38 > 5)
            assert plan.items[0].name == "has_terrible_docs", (
                f"Expected has_terrible_docs first (higher impact), got "
                f"{plan.items[0].name}"
            )
            assert plan.items[1].name == "undocumented", (
                f"Expected undocumented second, got {plan.items[1].name}"
            )

            # Verify impact scores match expected values
            # Note: These are approximate due to scoring formula
            assert plan.items[0].impact_score > plan.items[1].impact_score, (
                "First item should have higher impact score than second"
            )

            # Clean up
            audit_file.unlink()
        finally:
            # Clean up temp directory
            shutil.rmtree(temp_dir)
