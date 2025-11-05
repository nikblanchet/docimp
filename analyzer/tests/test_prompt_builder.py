"""
Tests for PromptBuilder functionality including all style guide variants.
"""

import sys
from pathlib import Path

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.claude.prompt_builder import PromptBuilder


class TestPromptBuilderInitialization:
    """Test PromptBuilder initialization and validation."""

    def test_default_initialization(self):
        """Test PromptBuilder with default values."""
        builder = PromptBuilder()
        assert builder.style_guide == "google"
        assert builder.tone == "concise"

    def test_custom_initialization(self):
        """Test PromptBuilder with custom values."""
        builder = PromptBuilder(style_guide="jsdoc-vanilla", tone="detailed")
        assert builder.style_guide == "jsdoc-vanilla"
        assert builder.tone == "detailed"

    def test_invalid_style_guide_raises_error(self):
        """Test that invalid style guide raises ValueError."""
        with pytest.raises(ValueError, match="Unsupported style guide"):
            PromptBuilder(style_guide="invalid-style")

    def test_invalid_tone_raises_error(self):
        """Test that invalid tone raises ValueError."""
        with pytest.raises(ValueError, match="Unsupported tone"):
            PromptBuilder(tone="invalid-tone")


class TestPythonStyleGuides:
    """Test Python style guide variants."""

    def test_google_style(self):
        """Test Google style guide for Python."""
        builder = PromptBuilder(style_guide="google", tone="concise")
        prompt = builder.build_prompt(
            code="def add(a, b):\n    return a + b",
            item_name="add",
            item_type="function",
            language="python",
        )

        assert "Google" in prompt
        assert "python" in prompt
        assert "Args:" in prompt
        assert "Returns:" in prompt
        assert "do NOT include the triple-quote delimiters" in prompt

    def test_numpy_rest_style(self):
        """Test NumPy + reST style guide for Python."""
        builder = PromptBuilder(style_guide="numpy-rest", tone="concise")
        prompt = builder.build_prompt(
            code="def add(a, b):\n    return a + b",
            item_name="add",
            item_type="function",
            language="python",
        )

        assert "NumPy + reST" in prompt
        assert "python" in prompt
        assert "Parameters" in prompt
        assert "Returns" in prompt
        assert "reStructuredText markup" in prompt
        assert "``code``" in prompt

    def test_numpy_markdown_style(self):
        """Test NumPy + Markdown style guide for Python."""
        builder = PromptBuilder(style_guide="numpy-markdown", tone="concise")
        prompt = builder.build_prompt(
            code="def add(a, b):\n    return a + b",
            item_name="add",
            item_type="function",
            language="python",
        )

        assert "NumPy + Markdown" in prompt
        assert "python" in prompt
        assert "Parameters" in prompt
        assert "Returns" in prompt
        assert "Markdown markup" in prompt
        assert "`code`" in prompt

    def test_sphinx_style(self):
        """Test Sphinx/reST style guide for Python."""
        builder = PromptBuilder(style_guide="sphinx", tone="concise")
        prompt = builder.build_prompt(
            code="def add(a, b):\n    return a + b",
            item_name="add",
            item_type="function",
            language="python",
        )

        assert "Pure reST (Sphinx)" in prompt
        assert "python" in prompt
        assert ":param" in prompt
        assert ":return:" in prompt
        assert "do NOT include the triple-quote delimiters" in prompt


class TestJavaScriptStyleGuides:
    """Test JavaScript style guide variants."""

    def test_jsdoc_vanilla_style(self):
        """Test vanilla JSDoc style guide for JavaScript."""
        builder = PromptBuilder(style_guide="jsdoc-vanilla", tone="concise")
        prompt = builder.build_prompt(
            code="function add(a, b) { return a + b; }",
            item_name="add",
            item_type="function",
            language="javascript",
        )

        assert "JSDoc (Vanilla)" in prompt
        assert "javascript" in prompt
        assert "@param" in prompt
        assert "@returns" in prompt
        assert "@returns (not @return)" in prompt

    def test_jsdoc_google_style(self):
        """Test Google JSDoc style guide for JavaScript."""
        builder = PromptBuilder(style_guide="jsdoc-google", tone="concise")
        prompt = builder.build_prompt(
            code="function add(a, b) { return a + b; }",
            item_name="add",
            item_type="function",
            language="javascript",
        )

        assert "Google JSDoc" in prompt
        assert "javascript" in prompt
        assert "@param" in prompt
        assert "@return" in prompt
        assert "@return (not @returns)" in prompt
        assert "End descriptions with periods" in prompt
        assert "No hyphens after parameter names" in prompt

    def test_jsdoc_closure_style(self):
        """Test Closure JSDoc style guide for JavaScript."""
        builder = PromptBuilder(style_guide="jsdoc-closure", tone="concise")
        prompt = builder.build_prompt(
            code="function add(a, b) { return a + b; }",
            item_name="add",
            item_type="function",
            language="javascript",
        )

        assert "Closure (JSDoc/Closure)" in prompt
        assert "javascript" in prompt
        assert "@param" in prompt
        assert "@return" in prompt
        assert "@public" in prompt
        assert "@public, @private, or @protected annotations" in prompt


class TestTypeScriptStyleGuides:
    """Test TypeScript style guide variants."""

    def test_tsdoc_typedoc_style(self):
        """Test TSDoc/TypeDoc style guide for TypeScript."""
        builder = PromptBuilder(style_guide="tsdoc-typedoc", tone="concise")
        prompt = builder.build_prompt(
            code="function add(a: number, b: number): number { return a + b; }",
            item_name="add",
            item_type="function",
            language="typescript",
        )

        assert "TSDoc (TypeDoc)" in prompt
        assert "typescript" in prompt
        assert "@param" in prompt
        assert "@returns" in prompt
        assert "hyphens after parameter names" in prompt
        assert "@remarks" in prompt
        assert "Types are inferred from TypeScript signatures" in prompt

    def test_tsdoc_aedoc_style(self):
        """Test TSDoc/AEDoc style guide for TypeScript."""
        builder = PromptBuilder(style_guide="tsdoc-aedoc", tone="concise")
        prompt = builder.build_prompt(
            code="function add(a: number, b: number): number { return a + b; }",
            item_name="add",
            item_type="function",
            language="typescript",
        )

        assert "TSDoc (API Extractor/AEDoc)" in prompt
        assert "typescript" in prompt
        assert "@param" in prompt
        assert "@returns" in prompt
        assert "hyphens after parameter names" in prompt
        assert "@public" in prompt
        assert "@public, @beta, or @internal annotations" in prompt

    def test_jsdoc_ts_style(self):
        """Test JSDoc-in-TS style guide for TypeScript."""
        builder = PromptBuilder(style_guide="jsdoc-ts", tone="concise")
        prompt = builder.build_prompt(
            code="function add(a: number, b: number): number { return a + b; }",
            item_name="add",
            item_type="function",
            language="typescript",
        )

        assert "JSDoc-in-TS" in prompt
        assert "typescript" in prompt
        assert "@param {number}" in prompt
        assert "@returns {number}" in prompt
        assert "explicit type annotations" in prompt
        assert (
            "Include {type} annotations even though TypeScript provides types" in prompt
        )


class TestToneOptions:
    """Test different tone options."""

    def test_concise_tone(self):
        """Test concise tone in prompt."""
        builder = PromptBuilder(style_guide="google", tone="concise")
        prompt = builder.build_prompt(
            code="def add(a, b):\n    return a + b",
            item_name="add",
            item_type="function",
            language="python",
        )

        assert "Concise" in prompt
        assert "brief and to the point" in prompt.lower()

    def test_detailed_tone(self):
        """Test detailed tone in prompt."""
        builder = PromptBuilder(style_guide="google", tone="detailed")
        prompt = builder.build_prompt(
            code="def add(a, b):\n    return a + b",
            item_name="add",
            item_type="function",
            language="python",
        )

        assert "Detailed" in prompt
        assert "comprehensive explanations" in prompt.lower()

    def test_friendly_tone(self):
        """Test friendly tone in prompt."""
        builder = PromptBuilder(style_guide="google", tone="friendly")
        prompt = builder.build_prompt(
            code="def add(a, b):\n    return a + b",
            item_name="add",
            item_type="function",
            language="python",
        )

        assert "Friendly" in prompt
        assert "conversational" in prompt.lower()


class TestPromptStructure:
    """Test prompt structure and required elements."""

    def test_prompt_includes_code(self):
        """Test that prompt includes the code to document."""
        builder = PromptBuilder(style_guide="google", tone="concise")
        prompt = builder.build_prompt(
            code="def add(a, b):\n    return a + b",
            item_name="add",
            item_type="function",
            language="python",
        )

        assert "def add(a, b):" in prompt
        assert "return a + b" in prompt

    def test_prompt_includes_context(self):
        """Test that prompt includes surrounding context when provided."""
        builder = PromptBuilder(style_guide="google", tone="concise")
        prompt = builder.build_prompt(
            code="def add(a, b):\n    return a + b",
            item_name="add",
            item_type="function",
            language="python",
            context="# Math utilities\nclass Calculator:\n    ...",
        )

        assert "Surrounding context:" in prompt
        assert "Math utilities" in prompt
        assert "Calculator" in prompt

    def test_prompt_includes_requirements(self):
        """Test that prompt includes documentation requirements."""
        builder = PromptBuilder(style_guide="google", tone="concise")
        prompt = builder.build_prompt(
            code="def add(a, b):\n    return a + b",
            item_name="add",
            item_type="function",
            language="python",
        )

        assert "Requirements:" in prompt
        assert "Return ONLY the documentation for the function" in prompt
        assert "The surrounding code is for CONTEXT ONLY" in prompt
        assert "Do not include the code itself" in prompt
        assert "Use the exact format shown in the example" in prompt


class TestAllStyleGuidesAvailable:
    """Test that all documented style guides are available."""

    def test_all_python_styles_available(self):
        """Test all Python style guides can be instantiated."""
        python_styles = ["google", "numpy-rest", "numpy-markdown", "sphinx"]
        for style in python_styles:
            builder = PromptBuilder(style_guide=style)
            assert builder.style_guide == style

    def test_all_javascript_styles_available(self):
        """Test all JavaScript style guides can be instantiated."""
        js_styles = ["jsdoc-vanilla", "jsdoc-google", "jsdoc-closure"]
        for style in js_styles:
            builder = PromptBuilder(style_guide=style)
            assert builder.style_guide == style

    def test_all_typescript_styles_available(self):
        """Test all TypeScript style guides can be instantiated."""
        ts_styles = ["tsdoc-typedoc", "tsdoc-aedoc", "jsdoc-ts"]
        for style in ts_styles:
            builder = PromptBuilder(style_guide=style)
            assert builder.style_guide == style


class TestFeedbackIntegration:
    """Test feedback integration for documentation regeneration."""

    def test_prompt_without_feedback(self):
        """Test that prompt without feedback does not include feedback section."""
        builder = PromptBuilder(style_guide="google", tone="concise")
        prompt = builder.build_prompt(
            code="def add(a, b):\n    return a + b",
            item_name="add",
            item_type="function",
            language="python",
        )

        assert "User Feedback from Previous Attempt:" not in prompt
        assert "IMPORTANT: Address the above feedback" not in prompt

    def test_prompt_with_feedback(self):
        """Test that prompt with feedback includes feedback section."""
        builder = PromptBuilder(style_guide="google", tone="concise")
        feedback_text = "Add more detail about error handling and edge cases"
        prompt = builder.build_prompt(
            code="def add(a, b):\n    return a + b",
            item_name="add",
            item_type="function",
            language="python",
            feedback=feedback_text,
        )

        assert "User Feedback from Previous Attempt:" in prompt
        assert feedback_text in prompt
        assert (
            "IMPORTANT: Address the above feedback in your revised documentation."
            in prompt
        )

    def test_prompt_with_multiline_feedback(self):
        """Test that prompt correctly handles multiline feedback."""
        builder = PromptBuilder(style_guide="google", tone="concise")
        feedback_text = """Please improve the documentation by:
1. Adding more details about parameters
2. Including examples of edge cases
3. Explaining the return value more clearly"""
        prompt = builder.build_prompt(
            code="def add(a, b):\n    return a + b",
            item_name="add",
            item_type="function",
            language="python",
            feedback=feedback_text,
        )

        assert "User Feedback from Previous Attempt:" in prompt
        assert "Adding more details about parameters" in prompt
        assert "Including examples of edge cases" in prompt
        assert "Explaining the return value more clearly" in prompt

    def test_prompt_with_special_characters_in_feedback(self):
        """Test that prompt handles special characters in feedback."""
        builder = PromptBuilder(style_guide="google", tone="concise")
        feedback_text = (
            'Include @param annotations, use `code` formatting, and add "quotes"'
        )
        prompt = builder.build_prompt(
            code="def add(a, b):\n    return a + b",
            item_name="add",
            item_type="function",
            language="python",
            feedback=feedback_text,
        )

        assert "User Feedback from Previous Attempt:" in prompt
        assert "@param annotations" in prompt
        assert "`code` formatting" in prompt
        assert '"quotes"' in prompt

    def test_feedback_stripped_of_whitespace(self):
        """Test that feedback is stripped of leading/trailing whitespace."""
        builder = PromptBuilder(style_guide="google", tone="concise")
        feedback_text = "   Add more details   \n\n"
        prompt = builder.build_prompt(
            code="def add(a, b):\n    return a + b",
            item_name="add",
            item_type="function",
            language="python",
            feedback=feedback_text,
        )

        assert "User Feedback from Previous Attempt:" in prompt
        assert "Add more details" in prompt
        # Ensure no extra whitespace around feedback
        assert "   Add more details   \n\n" not in prompt

    def test_feedback_placement_after_context(self):
        """Test that feedback appears after context but before requirements."""
        builder = PromptBuilder(style_guide="google", tone="concise")
        prompt = builder.build_prompt(
            code="def add(a, b):\n    return a + b",
            item_name="add",
            item_type="function",
            language="python",
            context="# Math utilities",
            feedback="Add more detail",
        )

        # Find positions of key sections
        context_pos = prompt.find("Surrounding context:")
        feedback_pos = prompt.find("User Feedback from Previous Attempt:")
        requirements_pos = prompt.find("Requirements:")

        # Feedback should appear after context and before requirements
        assert context_pos < feedback_pos < requirements_pos

    def test_feedback_works_with_all_style_guides(self):
        """Test that feedback integration works with all style guides."""
        test_styles = [
            ("google", "python"),
            ("numpy-rest", "python"),
            ("jsdoc-vanilla", "javascript"),
            ("tsdoc-typedoc", "typescript"),
        ]

        for style, language in test_styles:
            builder = PromptBuilder(style_guide=style, tone="concise")
            prompt = builder.build_prompt(
                code="function test() {}",
                item_name="test",
                item_type="function",
                language=language,
                feedback="Add more detail",
            )

            assert "User Feedback from Previous Attempt:" in prompt
            assert "Add more detail" in prompt
            assert "IMPORTANT: Address the above feedback" in prompt
