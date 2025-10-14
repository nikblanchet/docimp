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
    in the appropriate style (JSDoc, NumPy, etc.) with the desired tone.

    Parameters
    ----------
    style_guide : str, optional
        Documentation style to use. Supported: 'jsdoc', 'numpy', 'google', 'sphinx'.
        Defaults to 'numpy'.
    tone : str, optional
        Writing tone. Supported: 'concise', 'detailed', 'friendly'.
        Defaults to 'concise'.
    """

    STYLE_GUIDES = {
        'jsdoc': {
            'name': 'JSDoc',
            'description': 'JavaScript documentation using JSDoc format with @param, @returns, @typedef',
            'example': """/**
 * Calculate the sum of two numbers.
 * @param {number} a - The first number
 * @param {number} b - The second number
 * @returns {number} The sum of a and b
 */"""
        },
        'numpy': {
            'name': 'NumPy',
            'description': 'Python documentation using NumPy docstring format',
            'example': '''"""
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
"""'''
        },
        'google': {
            'name': 'Google',
            'description': 'Google-style Python docstrings',
            'example': '''"""
Calculate the sum of two numbers.

Args:
    a (int): The first number
    b (int): The second number

Returns:
    int: The sum of a and b
"""'''
        },
        'sphinx': {
            'name': 'Sphinx',
            'description': 'Sphinx-style Python docstrings',
            'example': '''"""
Calculate the sum of two numbers.

:param a: The first number
:type a: int
:param b: The second number
:type b: int
:return: The sum of a and b
:rtype: int
"""'''
        }
    }

    TONE_DESCRIPTIONS = {
        'concise': 'Be brief and to the point. Focus on essential information only.',
        'detailed': 'Provide comprehensive explanations with examples where helpful.',
        'friendly': 'Write in a conversational, approachable style while remaining professional.'
    }

    def __init__(self, style_guide: str = 'numpy', tone: str = 'concise'):
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
        context: Optional[str] = None
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

        Returns
        -------
        str
            The complete prompt to send to Claude.
        """
        style_info = self.STYLE_GUIDES[self.style_guide]
        tone_desc = self.TONE_DESCRIPTIONS[self.tone]

        prompt_parts = [
            f"Generate documentation for the following {language} {item_type}.",
            "",
            f"Documentation Style: {style_info['name']}",
            f"Tone: {self.tone.capitalize()} - {tone_desc}",
            "",
            "Example format:",
            style_info['example'],
            "",
            "Code to document:",
            "```" + language,
            code.strip(),
            "```",
        ]

        if context:
            prompt_parts.extend([
                "",
                "Surrounding context:",
                "```" + language,
                context.strip(),
                "```",
            ])

        prompt_parts.extend([
            "",
            "Requirements:",
            "1. Return ONLY the documentation comment, nothing else",
            "2. Do not include the code itself, only the documentation",
            "3. Use the exact format shown in the example",
        ])

        if self.style_guide == 'jsdoc':
            prompt_parts.extend([
                "4. Ensure @param names exactly match the function parameter names",
                "5. Include type annotations for all parameters and return values",
                "6. Use @returns (not @return)",
            ])
        elif self.style_guide in ['numpy', 'google', 'sphinx']:
            prompt_parts.extend([
                "4. Include type hints for all parameters and return values",
                "5. Use triple-quoted docstrings",
            ])

        return "\n".join(prompt_parts)
