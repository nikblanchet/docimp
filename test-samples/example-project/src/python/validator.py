"""Input validation utilities for user data.

This module provides validation functions for common input types
with varying levels of documentation quality for testing.
"""

import re


def validate_email(email: str) -> bool:
    """Validate email address format.

    Checks if the provided email address matches standard email format
    using a regular expression pattern.

    Parameters
    ----------
    email : str
        Email address to validate

    Returns
    -------
    bool
        True if email is valid, False otherwise

    Examples
    --------
    >>> validate_email("user@example.com")
    True
    >>> validate_email("invalid-email")
    False
    """
    if not email:
        return False
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def validate_password(password):
    """Check password strength."""
    if len(password) < 8:
        return False
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    return has_upper and has_lower and has_digit


def validate_username(username: str) -> bool:
    if not username:
        return False
    if len(username) < 3 or len(username) > 20:
        return False
    if not username[0].isalpha():
        return False
    for char in username:
        if not (char.isalnum() or char in ['_', '-']):
            return False
    return True


def validate_phone_number(phone: str, country_code: str = "US") -> bool:
    """Validate phone number format.

    Parameters
    ----------
    phone : str
        Phone number to validate
    country_code : str, optional
        Country code for format validation (default is "US")

    Returns
    -------
    bool
        True if phone number is valid for the country
    """
    phone_digits = re.sub(r'\D', '', phone)

    if country_code == "US":
        return len(phone_digits) == 10
    elif country_code == "UK":
        return len(phone_digits) == 11
    else:
        return len(phone_digits) >= 10 and len(phone_digits) <= 15


def sanitize_input(user_input: str) -> str:
    cleaned = user_input.strip()
    cleaned = re.sub(r'[<>]', '', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned)
    return cleaned


class InputValidator:
    """Validator class with customizable rules."""

    def __init__(self, strict_mode: bool = False):
        """Initialize validator.

        Parameters
        ----------
        strict_mode : bool, optional
            Enable strict validation rules (default is False)
        """
        self.strict_mode = strict_mode
        self.errors = []

    def validate(self, data: dict) -> bool:
        """Validate data dictionary.

        Parameters
        ----------
        data : dict
            Data to validate

        Returns
        -------
        bool
            True if all validations pass
        """
        self.errors = []

        if 'email' in data:
            if not validate_email(data['email']):
                self.errors.append('Invalid email address')

        if 'password' in data:
            if not validate_password(data['password']):
                self.errors.append('Weak password')

        if 'username' in data:
            if not validate_username(data['username']):
                self.errors.append('Invalid username')

        return len(self.errors) == 0

    def get_errors(self):
        return self.errors
