"""ShortUUID utilities for DocImp session and transaction IDs.

Generates concise, URL-safe UUIDs using base57 encoding (excludes ambiguous
characters: 0, 1, I, O, l). Produces 22-character strings from UUID4.

Display formatting inserts hyphens every 4 characters from the right for
improved readability (e.g., `vytx-eTZs-kVKR`).

Based on shortuuid library (https://github.com/skorokithakis/shortuuid).
"""

import math
import uuid as _uu
from typing import Final, NewType

ShortUUIDStr = NewType("ShortUUIDStr", str)

# Base57 alphabet - excludes similar-looking characters (0, 1, I, O, l)
DEFAULT_ALPHABET: Final = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

# Pre-computed values for default alphabet
_ALPHABET_LIST: Final = list(DEFAULT_ALPHABET)
_ALPHABET_SET: Final = frozenset(DEFAULT_ALPHABET)
_ALPHABET_LEN: Final = len(DEFAULT_ALPHABET)
_ENCODED_LENGTH: Final = int(math.ceil(math.log(2**128, _ALPHABET_LEN)))  # 22


def _int_to_string(number: int, alphabet: list[str], padding: int | None = None) -> str:
    """Convert an integer to a string using the given alphabet.

    The output has the most significant digit first.

    Args:
        number: Non-negative integer to convert.
        alphabet: List of characters to use as digits.
        padding: Minimum output length (pads with first alphabet char).

    Returns:
        Encoded string representation.
    """
    alpha_len = len(alphabet)
    digits: list[str] = []
    while number:
        number, digit = divmod(number, alpha_len)
        digits.append(alphabet[digit])
    if padding:
        remainder = max(padding - len(digits), 0)
        digits.extend(alphabet[0] for _ in range(remainder))
    digits.reverse()
    return "".join(digits)


def _string_to_int(string: str, alphabet: list[str]) -> int:
    """Convert a string to an integer using the given alphabet.

    The input is assumed to have the most significant digit first.

    Args:
        string: Encoded string to convert.
        alphabet: List of characters used as digits.

    Returns:
        Decoded integer value.

    Raises:
        ValueError: If string contains characters not in alphabet.
    """
    number = 0
    alpha_len = len(alphabet)
    for char in string:
        try:
            index = alphabet.index(char)
        except ValueError:
            raise ValueError(f"Invalid character '{char}' not in alphabet") from None
        number = number * alpha_len + index
    return number


def generate() -> ShortUUIDStr:
    """Generate a new short UUID from a random UUID4.

    Returns:
        22-character base57-encoded string.
    """
    return encode(_uu.uuid4())


def encode(uuid_obj: _uu.UUID) -> ShortUUIDStr:
    """Encode a UUID object to a short UUID string.

    Args:
        uuid_obj: Standard library UUID object.

    Returns:
        22-character base57-encoded string.

    Raises:
        TypeError: If uuid_obj is not a UUID instance.
    """
    if not isinstance(uuid_obj, _uu.UUID):
        raise TypeError(f"Expected UUID, got {type(uuid_obj).__name__}")
    return ShortUUIDStr(_int_to_string(uuid_obj.int, _ALPHABET_LIST, padding=_ENCODED_LENGTH))


def decode(short_uuid: str) -> _uu.UUID:
    """Decode a short UUID string back to a UUID object.

    Automatically strips hyphens before processing.

    Args:
        short_uuid: Base57-encoded string (hyphens are stripped).

    Returns:
        Standard library UUID object.

    Raises:
        ValueError: If string contains invalid characters or has wrong length.
    """
    cleaned = strip_hyphens(short_uuid)
    if len(cleaned) != _ENCODED_LENGTH:
        raise ValueError(
            f"Invalid short UUID length: {len(cleaned)} (expected {_ENCODED_LENGTH})"
        )
    return _uu.UUID(int=_string_to_int(cleaned, _ALPHABET_LIST))


def format_display(short_uuid: str, truncate: int | None = None) -> str:
    """Format short UUID for display with hyphens every 4 chars from right.

    Args:
        short_uuid: Raw short UUID string (22 chars) or hyphenated format.
        truncate: Optional truncation length (e.g., 8 or 12). If provided,
            takes first N characters before adding hyphens.

    Returns:
        Formatted string with hyphens inserted every 4 characters from right.
        Examples:
            - Full (22 chars): `vy-txeT-ZskV-KR7C-7Wgd-SP3d`
            - Truncate 8: `vytx-eTZs`
            - Truncate 12: `vytx-eTZs-kVKR`
    """
    # Strip any existing hyphens first
    cleaned = strip_hyphens(short_uuid)

    # Apply truncation if requested
    if truncate is not None:
        cleaned = cleaned[:truncate]

    # Insert hyphens every 4 characters from the right
    if len(cleaned) <= 4:
        return cleaned

    result: list[str] = []
    remainder = len(cleaned) % 4
    if remainder:
        result.append(cleaned[:remainder])
    for i in range(remainder, len(cleaned), 4):
        result.append(cleaned[i : i + 4])
    return "-".join(result)


def strip_hyphens(formatted: str) -> str:
    """Strip all hyphens from a formatted short UUID.

    Args:
        formatted: Short UUID string, possibly with hyphens.

    Returns:
        String with all hyphens removed.
    """
    return formatted.replace("-", "")


def is_valid(value: str) -> bool:
    """Check if a string is a valid short UUID (hyphens allowed).

    Validates that after stripping hyphens:
    - Length is exactly 22 characters
    - All characters are in the base57 alphabet

    Args:
        value: String to validate.

    Returns:
        True if valid short UUID format, False otherwise.
    """
    cleaned = strip_hyphens(value)
    if len(cleaned) != _ENCODED_LENGTH:
        return False
    return all(char in _ALPHABET_SET for char in cleaned)


def get_alphabet() -> str:
    """Return the alphabet used for encoding.

    Returns:
        57-character string of allowed characters.
    """
    return DEFAULT_ALPHABET
