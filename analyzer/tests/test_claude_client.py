"""
Tests for ClaudeClient functionality including API interaction and response handling.
"""

import sys
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.claude.claude_client import ClaudeClient


class TestClaudeClientInitialization:
    """Test ClaudeClient initialization and configuration."""

    def test_initialization_with_api_key_parameter(self):
        """Test ClaudeClient initialization with API key as parameter."""
        client = ClaudeClient(api_key='sk-ant-test-key')
        assert client.api_key == 'sk-ant-test-key'
        assert client.model == 'claude-sonnet-4-20250514'
        assert client.max_retries == 3
        assert client.retry_delay == 1.0

    def test_initialization_with_environment_variable(self):
        """Test ClaudeClient initialization with API key from environment."""
        with patch.dict('os.environ', {'ANTHROPIC_API_KEY': 'sk-ant-env-key'}):
            client = ClaudeClient()
            assert client.api_key == 'sk-ant-env-key'

    def test_initialization_without_api_key_raises_error(self):
        """Test that missing API key raises ValueError."""
        with patch.dict('os.environ', {}, clear=True):
            with pytest.raises(ValueError, match='API key must be provided'):
                ClaudeClient()

    def test_custom_model_configuration(self):
        """Test ClaudeClient with custom model."""
        client = ClaudeClient(api_key='sk-ant-test', model='claude-opus-4-20250514')
        assert client.model == 'claude-opus-4-20250514'

    def test_custom_retry_configuration(self):
        """Test ClaudeClient with custom retry settings."""
        client = ClaudeClient(
            api_key='sk-ant-test',
            max_retries=5,
            retry_delay=2.0
        )
        assert client.max_retries == 5
        assert client.retry_delay == 2.0


class TestClaudeClientAPIInteraction:
    """Test ClaudeClient API calls and response handling."""

    @patch('anthropic.Anthropic')
    def test_successful_docstring_generation(self, mock_anthropic_class):
        """Test successful documentation generation."""
        # Mock the API response
        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        mock_message = MagicMock()
        mock_message.content = [MagicMock(text='"""Generated docstring"""')]
        mock_client.messages.create.return_value = mock_message

        # Create client and generate docstring
        client = ClaudeClient(api_key='sk-ant-test')
        result = client.generate_docstring('Generate docs for this function')

        # Verify result
        assert result == '"""Generated docstring"""'

        # Verify API call
        mock_client.messages.create.assert_called_once()
        call_kwargs = mock_client.messages.create.call_args[1]
        assert call_kwargs['model'] == 'claude-sonnet-4-20250514'
        assert call_kwargs['max_tokens'] == 1024
        assert call_kwargs['messages'][0]['role'] == 'user'
        assert call_kwargs['messages'][0]['content'] == 'Generate docs for this function'

    @patch('anthropic.Anthropic')
    def test_custom_max_tokens(self, mock_anthropic_class):
        """Test docstring generation with custom max_tokens."""
        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        mock_message = MagicMock()
        mock_message.content = [MagicMock(text='"""Docstring"""')]
        mock_client.messages.create.return_value = mock_message

        client = ClaudeClient(api_key='sk-ant-test')
        client.generate_docstring('prompt', max_tokens=2048)

        call_kwargs = mock_client.messages.create.call_args[1]
        assert call_kwargs['max_tokens'] == 2048

    @patch('anthropic.Anthropic')
    def test_response_text_extraction(self, mock_anthropic_class):
        """Test that response text is correctly extracted from API response."""
        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        # Mock response with specific structure
        mock_message = MagicMock()
        mock_content_block = MagicMock()
        mock_content_block.text = 'Expected documentation text'
        mock_message.content = [mock_content_block]
        mock_client.messages.create.return_value = mock_message

        client = ClaudeClient(api_key='sk-ant-test')
        result = client.generate_docstring('test prompt')

        assert result == 'Expected documentation text'


class TestClaudeClientRetryLogic:
    """Test ClaudeClient retry behavior for rate limits."""

    def _create_mock_response(self, status_code=429):
        """Helper to create a mock HTTP response."""
        mock_response = MagicMock()
        mock_response.status_code = status_code
        mock_response.headers = {}
        return mock_response

    @patch('anthropic.Anthropic')
    @patch('time.sleep')
    def test_retry_on_rate_limit(self, mock_sleep, mock_anthropic_class):
        """Test that client retries on rate limit error."""
        import anthropic

        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        # Create mock response for RateLimitError
        mock_response = self._create_mock_response(429)

        # First call raises RateLimitError, second succeeds
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text='"""Success"""')]
        mock_client.messages.create.side_effect = [
            anthropic.RateLimitError('Rate limit exceeded', response=mock_response, body=None),
            mock_message
        ]

        client = ClaudeClient(api_key='sk-ant-test', retry_delay=1.0)
        result = client.generate_docstring('test prompt')

        # Verify retry happened
        assert result == '"""Success"""'
        assert mock_client.messages.create.call_count == 2
        mock_sleep.assert_called_once_with(1.0)  # First retry: 1.0 * (2^0)

    @patch('anthropic.Anthropic')
    @patch('time.sleep')
    def test_exponential_backoff(self, mock_sleep, mock_anthropic_class):
        """Test exponential backoff on multiple rate limit errors."""
        import anthropic

        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        # Create mock response for RateLimitError
        mock_response = self._create_mock_response(429)

        # Fail twice, succeed on third attempt
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text='"""Success"""')]
        mock_client.messages.create.side_effect = [
            anthropic.RateLimitError('Rate limit', response=mock_response, body=None),
            anthropic.RateLimitError('Rate limit', response=mock_response, body=None),
            mock_message
        ]

        client = ClaudeClient(api_key='sk-ant-test', retry_delay=1.0)
        result = client.generate_docstring('test prompt')

        # Verify exponential backoff
        assert result == '"""Success"""'
        assert mock_client.messages.create.call_count == 3
        assert mock_sleep.call_count == 2
        # First retry: 1.0 * (2^0) = 1.0, Second retry: 1.0 * (2^1) = 2.0
        mock_sleep.assert_any_call(1.0)
        mock_sleep.assert_any_call(2.0)

    @patch('anthropic.Anthropic')
    @patch('time.sleep')
    def test_max_retries_exceeded(self, mock_sleep, mock_anthropic_class):
        """Test that RateLimitError is raised after max retries."""
        import anthropic

        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        # Create mock response for RateLimitError
        mock_response = self._create_mock_response(429)

        # Always fail with rate limit
        mock_client.messages.create.side_effect = anthropic.RateLimitError(
            'Rate limit',
            response=mock_response,
            body=None
        )

        client = ClaudeClient(api_key='sk-ant-test', max_retries=3)

        with pytest.raises(anthropic.RateLimitError):
            client.generate_docstring('test prompt')

        # Verify it tried max_retries times
        assert mock_client.messages.create.call_count == 3

    @patch('anthropic.Anthropic')
    def test_no_retry_on_other_api_errors(self, mock_anthropic_class):
        """Test that other API errors are not retried."""
        import anthropic

        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        # Create mock request for APIError
        mock_request = MagicMock()

        # Raise a different API error
        mock_client.messages.create.side_effect = anthropic.APIError(
            'Invalid request',
            request=mock_request,
            body=None
        )

        client = ClaudeClient(api_key='sk-ant-test')

        with pytest.raises(anthropic.APIError):
            client.generate_docstring('test prompt')

        # Verify it only tried once (no retry)
        assert mock_client.messages.create.call_count == 1
