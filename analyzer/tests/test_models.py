"""Tests for data models (CodeItem, AnalysisResult, LanguageMetrics)."""

import json
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.models.code_item import CodeItem
from src.models.analysis_result import AnalysisResult, LanguageMetrics


def test_code_item_creation():
    """Test basic CodeItem creation with required fields."""
    item = CodeItem(
        name='test_func',
        type='function',
        filepath='test.py',
        line_number=10,
        end_line=15,
        language='python',
        complexity=5,
        has_docs=False,
        export_type='named',
        module_system='esm'
    )

    assert item.name == 'test_func'
    assert item.type == 'function'
    assert item.language == 'python'
    assert item.complexity == 5
    assert item.has_docs is False
    assert item.export_type == 'named'
    assert item.module_system == 'esm'


def test_code_item_defaults():
    """Test that optional fields have correct default values."""
    item = CodeItem(
        name='minimal_func',
        type='function',
        filepath='test.py',
        line_number=5,
        end_line=10,
        language='python',
        complexity=2,
        has_docs=False,
        export_type='internal',
        module_system='unknown'
    )

    # Test defaults
    assert item.parameters == []
    assert item.return_type is None
    assert item.docstring is None
    assert item.impact_score == 0.0
    assert item.audit_rating is None


def test_code_item_with_all_fields():
    """Test CodeItem with all optional fields populated."""
    item = CodeItem(
        name='complete_func',
        type='function',
        filepath='test.py',
        line_number=10,
        end_line=15,
        language='python',
        complexity=8,
        has_docs=True,
        export_type='named',
        module_system='esm',
        parameters=['param1', 'param2'],
        return_type='int',
        docstring='This function does something.',
        impact_score=60.0,
        audit_rating=3
    )

    assert item.parameters == ['param1', 'param2']
    assert item.return_type == 'int'
    assert item.docstring == 'This function does something.'
    assert item.impact_score == 60.0
    assert item.audit_rating == 3


def test_code_item_json_serialization():
    """Test that CodeItem serializes to JSON correctly."""
    item = CodeItem(
        name='test_func',
        type='function',
        filepath='test.py',
        line_number=10,
        end_line=15,
        language='python',
        complexity=5,
        has_docs=False,
        export_type='named',
        module_system='esm',
        impact_score=75
    )

    # Convert to dict
    item_dict = item.to_dict()
    assert isinstance(item_dict, dict)
    assert item_dict['name'] == 'test_func'
    assert item_dict['complexity'] == 5
    assert item_dict['impact_score'] == 75

    # Ensure it's JSON serializable
    item_json = json.dumps(item_dict)
    assert isinstance(item_json, str)

    # Deserialize and verify
    parsed = json.loads(item_json)
    assert parsed['name'] == 'test_func'
    assert parsed['parameters'] == []
    assert parsed['return_type'] is None


def test_language_metrics_creation():
    """Test LanguageMetrics creation and serialization."""
    metrics = LanguageMetrics(
        language='python',
        total_items=10,
        documented_items=7,
        coverage_percent=70.0,
        avg_complexity=5.5,
        avg_impact_score=42.0
    )

    assert metrics.language == 'python'
    assert metrics.total_items == 10
    assert metrics.documented_items == 7
    assert metrics.coverage_percent == 70.0
    assert metrics.avg_complexity == 5.5
    assert metrics.avg_impact_score == 42.0

    # Test serialization
    metrics_dict = metrics.to_dict()
    assert metrics_dict['language'] == 'python'
    assert metrics_dict['coverage_percent'] == 70.0


def test_analysis_result_creation():
    """Test AnalysisResult with items and metrics."""
    items = [
        CodeItem(
            name='func1',
            type='function',
            filepath='test.py',
            line_number=10,
            end_line=15,
            language='python',
            complexity=5,
            has_docs=True,
            export_type='internal',
            module_system='unknown',
            impact_score=25
        ),
        CodeItem(
            name='func2',
            type='function',
            filepath='test.js',
            line_number=20,
            end_line=25,
            language='javascript',
            complexity=10,
            has_docs=False,
            export_type='named',
            module_system='esm',
            impact_score=50
        ),
    ]

    result = AnalysisResult(
        items=items,
        coverage_percent=50.0,
        total_items=2,
        documented_items=1
    )

    assert len(result.items) == 2
    assert result.coverage_percent == 50.0
    assert result.total_items == 2
    assert result.documented_items == 1


def test_analysis_result_get_undocumented():
    """Test filtering undocumented items."""
    items = [
        CodeItem(
            name='documented',
            type='function',
            filepath='test.py',
            line_number=1,
            end_line=5,
            language='python',
            complexity=1,
            has_docs=True,
            export_type='internal',
            module_system='unknown'
        ),
        CodeItem(
            name='undocumented',
            type='function',
            filepath='test.py',
            line_number=2,
            end_line=7,
            language='python',
            complexity=2,
            has_docs=False,
            export_type='internal',
            module_system='unknown'
        ),
    ]

    result = AnalysisResult(
        items=items,
        coverage_percent=50.0,
        total_items=2,
        documented_items=1
    )

    undocumented = result.get_undocumented_items()
    assert len(undocumented) == 1
    assert undocumented[0].name == 'undocumented'


def test_analysis_result_get_by_language():
    """Test filtering items by language."""
    items = [
        CodeItem(
            name='py_func',
            type='function',
            filepath='test.py',
            line_number=1,
            end_line=5,
            language='python',
            complexity=1,
            has_docs=False,
            export_type='internal',
            module_system='unknown'
        ),
        CodeItem(
            name='js_func',
            type='function',
            filepath='test.js',
            line_number=1,
            end_line=5,
            language='javascript',
            complexity=1,
            has_docs=False,
            export_type='named',
            module_system='esm'
        ),
    ]

    result = AnalysisResult(
        items=items,
        coverage_percent=0.0,
        total_items=2,
        documented_items=0
    )

    py_items = result.get_items_by_language('python')
    assert len(py_items) == 1
    assert py_items[0].name == 'py_func'

    js_items = result.get_items_by_language('javascript')
    assert len(js_items) == 1
    assert js_items[0].name == 'js_func'


def test_analysis_result_top_priority():
    """Test getting top priority items by impact score."""
    items = [
        CodeItem(
            name='low_priority',
            type='function',
            filepath='test.py',
            line_number=1,
            end_line=5,
            language='python',
            complexity=1,
            has_docs=False,
            export_type='internal',
            module_system='unknown',
            impact_score=10.0
        ),
        CodeItem(
            name='high_priority',
            type='function',
            filepath='test.py',
            line_number=2,
            end_line=7,
            language='python',
            complexity=10,
            has_docs=False,
            export_type='internal',
            module_system='unknown',
            impact_score=90.0
        ),
        CodeItem(
            name='medium_priority',
            type='function',
            filepath='test.py',
            line_number=3,
            end_line=8,
            language='python',
            complexity=5,
            has_docs=False,
            export_type='internal',
            module_system='unknown',
            impact_score=50.0
        ),
    ]

    result = AnalysisResult(
        items=items,
        coverage_percent=0.0,
        total_items=3,
        documented_items=0
    )

    top_items = result.get_top_priority_items(limit=2)
    assert len(top_items) == 2
    assert top_items[0].name == 'high_priority'
    assert top_items[1].name == 'medium_priority'
    assert top_items[0].impact_score > top_items[1].impact_score


def test_analysis_result_json_serialization():
    """Test full AnalysisResult JSON serialization."""
    items = [
        CodeItem(
            name='func1',
            type='function',
            filepath='test.py',
            line_number=1,
            end_line=5,
            language='python',
            complexity=5,
            has_docs=True,
            export_type='internal',
            module_system='unknown',
            impact_score=25.0
        ),
    ]

    py_metrics = LanguageMetrics(
        language='python',
        total_items=1,
        documented_items=1,
        coverage_percent=100.0,
        avg_complexity=5.0,
        avg_impact_score=25.0
    )

    result = AnalysisResult(
        items=items,
        coverage_percent=100.0,
        total_items=1,
        documented_items=1,
        by_language={'python': py_metrics}
    )

    # Serialize to JSON
    result_dict = result.to_dict()
    result_json = json.dumps(result_dict)

    # Deserialize and verify
    parsed = json.loads(result_json)
    assert parsed['coverage_percent'] == 100.0
    assert parsed['total_items'] == 1
    assert len(parsed['items']) == 1
    assert parsed['items'][0]['name'] == 'func1'
    assert 'python' in parsed['by_language']
    assert parsed['by_language']['python']['coverage_percent'] == 100.0
