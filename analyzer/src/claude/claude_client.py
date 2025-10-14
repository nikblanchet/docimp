"""
Claude API client for generating documentation suggestions.

This module provides a client for interacting with the Claude API to generate
documentation suggestions for code items.
"""

import os
import time
from typing import Optional

import anthropic


class ClaudeClient:
    """
    Client for interacting with Claude API to generate documentation.

    Parameters
    ----------
    api_key : str, optional
        Anthropic API key. If not provided, reads from ANTHROPIC_API_KEY environment variable.
    model : str, optional
        Claude model to use. Defaults to claude-sonnet-4-20250514.
    max_retries : int, optional
        Maximum number of retry attempts for rate-limited requests. Defaults to 3.
    retry_delay : float, optional
        Base delay in seconds between retries. Defaults to 1.0.

    Raises
    ------
    ValueError
        If no API key is provided and ANTHROPIC_API_KEY environment variable is not set.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "claude-sonnet-4-20250514",
        max_retries: int = 3,
        retry_delay: float = 1.0
    ):
        self.api_key = api_key or os.environ.get('ANTHROPIC_API_KEY')
        if not self.api_key:
            raise ValueError(
                "API key must be provided either as parameter or via "
                "ANTHROPIC_API_KEY environment variable"
            )

        self.model = model
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.client = anthropic.Anthropic(api_key=self.api_key)

    def generate_docstring(self, prompt: str, max_tokens: int = 1024) -> str:
        """
        Generate a documentation string using Claude.

        Parameters
        ----------
        prompt : str
            The prompt to send to Claude, including code context and instructions.
        max_tokens : int, optional
            Maximum number of tokens to generate. Defaults to 1024.

        Returns
        -------
        str
            The generated documentation string.

        Raises
        ------
        anthropic.RateLimitError
            If rate limit is exceeded after all retry attempts.
        anthropic.APIError
            If API request fails for other reasons.
        """
        for attempt in range(self.max_retries):
            try:
                message = self.client.messages.create(
                    model=self.model,
                    max_tokens=max_tokens,
                    messages=[
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ]
                )

                # Extract text from response
                return message.content[0].text

            except anthropic.RateLimitError as e:
                if attempt < self.max_retries - 1:
                    # Exponential backoff
                    delay = self.retry_delay * (2 ** attempt)
                    time.sleep(delay)
                    continue
                else:
                    raise

            except anthropic.APIError:
                # Don't retry on other API errors
                raise

        # Should never reach here
        raise RuntimeError("Unexpected error in generate_docstring")
