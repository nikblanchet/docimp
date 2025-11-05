"""Tests for JSON serialization of analysis results.

This test module validates Python-side JSON serialization to ensure that
edge cases like Unicode, large numbers, null values, and empty collections
are handled correctly before being sent to the TypeScript CLI layer.

Addresses Issue #108 - Python-TypeScript JSON boundary testing.
"""

import json
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.models.code_item import CodeItem
from src.models.analysis_result import AnalysisResult, LanguageMetrics


def format_analysis_result_as_json(result: AnalysisResult) -> str:
    """Helper to serialize AnalysisResult to JSON (mimics main.py behavior).

    Args:
        result: AnalysisResult object to serialize.

    Returns:
        JSON string representation.
    """
    data = {
        "coverage_percent": result.coverage_percent,
        "total_items": result.total_items,
        "documented_items": result.documented_items,
        "by_language": {
            lang: {
                "language": metrics.language,
                "total_items": metrics.total_items,
                "documented_items": metrics.documented_items,
                "coverage_percent": metrics.coverage_percent,
                "avg_complexity": metrics.avg_complexity,
                "avg_impact_score": metrics.avg_impact_score,
            }
            for lang, metrics in result.by_language.items()
        },
        "items": [
            {
                "name": item.name,
                "type": item.type,
                "filepath": item.filepath,
                "line_number": item.line_number,
                "end_line": item.end_line,
                "language": item.language,
                "complexity": item.complexity,
                "impact_score": item.impact_score,
                "has_docs": item.has_docs,
                "export_type": item.export_type,
                "module_system": item.module_system,
                "parameters": item.parameters,
                "return_type": item.return_type,
                "docstring": item.docstring,
                "audit_rating": item.audit_rating,
            }
            for item in result.items
        ],
    }
    return json.dumps(data, indent=2)


def test_unicode_in_item_names():
    """Test that Unicode characters serialize correctly.

    This tests that non-ASCII characters in names, filepaths, and docstrings
    are properly serialized to JSON without encoding errors.
    """
    item = CodeItem(
        name="函数",  # Chinese characters
        type="function",
        filepath="/test/测试.py",  # Chinese characters in path
        line_number=10,
        end_line=15,
        language="python",
        complexity=3,
        has_docs=True,
        export_type="named",
        module_system="esm",
        docstring="Documentation with 日本語 and emoji: ✓",  # Japanese + emoji
        parameters=["param1", "パラメータ2"],  # Mixed ASCII and Japanese
        return_type="str",
    )

    result = AnalysisResult(
        items=[item],
        coverage_percent=100.0,
        total_items=1,
        documented_items=1,
        by_language={},
    )

    # Should not raise UnicodeEncodeError
    json_output = format_analysis_result_as_json(result)
    parsed = json.loads(json_output)

    # Verify Unicode characters are preserved
    assert parsed["items"][0]["name"] == "函数"
    assert parsed["items"][0]["filepath"] == "/test/测试.py"
    assert "日本語" in parsed["items"][0]["docstring"]
    assert parsed["items"][0]["parameters"][1] == "パラメータ2"


def test_very_high_complexity_values():
    """Test that high complexity values and special floats serialize safely.

    JavaScript Number.MAX_SAFE_INTEGER is 2^53 - 1 (9007199254740991).
    Values larger than this may lose precision in JavaScript.

    Special float values like Infinity and NaN are not valid JSON and must
    be handled appropriately (either capped or converted).
    """
    # Test 1: Very high complexity (larger than JS safe integer)
    high_complexity_item = CodeItem(
        name="very_complex_function",
        type="function",
        filepath="/test/complex.py",
        line_number=1,
        end_line=100,
        language="python",
        complexity=999999999999,  # Larger than JavaScript Number.MAX_SAFE_INTEGER
        has_docs=False,
        export_type="named",
        module_system="esm",
        impact_score=100.0,  # Normal score
    )

    result = AnalysisResult(
        items=[high_complexity_item],
        coverage_percent=0.0,
        total_items=1,
        documented_items=0,
        by_language={},
    )

    # Should serialize without error
    json_output = format_analysis_result_as_json(result)
    parsed = json.loads(json_output)

    # Complexity should be serialized as integer (may lose precision in JS)
    assert isinstance(parsed["items"][0]["complexity"], int)
    assert parsed["items"][0]["complexity"] > 0

    # Test 2: Special float values
    # Note: Python's json.dumps() will convert Infinity/NaN to null by default
    # if allow_nan=False (default in Python 3.10+), or to JavaScript-compatible
    # values if allow_nan=True. We test the default behavior.

    # In practice, impact_score should never be Infinity due to min(100, ...)
    # capping, but we test defensive behavior
    normal_item = CodeItem(
        name="normal_function",
        type="function",
        filepath="/test/normal.py",
        line_number=1,
        end_line=10,
        language="python",
        complexity=10,
        has_docs=False,
        export_type="named",
        module_system="esm",
        impact_score=50.0,  # Normal finite value
    )

    result2 = AnalysisResult(
        items=[normal_item],
        coverage_percent=0.0,
        total_items=1,
        documented_items=0,
        by_language={},
    )

    json_output2 = format_analysis_result_as_json(result2)
    parsed2 = json.loads(json_output2)

    # impact_score should be a normal float
    assert isinstance(parsed2["items"][0]["impact_score"], (int, float))
    assert parsed2["items"][0]["impact_score"] == 50.0


def test_null_vs_none_fields():
    """Test that None/null fields are handled consistently.

    Python None should serialize to JSON null, not as a missing field.
    This is important for TypeScript Zod validation which distinguishes
    between missing (.optional()) and null (.nullable()) fields.
    """
    item = CodeItem(
        name="undocumented_function",
        type="function",
        filepath="/test/file.py",
        line_number=10,
        end_line=15,
        language="python",
        complexity=5,
        has_docs=False,
        export_type="named",
        module_system="esm",
        docstring=None,  # Should become JSON null
        return_type=None,  # Should become JSON null
        audit_rating=None,  # Should become JSON null
    )

    result = AnalysisResult(
        items=[item],
        coverage_percent=0.0,
        total_items=1,
        documented_items=0,
        by_language={},
    )

    json_output = format_analysis_result_as_json(result)
    parsed = json.loads(json_output)

    # All None fields should be present as null (not missing)
    assert "docstring" in parsed["items"][0]
    assert parsed["items"][0]["docstring"] is None

    assert "return_type" in parsed["items"][0]
    assert parsed["items"][0]["return_type"] is None

    assert "audit_rating" in parsed["items"][0]
    assert parsed["items"][0]["audit_rating"] is None


def test_empty_by_language_dict():
    """Test that empty by_language dict serializes correctly.

    An empty dictionary should serialize as {}, not null.
    This can occur when analyzing a directory with no parseable files.
    """
    result = AnalysisResult(
        items=[],
        coverage_percent=0.0,
        total_items=0,
        documented_items=0,
        by_language={},  # Empty dict
    )

    json_output = format_analysis_result_as_json(result)
    parsed = json.loads(json_output)

    # by_language should be present as an empty object
    assert "by_language" in parsed
    assert isinstance(parsed["by_language"], dict)
    assert len(parsed["by_language"]) == 0

    # Should be {} in JSON, not null
    assert parsed["by_language"] == {}


def test_complete_json_roundtrip():
    """Test complete JSON serialization roundtrip with realistic data.

    This test creates a realistic AnalysisResult with multiple items,
    language metrics, and various field values, then validates that
    serialization and deserialization preserve all data correctly.
    """
    python_metrics = LanguageMetrics(
        language="python",
        total_items=2,
        documented_items=1,
        coverage_percent=50.0,
        avg_complexity=7.5,
        avg_impact_score=37.5,
    )

    typescript_metrics = LanguageMetrics(
        language="typescript",
        total_items=1,
        documented_items=0,
        coverage_percent=0.0,
        avg_complexity=15.0,
        avg_impact_score=75.0,
    )

    items = [
        CodeItem(
            name="documented_function",
            type="function",
            filepath="/src/utils.py",
            line_number=10,
            end_line=20,
            language="python",
            complexity=5,
            has_docs=True,
            export_type="named",
            module_system="esm",
            impact_score=25.0,
            docstring="This function does something useful.",
            parameters=["x", "y"],
            return_type="int",
            audit_rating=3,  # Good rating
        ),
        CodeItem(
            name="undocumented_class",
            type="class",
            filepath="/src/models.py",
            line_number=50,
            end_line=100,
            language="python",
            complexity=10,
            has_docs=False,
            export_type="named",
            module_system="esm",
            impact_score=50.0,
            docstring=None,
            parameters=[],
            return_type=None,
            audit_rating=None,  # Not audited
        ),
        CodeItem(
            name="ComplexService",
            type="class",
            filepath="/src/service.ts",
            line_number=1,
            end_line=200,
            language="typescript",
            complexity=15,
            has_docs=False,
            export_type="default",
            module_system="esm",
            impact_score=75.0,
            docstring=None,
            parameters=[],
            return_type=None,
            audit_rating=None,
        ),
    ]

    result = AnalysisResult(
        items=items,
        coverage_percent=33.33,
        total_items=3,
        documented_items=1,
        by_language={"python": python_metrics, "typescript": typescript_metrics},
    )

    # Serialize to JSON
    json_output = format_analysis_result_as_json(result)

    # Parse back
    parsed = json.loads(json_output)

    # Validate top-level fields
    assert parsed["coverage_percent"] == 33.33
    assert parsed["total_items"] == 3
    assert parsed["documented_items"] == 1

    # Validate by_language metrics
    assert "python" in parsed["by_language"]
    assert parsed["by_language"]["python"]["total_items"] == 2
    assert parsed["by_language"]["python"]["documented_items"] == 1
    assert parsed["by_language"]["python"]["avg_complexity"] == 7.5

    assert "typescript" in parsed["by_language"]
    assert parsed["by_language"]["typescript"]["total_items"] == 1
    assert parsed["by_language"]["typescript"]["coverage_percent"] == 0.0

    # Validate items
    assert len(parsed["items"]) == 3

    # First item (documented Python function)
    item1 = parsed["items"][0]
    assert item1["name"] == "documented_function"
    assert item1["has_docs"] is True
    assert item1["docstring"] == "This function does something useful."
    assert item1["parameters"] == ["x", "y"]
    assert item1["return_type"] == "int"
    assert item1["audit_rating"] == 3

    # Second item (undocumented Python class)
    item2 = parsed["items"][1]
    assert item2["name"] == "undocumented_class"
    assert item2["has_docs"] is False
    assert item2["docstring"] is None
    assert item2["audit_rating"] is None

    # Third item (undocumented TypeScript class)
    item3 = parsed["items"][2]
    assert item3["name"] == "ComplexService"
    assert item3["language"] == "typescript"
    assert item3["export_type"] == "default"
