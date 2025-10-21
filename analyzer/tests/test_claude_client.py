"""
Tests for ClaudeClient functionality including API interaction and response handling.
"""

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
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

    def test_default_timeout_configuration(self):
        """Test ClaudeClient has default timeout of 30 seconds."""
        client = ClaudeClient(api_key='sk-ant-test')
        assert client.timeout == 30.0

    def test_custom_timeout_configuration(self):
        """Test ClaudeClient with custom timeout."""
        client = ClaudeClient(api_key='sk-ant-test', timeout=60.0)
        assert client.timeout == 60.0


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
    def test_timeout_passed_to_api_call(self, mock_anthropic_class):
        """Test that timeout is passed to API call."""
        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        mock_message = MagicMock()
        mock_message.content = [MagicMock(text='"""Docstring"""')]
        mock_client.messages.create.return_value = mock_message

        client = ClaudeClient(api_key='sk-ant-test', timeout=45.0)
        client.generate_docstring('test prompt')

        call_kwargs = mock_client.messages.create.call_args[1]
        assert call_kwargs['timeout'] == 45.0

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


class TestClaudeClientTimeoutHandling:
    """Test ClaudeClient timeout behavior and retry logic."""

    @patch('anthropic.Anthropic')
    @patch('time.sleep')
    def test_retry_on_timeout(self, mock_sleep, mock_anthropic_class):
        """Test that client retries on timeout error."""
        import anthropic

        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        # First call times out, second succeeds
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text='"""Success"""')]
        mock_client.messages.create.side_effect = [
            anthropic.APITimeoutError('Request timed out'),
            mock_message
        ]

        client = ClaudeClient(api_key='sk-ant-test', retry_delay=1.0)
        result = client.generate_docstring('test prompt')

        # Verify retry happened
        assert result == '"""Success"""'
        assert mock_client.messages.create.call_count == 2
        mock_sleep.assert_called_once_with(1.0)

    @patch('anthropic.Anthropic')
    @patch('time.sleep')
    def test_timeout_exponential_backoff(self, mock_sleep, mock_anthropic_class):
        """Test exponential backoff on multiple timeout errors."""
        import anthropic

        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        # Timeout twice, succeed on third attempt
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text='"""Success"""')]
        mock_client.messages.create.side_effect = [
            anthropic.APITimeoutError('Timeout 1'),
            anthropic.APITimeoutError('Timeout 2'),
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
    def test_timeout_max_retries_exceeded(self, mock_sleep, mock_anthropic_class):
        """Test that RuntimeError is raised after max timeout retries."""
        import anthropic

        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        # Always timeout
        mock_client.messages.create.side_effect = anthropic.APITimeoutError('Persistent timeout')

        client = ClaudeClient(api_key='sk-ant-test', max_retries=3, timeout=30.0)

        with pytest.raises(RuntimeError, match=r'Claude API request timed out after 3 attempts'):
            client.generate_docstring('test prompt')

        # Verify it tried max_retries times
        assert mock_client.messages.create.call_count == 3

    @patch('anthropic.Anthropic')
    @patch('time.sleep')
    def test_timeout_error_message_clarity(self, mock_sleep, mock_anthropic_class):
        """Test that timeout error message includes useful information."""
        import anthropic

        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        mock_client.messages.create.side_effect = anthropic.APITimeoutError('Timeout')

        client = ClaudeClient(api_key='sk-ant-test', max_retries=2, timeout=45.0)

        with pytest.raises(RuntimeError) as exc_info:
            client.generate_docstring('test prompt')

        error_message = str(exc_info.value)
        # Verify error message includes retry count and timeout duration
        assert '2 attempts' in error_message
        assert '45.0 second timeout' in error_message

    @patch('anthropic.Anthropic')
    @patch('time.sleep')
    def test_timeout_and_rate_limit_retries_independent(self, mock_sleep, mock_anthropic_class):
        """Test that timeout and rate limit errors are handled independently."""
        import anthropic

        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        # Create mock response for RateLimitError
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.headers = {}

        # Mix of timeout and rate limit errors
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text='"""Success"""')]
        mock_client.messages.create.side_effect = [
            anthropic.APITimeoutError('Timeout'),
            anthropic.RateLimitError('Rate limit', response=mock_response, body=None),
            mock_message
        ]

        client = ClaudeClient(api_key='sk-ant-test', retry_delay=1.0)
        result = client.generate_docstring('test prompt')

        # Verify both errors were retried and succeeded
        assert result == '"""Success"""'
        assert mock_client.messages.create.call_count == 3


class TestMultiItemResponseDetection:
    """
    Test detection of multi-item responses from Claude API.

    Issue #220: Claude sometimes returns documentation for multiple items instead
    of just the target item. These tests verify we can detect such responses.
    """

    def _count_python_docstrings(self, text: str) -> int:
        """Count Python docstrings (triple-quoted strings) in text."""
        import re
        # Match triple-quoted docstrings (both """ and ''')
        pattern = r'("""[\s\S]*?"""|\'\'\'[\s\S]*?\'\'\')'
        return len(re.findall(pattern, text))

    def _count_jsdoc_comments(self, text: str) -> int:
        """Count JSDoc comments (/** ... */) in text."""
        import re
        # Match JSDoc comments
        pattern = r'/\*\*[\s\S]*?\*/'
        return len(re.findall(pattern, text))

    @patch('anthropic.Anthropic')
    def test_detect_single_python_function_response(self, mock_anthropic_class):
        """Test detection of single Python function documentation (expected)."""
        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        # Mock response with single Python docstring
        single_docstring = '''"""
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

        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=single_docstring)]
        mock_client.messages.create.return_value = mock_message

        client = ClaudeClient(api_key='sk-ant-test')
        result = client.generate_docstring('test prompt')

        # Verify only one docstring in response
        docstring_count = self._count_python_docstrings(result)
        assert docstring_count == 1, f"Expected 1 docstring, found {docstring_count}"

    @patch('anthropic.Anthropic')
    def test_detect_multiple_python_function_responses(self, mock_anthropic_class):
        """Test detection of multiple Python functions (bug scenario from issue #220)."""
        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        # Mock response with MULTIPLE Python docstrings (this is the bug!)
        multiple_docstrings = '''"""
Check password strength requirements.

Parameters
----------
password : str
    Password string to validate

Returns
-------
bool
    True if password meets strength requirements, False otherwise
"""

"""
Validate username format and requirements.

Parameters
----------
username : str
    Username string to validate

Returns
-------
bool
    True if username is valid, False otherwise
"""

"""
Clean and sanitize user input string.

Parameters
----------
user_input : str
    Raw user input to sanitize

Returns
-------
str
    Cleaned and sanitized input string
"""'''

        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=multiple_docstrings)]
        mock_client.messages.create.return_value = mock_message

        client = ClaudeClient(api_key='sk-ant-test')
        result = client.generate_docstring('test prompt')

        # Verify multiple docstrings detected (this is the problem)
        docstring_count = self._count_python_docstrings(result)
        assert docstring_count == 3, f"Expected 3 docstrings (bug scenario), found {docstring_count}"

    @patch('anthropic.Anthropic')
    def test_detect_single_python_class_response(self, mock_anthropic_class):
        """Test detection of single Python class documentation (expected)."""
        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        single_class_doc = '''"""
Validator for user input data.

This class provides methods for validating various types of user input
including usernames, passwords, and email addresses.

Parameters
----------
strict_mode : bool, optional
    Enable strict validation rules. Defaults to False.
"""'''

        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=single_class_doc)]
        mock_client.messages.create.return_value = mock_message

        client = ClaudeClient(api_key='sk-ant-test')
        result = client.generate_docstring('test prompt')

        docstring_count = self._count_python_docstrings(result)
        assert docstring_count == 1

    @patch('anthropic.Anthropic')
    def test_detect_class_with_method_docs(self, mock_anthropic_class):
        """Test detection of class doc plus method docs (bug scenario)."""
        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        # Class documentation plus method documentation (should only be one or the other)
        class_plus_methods = '''"""
Validator for user input data.

Parameters
----------
strict_mode : bool
    Enable strict validation rules
"""

"""
Validate a username.

Parameters
----------
username : str
    The username to validate

Returns
-------
bool
    True if valid, False otherwise
"""'''

        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=class_plus_methods)]
        mock_client.messages.create.return_value = mock_message

        client = ClaudeClient(api_key='sk-ant-test')
        result = client.generate_docstring('test prompt')

        docstring_count = self._count_python_docstrings(result)
        assert docstring_count == 2, "Detected class + method docs (bug scenario)"

    @patch('anthropic.Anthropic')
    def test_detect_single_jsdoc_function_response(self, mock_anthropic_class):
        """Test detection of single JSDoc function documentation (expected)."""
        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        single_jsdoc = '''/**
 * Calculate the sum of two numbers.
 * @param {number} a - The first number
 * @param {number} b - The second number
 * @returns {number} The sum of a and b
 */'''

        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=single_jsdoc)]
        mock_client.messages.create.return_value = mock_message

        client = ClaudeClient(api_key='sk-ant-test')
        result = client.generate_docstring('test prompt')

        jsdoc_count = self._count_jsdoc_comments(result)
        assert jsdoc_count == 1

    @patch('anthropic.Anthropic')
    def test_detect_multiple_jsdoc_function_responses(self, mock_anthropic_class):
        """Test detection of multiple JSDoc functions (bug scenario)."""
        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        multiple_jsdocs = '''/**
 * Validate password strength.
 * @param {string} password - Password to validate
 * @returns {boolean} True if password is strong enough
 */

/**
 * Validate username format.
 * @param {string} username - Username to validate
 * @returns {boolean} True if username is valid
 */

/**
 * Sanitize user input.
 * @param {string} input - Raw user input
 * @returns {string} Sanitized input
 */'''

        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=multiple_jsdocs)]
        mock_client.messages.create.return_value = mock_message

        client = ClaudeClient(api_key='sk-ant-test')
        result = client.generate_docstring('test prompt')

        jsdoc_count = self._count_jsdoc_comments(result)
        assert jsdoc_count == 3, f"Expected 3 JSDoc comments (bug scenario), found {jsdoc_count}"

    @patch('anthropic.Anthropic')
    def test_detect_typescript_class_with_methods(self, mock_anthropic_class):
        """Test detection of TypeScript class with multiple method docs (bug)."""
        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        # TSDoc for class plus multiple methods
        class_and_methods = '''/**
 * Validator for user input data.
 *
 * @remarks
 * This class provides comprehensive validation for user inputs.
 */

/**
 * Validate a username.
 *
 * @param username - The username to validate
 * @returns True if valid, false otherwise
 */

/**
 * Validate a password.
 *
 * @param password - The password to validate
 * @returns True if password meets requirements
 */'''

        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=class_and_methods)]
        mock_client.messages.create.return_value = mock_message

        client = ClaudeClient(api_key='sk-ant-test')
        result = client.generate_docstring('test prompt')

        jsdoc_count = self._count_jsdoc_comments(result)
        assert jsdoc_count == 3, "Detected class + 2 methods (bug scenario)"

    @patch('anthropic.Anthropic')
    def test_detect_mixed_documented_and_target(self, mock_anthropic_class):
        """
        Test the exact scenario from issue #220.

        Claude returns docs for already-documented functions PLUS the target function.
        """
        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        # Realistic response from issue #220: includes already-documented function
        issue_220_response = '''"""
Check password strength requirements.

Parameters
----------
password : str
    Password string to validate

Returns
-------
bool
    True if password meets strength requirements, False otherwise
"""

"""
Validate username format and requirements.

This is the ACTUAL target function we requested documentation for.

Parameters
----------
username : str
    Username string to validate

Returns
-------
bool
    True if username is valid, False otherwise
"""

"""
Clean and sanitize user input string.

Parameters
----------
user_input : str
    Raw user input to sanitize

Returns
-------
str
    Cleaned and sanitized input string
"""'''

        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=issue_220_response)]
        mock_client.messages.create.return_value = mock_message

        client = ClaudeClient(api_key='sk-ant-test')
        result = client.generate_docstring('Generate docs for validate_username')

        # This is the problem: we asked for ONE function but got THREE
        docstring_count = self._count_python_docstrings(result)
        assert docstring_count > 1, (
            f"Issue #220 scenario: Expected multiple docstrings (bug), "
            f"found {docstring_count}"
        )
