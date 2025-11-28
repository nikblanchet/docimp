"""Unit tests for shortuuid module.

Tests encode/decode functions, display formatting, and validation against
shared test vectors for cross-language compatibility verification.
"""

import json
import uuid
from pathlib import Path

import pytest

from src.utils.shortuuid import (
    DEFAULT_ALPHABET,
    decode,
    encode,
    format_display,
    generate,
    get_alphabet,
    is_valid,
    strip_hyphens,
)


@pytest.fixture
def test_vectors() -> dict:
    """Load shared test vectors for cross-language compatibility testing."""
    vectors_path = (
        Path(__file__).parent.parent.parent / "test-fixtures" / "shortuuid-vectors.json"
    )
    with vectors_path.open() as f:
        return json.load(f)


class TestEncodeDecode:
    """Tests for encode and decode functions."""

    def test_encode_decode_roundtrip(self) -> None:
        """Verify encode/decode roundtrip produces original UUID."""
        original = uuid.uuid4()
        encoded = encode(original)
        decoded = decode(encoded)
        assert decoded == original

    def test_encode_produces_22_chars(self) -> None:
        """Verify encoded output is exactly 22 characters."""
        for _ in range(10):
            encoded = generate()
            assert len(encoded) == 22, f"Expected 22 chars, got {len(encoded)}"

    def test_encode_uses_valid_alphabet(self) -> None:
        """Verify encoded output only uses base57 alphabet characters."""
        for _ in range(10):
            encoded = generate()
            for char in encoded:
                assert char in DEFAULT_ALPHABET, f"Invalid char '{char}'"

    def test_encode_decode_vectors(self, test_vectors: dict) -> None:
        """Verify encode/decode against shared test vectors."""
        for vector in test_vectors["encode_decode_vectors"]:
            uuid_str = vector["uuid"]
            expected_short = vector["shortuuid"]

            # Test encode
            uuid_obj = uuid.UUID(uuid_str)
            actual_short = encode(uuid_obj)
            assert actual_short == expected_short, (
                f"Encode mismatch for {uuid_str}: "
                f"expected {expected_short}, got {actual_short}"
            )

            # Test decode
            decoded = decode(expected_short)
            assert str(decoded) == uuid_str, (
                f"Decode mismatch for {expected_short}: "
                f"expected {uuid_str}, got {decoded}"
            )

    def test_decode_strips_hyphens(self) -> None:
        """Verify decode accepts hyphenated input."""
        uuid_str = "3b1f8b40-222c-4a6e-b77e-779d5a94e21c"
        shortuuid = "CXc85b4rqinB7s5J52TRYb"
        hyphenated = "CXc8-5b4r-qinB-7s5J-52TR-Yb"

        # Both should decode to same UUID
        decoded_plain = decode(shortuuid)
        decoded_hyphenated = decode(hyphenated)
        assert decoded_plain == decoded_hyphenated
        assert str(decoded_plain) == uuid_str

    def test_decode_invalid_length(self) -> None:
        """Verify decode raises error for wrong length."""
        with pytest.raises(ValueError, match="Invalid short UUID length"):
            decode("tooshort")

        with pytest.raises(ValueError, match="Invalid short UUID length"):
            decode("waytoolongtobevalidshortuuid")

    def test_decode_invalid_char(self) -> None:
        """Verify decode raises error for invalid characters."""
        # Contains '0' which is not in alphabet
        with pytest.raises(ValueError, match="Invalid character"):
            decode("CXc85b4rqinB7s5J52TR0b")

    def test_encode_type_error(self) -> None:
        """Verify encode raises error for non-UUID input."""
        with pytest.raises(TypeError):
            encode("not-a-uuid")  # type: ignore[arg-type]


class TestFormatDisplay:
    """Tests for format_display function."""

    def test_format_display_full(self, test_vectors: dict) -> None:
        """Verify full display formatting matches test vectors."""
        for vector in test_vectors["format_display_vectors"]:
            input_short = vector["input"]
            expected = vector["full"]
            actual = format_display(input_short)
            assert actual == expected, (
                f"Format mismatch for {input_short}: expected {expected}, got {actual}"
            )

    def test_format_display_truncate_8(self, test_vectors: dict) -> None:
        """Verify 8-char truncation formatting matches test vectors."""
        for vector in test_vectors["format_display_vectors"]:
            input_short = vector["input"]
            expected = vector["truncate_8"]
            actual = format_display(input_short, truncate=8)
            assert actual == expected, (
                f"Truncate 8 mismatch for {input_short}: "
                f"expected {expected}, got {actual}"
            )

    def test_format_display_truncate_12(self, test_vectors: dict) -> None:
        """Verify 12-char truncation formatting matches test vectors."""
        for vector in test_vectors["format_display_vectors"]:
            input_short = vector["input"]
            expected = vector["truncate_12"]
            actual = format_display(input_short, truncate=12)
            assert actual == expected, (
                f"Truncate 12 mismatch for {input_short}: "
                f"expected {expected}, got {actual}"
            )

    def test_format_display_strips_existing_hyphens(self) -> None:
        """Verify format_display handles already-hyphenated input."""
        hyphenated = "CXc8-5b4r-qinB"
        result = format_display(hyphenated, truncate=8)
        assert result == "CXc8-5b4r"

    def test_format_display_short_input(self) -> None:
        """Verify format_display handles input shorter than 4 chars."""
        assert format_display("abc") == "abc"
        assert format_display("ab") == "ab"
        assert format_display("a") == "a"

    def test_format_display_exactly_4_chars(self) -> None:
        """Verify format_display handles exactly 4 chars (no hyphen needed)."""
        assert format_display("abcd") == "abcd"


class TestValidation:
    """Tests for is_valid function."""

    def test_valid_shortuuids(self, test_vectors: dict) -> None:
        """Verify valid shortuuids pass validation."""
        for vector in test_vectors["validation_vectors"]:
            if vector["valid"]:
                assert is_valid(vector["input"]), (
                    f"Expected valid: {vector['input']} ({vector['comment']})"
                )

    def test_invalid_shortuuids(self, test_vectors: dict) -> None:
        """Verify invalid shortuuids fail validation."""
        for vector in test_vectors["validation_vectors"]:
            if not vector["valid"]:
                assert not is_valid(vector["input"]), (
                    f"Expected invalid: {vector['input']} ({vector['comment']})"
                )

    def test_generated_is_valid(self) -> None:
        """Verify generate() produces valid shortuuids."""
        for _ in range(10):
            shortuuid = generate()
            assert is_valid(shortuuid)


class TestHelperFunctions:
    """Tests for helper functions."""

    def test_strip_hyphens(self) -> None:
        """Verify strip_hyphens removes all hyphens."""
        assert strip_hyphens("CXc8-5b4r-qinB") == "CXc85b4rqinB"
        assert strip_hyphens("no-hyphens") == "nohyphens"
        assert strip_hyphens("nohyphens") == "nohyphens"
        assert strip_hyphens("") == ""

    def test_get_alphabet(self) -> None:
        """Verify get_alphabet returns expected alphabet."""
        alphabet = get_alphabet()
        assert alphabet == DEFAULT_ALPHABET
        assert len(alphabet) == 57

        # Verify excluded characters
        excluded = "01IOl"
        for char in excluded:
            assert char not in alphabet, f"Char '{char}' should be excluded"


class TestGenerate:
    """Tests for generate function."""

    def test_generate_unique(self) -> None:
        """Verify generate produces unique values."""
        generated = {generate() for _ in range(100)}
        assert len(generated) == 100, "Generated shortuuids should be unique"

    def test_generate_valid_format(self) -> None:
        """Verify generate produces valid 22-char strings."""
        for _ in range(10):
            shortuuid = generate()
            assert len(shortuuid) == 22
            assert is_valid(shortuuid)
