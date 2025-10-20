"""Tests for the impact scoring engine."""

import sys
from pathlib import Path

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.scoring.impact_scorer import ImpactScorer
from src.models.code_item import CodeItem


class TestImpactScorer:
    """Test suite for ImpactScorer class."""

    @pytest.fixture
    def scorer(self):
        """Return a default ImpactScorer instance."""
        return ImpactScorer()

    @pytest.fixture
    def simple_item(self):
        """Return a simple CodeItem with low complexity."""
        return CodeItem(
            name='add',
            type='function',
            filepath='test.py',
            line_number=1,
            end_line=5,
            language='python',
            complexity=1,
            has_docs=False,
            export_type='internal',
            module_system='unknown'
        )

    @pytest.fixture
    def complex_item(self):
        """Return a complex CodeItem with high complexity."""
        return CodeItem(
            name='process_payment',
            type='function',
            filepath='service.py',
            line_number=10,
            end_line=25,
            language='python',
            complexity=15,
            has_docs=False,
            export_type='internal',
            module_system='unknown'
        )

    def test_scorer_initialization_valid_weights(self):
        """Test scorer accepts valid weight configurations."""
        scorer = ImpactScorer(complexity_weight=0.7, quality_weight=0.3)
        assert scorer.complexity_weight == 0.7
        assert scorer.quality_weight == 0.3

    def test_scorer_initialization_invalid_weights(self):
        """Test scorer rejects weights that don't sum to 1.0."""
        with pytest.raises(ValueError, match="Weights must sum to 1.0"):
            ImpactScorer(complexity_weight=0.5, quality_weight=0.6)

    def test_basic_complexity_scoring(self, scorer, simple_item, complex_item):
        """Test basic complexity-based scoring without audit data."""
        simple_score = scorer.calculate_score(simple_item)
        complex_score = scorer.calculate_score(complex_item)

        # Verify formula: min(100, complexity * 5)
        assert simple_score == 5.0  # 1 * 5
        assert complex_score == 75.0  # 15 * 5

    def test_score_range(self, scorer, simple_item, complex_item):
        """Test that scores are always in range 0-100."""
        simple_score = scorer.calculate_score(simple_item)
        complex_score = scorer.calculate_score(complex_item)

        assert 0 <= simple_score <= 100
        assert 0 <= complex_score <= 100

    def test_score_monotonicity(self, scorer, simple_item, complex_item):
        """Test that higher complexity yields higher scores."""
        simple_score = scorer.calculate_score(simple_item)
        complex_score = scorer.calculate_score(complex_item)

        assert complex_score > simple_score

    def test_max_complexity_capped_at_100(self, scorer):
        """Test that very high complexity is capped at 100."""
        very_complex = CodeItem(
            name='monster_function',
            type='function',
            filepath='legacy.py',
            line_number=1,
            end_line=50,
            language='python',
            complexity=50,  # Would be 250 without cap
            has_docs=False,
            export_type='internal',
            module_system='unknown'
        )

        score = scorer.calculate_score(very_complex)
        assert score == 100.0

    def test_audit_rating_no_docs(self, scorer, complex_item):
        """Test scoring with audit rating indicating no docs."""
        complex_item.audit_rating = 0  # No docs
        score = scorer.calculate_score(complex_item)

        # Formula: 0.6 * 75 + 0.4 * 100 = 45 + 40 = 85
        expected = 0.6 * 75.0 + 0.4 * 100.0
        assert score == expected

    def test_audit_rating_terrible(self, scorer, complex_item):
        """Test scoring with terrible documentation."""
        complex_item.audit_rating = 1  # Terrible
        score = scorer.calculate_score(complex_item)

        # Formula: 0.6 * 75 + 0.4 * 80 = 45 + 32 = 77
        expected = 0.6 * 75.0 + 0.4 * 80.0
        assert score == expected

    def test_audit_rating_ok(self, scorer, complex_item):
        """Test scoring with OK documentation."""
        complex_item.audit_rating = 2  # OK
        score = scorer.calculate_score(complex_item)

        # Formula: 0.6 * 75 + 0.4 * 40 = 45 + 16 = 61
        expected = 0.6 * 75.0 + 0.4 * 40.0
        assert score == expected

    def test_audit_rating_good(self, scorer, complex_item):
        """Test scoring with good documentation."""
        complex_item.audit_rating = 3  # Good
        score = scorer.calculate_score(complex_item)

        # Formula: 0.6 * 75 + 0.4 * 20 = 45 + 8 = 53
        expected = 0.6 * 75.0 + 0.4 * 20.0
        assert score == expected

    def test_audit_rating_excellent(self, scorer, complex_item):
        """Test scoring with excellent documentation."""
        complex_item.audit_rating = 4  # Excellent
        score = scorer.calculate_score(complex_item)

        # Formula: 0.6 * 75 + 0.4 * 0 = 45 + 0 = 45
        expected = 0.6 * 75.0 + 0.4 * 0.0
        assert score == expected

    def test_custom_weights(self, complex_item):
        """Test scorer with custom weights."""
        scorer = ImpactScorer(complexity_weight=0.8, quality_weight=0.2)
        complex_item.audit_rating = 1  # Terrible

        score = scorer.calculate_score(complex_item)

        # Formula: 0.8 * 75 + 0.2 * 80 = 60 + 16 = 76
        expected = 0.8 * 75.0 + 0.2 * 80.0
        assert score == expected

    def test_quality_penalty_mapping(self, scorer):
        """Test that quality penalties are correctly mapped."""
        assert scorer._get_quality_penalty(None) == 100.0
        assert scorer._get_quality_penalty(0) == 100.0
        assert scorer._get_quality_penalty(1) == 80.0
        assert scorer._get_quality_penalty(2) == 40.0
        assert scorer._get_quality_penalty(3) == 20.0
        assert scorer._get_quality_penalty(4) == 0.0
