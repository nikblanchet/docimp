"""
Prompt builder for creating context-rich documentation generation prompts.

This module constructs prompts for Claude that include code context, style guides,
and tone preferences to generate high-quality documentation.
"""

from typing import Optional


class PromptBuilder:
    """
    Builder for creating documentation generation prompts.

    This class constructs prompts that guide Claude to generate documentation
    in the appropriate style with the desired tone.

    Parameters
    ----------
    style_guide : str, optional
        Documentation style to use. Supported styles by language:
        - Python: 'google', 'numpy-rest', 'numpy-markdown', 'sphinx'
        - JavaScript: 'jsdoc-vanilla', 'jsdoc-google', 'jsdoc-closure'
        - TypeScript: 'tsdoc-typedoc', 'tsdoc-aedoc', 'jsdoc-ts'
        Defaults to 'google'.
    tone : str, optional
        Writing tone. Supported: 'concise', 'detailed', 'friendly'.
        Defaults to 'concise'.
    """

    STYLE_GUIDES = {
        # Python style guides (4 variants)
        "google": {
            "name": "Google",
            "description": "Google-style Python docstrings",
            "language": "python",
            "example": '''"""
Calculate the sum of two numbers.

Args:
    a (int): The first number
    b (int): The second number

Returns:
    int: The sum of a and b
"""''',
        },
        "numpy-rest": {
            "name": "NumPy + reST",
            "description": "NumPy docstring format with reStructuredText markup",
            "language": "python",
            "example": '''"""
Calculate the sum of two numbers.

Parameters
----------
a : int
    The first number
b : int
    The second number

Returns
-------
int
    The sum of a and b

Notes
-----
Use reST markup for emphasis: *italic*, **bold**, ``code``
"""''',
        },
        "numpy-markdown": {
            "name": "NumPy + Markdown",
            "description": "NumPy docstring format with Markdown markup",
            "language": "python",
            "example": '''"""
Calculate the sum of two numbers.

Parameters
----------
a : int
    The first number
b : int
    The second number

Returns
-------
int
    The sum of a and b

Notes
-----
Use Markdown for emphasis: *italic*, **bold**, `code`
"""''',
        },
        "sphinx": {
            "name": "Pure reST (Sphinx)",
            "description": "Sphinx-style Python docstrings with reST directives",
            "language": "python",
            "example": '''"""
Calculate the sum of two numbers.

:param a: The first number
:type a: int
:param b: The second number
:type b: int
:return: The sum of a and b
:rtype: int
"""''',
        },
        # JavaScript style guides (3 variants)
        "jsdoc-vanilla": {
            "name": "JSDoc (Vanilla)",
            "description": "Standard JSDoc format with @param, @returns, @typedef",
            "language": "javascript",
            "example": """/**
 * Calculate the sum of two numbers.
 * @param {number} a - The first number
 * @param {number} b - The second number
 * @returns {number} The sum of a and b
 */""",
        },
        "jsdoc-google": {
            "name": "Google JSDoc",
            "description": "Google-flavored JSDoc with specific formatting conventions",
            "language": "javascript",
            "example": """/**
 * Calculate the sum of two numbers.
 *
 * @param {number} a The first number.
 * @param {number} b The second number.
 * @return {number} The sum of a and b.
 */""",
        },
        "jsdoc-closure": {
            "name": "Closure (JSDoc/Closure)",
            "description": (
                "Google Closure Compiler style with nullable types and "
                "advanced annotations"
            ),
            "language": "javascript",
            "example": """/**
 * Calculate the sum of two numbers.
 * @param {number} a The first number
 * @param {number} b The second number
 * @return {number} The sum of a and b
 * @public
 */""",
        },
        # TypeScript style guides (3 variants)
        "tsdoc-typedoc": {
            "name": "TSDoc (TypeDoc)",
            "description": "TSDoc format optimized for TypeDoc documentation generator",
            "language": "typescript",
            "example": """/**
 * Calculate the sum of two numbers.
 *
 * @param a - The first number
 * @param b - The second number
 * @returns The sum of a and b
 *
 * @remarks
 * TypeScript types are inferred from the signature.
 */""",
        },
        "tsdoc-aedoc": {
            "name": "TSDoc (API Extractor/AEDoc)",
            "description": (
                "TSDoc format for Microsoft API Extractor with public API annotations"
            ),
            "language": "typescript",
            "example": """/**
 * Calculate the sum of two numbers.
 *
 * @param a - The first number
 * @param b - The second number
 * @returns The sum of a and b
 *
 * @public
 */""",
        },
        "jsdoc-ts": {
            "name": "JSDoc-in-TS",
            "description": "JSDoc format in TypeScript files (hybrid approach)",
            "language": "typescript",
            "example": """/**
 * Calculate the sum of two numbers.
 * @param {number} a - The first number
 * @param {number} b - The second number
 * @returns {number} The sum of a and b
 */""",
        },
    }

    TONE_DESCRIPTIONS = {
        "concise": ("Be brief and to the point. Focus on essential information only."),
        "detailed": ("Provide comprehensive explanations with examples where helpful."),
        "friendly": (
            "Write in a conversational, approachable style while remaining "
            "professional."
        ),
    }

    def __init__(self, style_guide: str = "google", tone: str = "concise"):
        if style_guide not in self.STYLE_GUIDES:
            raise ValueError(
                f"Unsupported style guide: {style_guide}. "
                f"Supported: {', '.join(self.STYLE_GUIDES.keys())}"
            )
        if tone not in self.TONE_DESCRIPTIONS:
            raise ValueError(
                f"Unsupported tone: {tone}. "
                f"Supported: {', '.join(self.TONE_DESCRIPTIONS.keys())}"
            )

        self.style_guide = style_guide
        self.tone = tone

    def build_prompt(
        self,
        code: str,
        item_name: str,
        item_type: str,
        language: str,
        context: str | None = None,
        feedback: str | None = None,
    ) -> str:
        """
        Build a documentation generation prompt.

        Parameters
        ----------
        code : str
            The code to document (function, class, method).
        item_name : str
            Name of the item being documented.
        item_type : str
            Type of item: 'function', 'class', 'method'.
        language : str
            Programming language: 'python', 'javascript', 'typescript'.
        context : str, optional
            Additional surrounding code context.
        feedback : str, optional
            User feedback from a previous documentation attempt, used when
            regenerating documentation to address specific user
            concerns.

        Returns
        -------
        str
            The complete prompt to send to Claude.
        """
        style_info = self.STYLE_GUIDES[self.style_guide]
        tone_desc = self.TONE_DESCRIPTIONS[self.tone]

        prompt_parts = [
            (
                f"Generate documentation for the {language} {item_type} "
                f"named '{item_name}'."
            ),
            "",
            f"Documentation Style: {style_info['name']}",
            f"Tone: {self.tone.capitalize()} - {tone_desc}",
            "",
            "Example format:",
            style_info["example"],
            "",
            "Code to document:",
            "```" + language,
            code.strip(),
            "```",
        ]

        if context:
            prompt_parts.extend(
                [
                    "",
                    "Surrounding context:",
                    "```" + language,
                    context.strip(),
                    "```",
                ]
            )

        if feedback:
            prompt_parts.extend(
                [
                    "",
                    "User Feedback from Previous Attempt:",
                    feedback.strip(),
                    "",
                    (
                        "IMPORTANT: Address the above feedback in your "
                        "revised documentation."
                    ),
                ]
            )

        prompt_parts.extend(
            [
                "",
                "Requirements:",
                (
                    f"1. Return ONLY the documentation for the {item_type} "
                    f"'{item_name}' - nothing else"
                ),
                ("2. The surrounding code is for CONTEXT ONLY - do not document it"),
                "3. Do not include the code itself, only the documentation",
                "4. Use the exact format shown in the example",
            ]
        )

        # OPTION A: Prevent markdown code fence wrappers
        prompt_parts.extend(
            [
                (
                    "5. IMPORTANT: Return the raw docstring text only. "
                    "Do NOT wrap your entire response in markdown code "
                    "fences (```python, ```javascript, etc.)"
                ),
                (
                    "6. Code examples WITHIN the docstring are fine and "
                    "encouraged - just don't wrap the whole docstring in "
                    "backticks"
                ),
            ]
        )

        # Add style-specific requirements
        style_language = style_info.get("language")

        if style_language == "python":
            prompt_parts.extend(
                [
                    (
                        "7. Include type hints for all parameters and return values"
                    ),  # NOTE: Changed from "5" to "7"
                    (
                        "8. Return only the docstring content - do NOT "
                        "include the triple-quote delimiters (they will be "
                        "added automatically)"
                    ),  # NOTE: Changed from "6" to "8"
                ]
            )
            if self.style_guide == "numpy-rest":
                prompt_parts.append(
                    "7. Use reStructuredText markup: *italic*, **bold**, ``code``"
                )
            elif self.style_guide == "numpy-markdown":
                prompt_parts.append(
                    "7. Use Markdown markup: *italic*, **bold**, `code`"
                )
        elif style_language == "javascript":
            prompt_parts.extend(
                [
                    (
                        "5. Ensure @param names exactly match the function "
                        "parameter names"
                    ),
                    (
                        "6. Include type annotations for all parameters and "
                        "return values"
                    ),
                ]
            )
            if self.style_guide == "jsdoc-vanilla":
                prompt_parts.append("7. Use @returns (not @return)")
            elif self.style_guide == "jsdoc-google":
                prompt_parts.extend(
                    [
                        "7. Use @return (not @returns)",
                        "8. End descriptions with periods",
                        "9. No hyphens after parameter names",
                    ]
                )
            elif self.style_guide == "jsdoc-closure":
                prompt_parts.extend(
                    [
                        "7. Use @return (not @returns)",
                        ("8. Include @public, @private, or @protected annotations"),
                    ]
                )
        elif style_language == "typescript":
            if self.style_guide == "tsdoc-typedoc":
                prompt_parts.extend(
                    [
                        ("5. Use TSDoc format with hyphens after parameter names"),
                        "6. Use @returns (not @return)",
                        ("7. Types are inferred from TypeScript signatures"),
                        "8. Include @remarks for additional details",
                    ]
                )
            elif self.style_guide == "tsdoc-aedoc":
                prompt_parts.extend(
                    [
                        ("5. Use TSDoc format with hyphens after parameter names"),
                        "6. Use @returns (not @return)",
                        ("7. Include @public, @beta, or @internal annotations"),
                        ("8. Types are inferred from TypeScript signatures"),
                    ]
                )
            elif self.style_guide == "jsdoc-ts":
                prompt_parts.extend(
                    [
                        ("5. Use JSDoc format with explicit type annotations"),
                        (
                            "6. Include {type} annotations even though "
                            "TypeScript provides types"
                        ),
                        "7. Use @returns (not @return)",
                    ]
                )

        return "\n".join(prompt_parts)
