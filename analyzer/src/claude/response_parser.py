"""Parser for cleaning Claude API responses before file insertion.

This module provides utilities to strip markdown code fences from Claude's
responses, implementing a defensive layer to handle cases where Claude might
wrap responses in markdown despite prompt instructions.
"""

import re
from typing import Optional


class ClaudeResponseParser:
    """Parse and clean Claude API responses before file insertion.

    This parser provides defense-in-depth against Claude occasionally wrapping
    responses in markdown code fences (```language ... ```), which would break
    files if inserted literally.

    The parser is designed to:
    - Strip outer markdown fences if present
    - Preserve clean responses unchanged (no-op)
    - Preserve code examples within docstrings
    """

    # Supported language specifiers for markdown fences
    LANGUAGE_SPECIFIERS = [
        'python',
        'javascript', 'js',
        'typescript', 'ts'
    ]

    @staticmethod
    def strip_markdown_fences(response: str, language: str) -> str:
        """Remove markdown code fence wrappers if present.

        This method strips outer markdown fences like:
        - ```python ... ```
        - ```javascript ... ```
        - ``` ... ``` (generic fence)

        It preserves code examples WITHIN the docstring, only removing
        the outermost wrapper.

        Parameters
        ----------
        response : str
            Raw response from Claude API
        language : str
            Expected language ('python', 'javascript', 'typescript')
            Used to match language-specific fences

        Returns
        -------
        str
            Cleaned docstring without outer markdown wrappers

        Examples
        --------
        >>> parser = ClaudeResponseParser()
        >>> wrapped = '```python\\nCalculate sum.\\n```'
        >>> parser.strip_markdown_fences(wrapped, 'python')
        'Calculate sum.'

        >>> clean = 'Calculate sum.'
        >>> parser.strip_markdown_fences(clean, 'python')
        'Calculate sum.'
        """
        if not response:
            return response

        # Normalize language name (e.g., 'javascript' -> 'javascript|js')
        language_pattern = ClaudeResponseParser._build_language_pattern(language)

        # Pattern to match outer markdown fences:
        # - Start: ```<language>? (optional newline)
        # - Content: anything (captured)
        # - End: ``` (optional whitespace)
        #
        # re.DOTALL: . matches newlines
        # Non-greedy (.*?): stop at first closing fence
        pattern = rf'^\s*```(?:{language_pattern})?\s*\n(.*?)\n```\s*$'

        match = re.match(pattern, response.strip(), re.DOTALL)
        if match:
            # Fence found - return content without fences
            return match.group(1)

        # No fence found - return original response unchanged
        return response

    @staticmethod
    def _build_language_pattern(language: str) -> str:
        """Build regex pattern for language specifiers.

        Parameters
        ----------
        language : str
            Language name ('python', 'javascript', 'typescript')

        Returns
        -------
        str
            Regex alternation pattern (e.g., 'javascript|js')
        """
        # Map language to all possible specifiers
        language_map = {
            'python': ['python'],
            'javascript': ['javascript', 'js'],
            'typescript': ['typescript', 'ts']
        }

        specifiers = language_map.get(language.lower(), [language.lower()])
        return '|'.join(specifiers)
