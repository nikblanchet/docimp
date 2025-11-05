# Prompt Modification Guide for Testing

**File to modify:** `analyzer/src/claude/prompt_builder.py` **Lines to modify:** After
line 274, before line 276

## Current Code (Lines 267-278)

```python
        prompt_parts.extend([
            "",
            "Requirements:",
            f"1. Return ONLY the documentation for the {item_type} '{item_name}' - nothing else",
            "2. The surrounding code is for CONTEXT ONLY - do not document it",
            "3. Do not include the code itself, only the documentation",
            "4. Use the exact format shown in the example",
        ])

        # Add style-specific requirements
        style_language = style_info.get('language')
```

## Modification Location

Insert new requirements **AFTER line 274** (after the closing `])` of the requirements
list) and **BEFORE line 276** (before the `# Add style-specific requirements` comment).

---

## Option A: Explicit Code Fence Prohibition

### Code to Insert

````python
        # OPTION A: Prevent markdown code fence wrappers
        prompt_parts.extend([
            "5. IMPORTANT: Return the raw docstring text only. Do NOT wrap your entire response in markdown code fences (```python, ```javascript, etc.)",
            "6. Code examples WITHIN the docstring are fine and encouraged - just don't wrap the whole docstring in backticks",
        ])
````

### Full Modified Section (Lines 267-280)

````python
        prompt_parts.extend([
            "",
            "Requirements:",
            f"1. Return ONLY the documentation for the {item_type} '{item_name}' - nothing else",
            "2. The surrounding code is for CONTEXT ONLY - do not document it",
            "3. Do not include the code itself, only the documentation",
            "4. Use the exact format shown in the example",
        ])

        # OPTION A: Prevent markdown code fence wrappers
        prompt_parts.extend([
            "5. IMPORTANT: Return the raw docstring text only. Do NOT wrap your entire response in markdown code fences (```python, ```javascript, etc.)",
            "6. Code examples WITHIN the docstring are fine and encouraged - just don't wrap the whole docstring in backticks",
        ])

        # Add style-specific requirements
        style_language = style_info.get('language')

        if style_language == 'python':
            prompt_parts.extend([
                "7. Include type hints for all parameters and return values",  # NOTE: Changed from "5" to "7"
                "8. Use triple-quoted docstrings",  # NOTE: Changed from "6" to "8"
            ])
            # ... rest continues with adjusted numbering
````

**IMPORTANT:** You'll also need to adjust the numbering in the language-specific
requirements below (change "5" to "7", "6" to "8", etc.).

---

## Option B: Output Format Focused

### Code to Insert

```python
        # OPTION B: Explain output format and context
        prompt_parts.extend([
            "5. Your response will be inserted directly into the source file as-is",
            "6. Return only the documentation text that should appear in the file (e.g., triple-quoted string for Python, JSDoc comment for JavaScript)",
        ])
```

### Full Modified Section (Lines 267-280)

```python
        prompt_parts.extend([
            "",
            "Requirements:",
            f"1. Return ONLY the documentation for the {item_type} '{item_name}' - nothing else",
            "2. The surrounding code is for CONTEXT ONLY - do not document it",
            "3. Do not include the code itself, only the documentation",
            "4. Use the exact format shown in the example",
        ])

        # OPTION B: Explain output format and context
        prompt_parts.extend([
            "5. Your response will be inserted directly into the source file as-is",
            "6. Return only the documentation text that should appear in the file (e.g., triple-quoted string for Python, JSDoc comment for JavaScript)",
        ])

        # Add style-specific requirements
        style_language = style_info.get('language')

        if style_language == 'python':
            prompt_parts.extend([
                "7. Include type hints for all parameters and return values",  # NOTE: Changed from "5" to "7"
                "8. Use triple-quoted docstrings",  # NOTE: Changed from "6" to "8"
            ])
            # ... rest continues with adjusted numbering
```

**IMPORTANT:** Adjust numbering in language-specific requirements.

---

## Option C: Example-Based Format

### Code to Insert

````python
        # OPTION C: Show correct response format with examples
        prompt_parts.extend([
            "5. Response format - return ONLY the docstring content:",
            "   Python: \"\"\"Your documentation here\"\"\"",
            "   JavaScript/TypeScript: /** Your documentation here */",
            "6. Do NOT wrap your response in markdown code blocks like ```python or ```javascript",
        ])
````

### Full Modified Section (Lines 267-280)

````python
        prompt_parts.extend([
            "",
            "Requirements:",
            f"1. Return ONLY the documentation for the {item_type} '{item_name}' - nothing else",
            "2. The surrounding code is for CONTEXT ONLY - do not document it",
            "3. Do not include the code itself, only the documentation",
            "4. Use the exact format shown in the example",
        ])

        # OPTION C: Show correct response format with examples
        prompt_parts.extend([
            "5. Response format - return ONLY the docstring content:",
            "   Python: \"\"\"Your documentation here\"\"\"",
            "   JavaScript/TypeScript: /** Your documentation here */",
            "6. Do NOT wrap your response in markdown code blocks like ```python or ```javascript",
        ])

        # Add style-specific requirements
        style_language = style_info.get('language')

        if style_language == 'python':
            prompt_parts.extend([
                "7. Include type hints for all parameters and return values",  # NOTE: Changed from "5" to "7"
                "8. Use triple-quoted docstrings",  # NOTE: Changed from "6" to "8"
            ])
            # ... rest continues with adjusted numbering
````

**IMPORTANT:** Adjust numbering in language-specific requirements.

---

## Numbering Adjustment Required

For **all three options**, you must update the language-specific requirement numbers:

### Python Section (Lines 279-287)

```python
if style_language == 'python':
    prompt_parts.extend([
        "7. Include type hints for all parameters and return values",  # Changed: 5 → 7
        "8. Use triple-quoted docstrings",  # Changed: 6 → 8
    ])
    if self.style_guide == 'numpy-rest':
        prompt_parts.append("9. Use reStructuredText markup: *italic*, **bold*, ``code``")  # Changed: 7 → 9
    elif self.style_guide == 'numpy-markdown':
        prompt_parts.append("9. Use Markdown markup: *italic*, **bold**, `code`")  # Changed: 7 → 9
```

### JavaScript Section (Lines 288-305)

```python
elif style_language == 'javascript':
    prompt_parts.extend([
        "7. Ensure @param names exactly match the function parameter names",  # Changed: 5 → 7
        "8. Include type annotations for all parameters and return values",  # Changed: 6 → 8
    ])
    if self.style_guide == 'jsdoc-vanilla':
        prompt_parts.append("9. Use @returns (not @return)")  # Changed: 7 → 9
    elif self.style_guide == 'jsdoc-google':
        prompt_parts.extend([
            "9. Use @return (not @returns)",  # Changed: 7 → 9
            "10. End descriptions with periods",  # Changed: 8 → 10
            "11. No hyphens after parameter names",  # Changed: 9 → 11
        ])
    elif self.style_guide == 'jsdoc-closure':
        prompt_parts.extend([
            "9. Use @return (not @returns)",  # Changed: 7 → 9
            "10. Include @public, @private, or @protected annotations",  # Changed: 8 → 10
        ])
```

### TypeScript Section (Lines 306-326)

```python
elif style_language == 'typescript':
    if self.style_guide == 'tsdoc-typedoc':
        prompt_parts.extend([
            "7. Use TSDoc format with hyphens after parameter names",  # Changed: 5 → 7
            "8. Use @returns (not @return)",  # Changed: 6 → 8
            "9. Types are inferred from TypeScript signatures",  # Changed: 7 → 9
            "10. Include @remarks for additional details",  # Changed: 8 → 10
        ])
    elif self.style_guide == 'tsdoc-aedoc':
        prompt_parts.extend([
            "7. Use TSDoc format with hyphens after parameter names",  # Changed: 5 → 7
            "8. Use @returns (not @return)",  # Changed: 6 → 8
            "9. Include @public, @beta, or @internal annotations",  # Changed: 7 → 9
            "10. Types are inferred from TypeScript signatures",  # Changed: 8 → 10
        ])
    elif self.style_guide == 'jsdoc-ts':
        prompt_parts.extend([
            "7. Use JSDoc format with explicit type annotations",  # Changed: 5 → 7
            "8. Include {type} annotations even though TypeScript provides types",  # Changed: 6 → 8
            "9. Use @returns (not @return)",  # Changed: 7 → 9
        ])
```

---

## Testing Workflow

1. **Backup original file:**

   ```bash
   cp analyzer/src/claude/prompt_builder.py analyzer/src/claude/prompt_builder.py.backup
   ```

2. **Test Option A:**
   - Apply Option A modifications
   - Run manual tests (see MANUAL_TEST_PROMPT_WORDINGS.md)
   - Record results in `RESULTS_OPTION_A.md`
   - Restore files: `cd test-samples/example-project && git restore src/`

3. **Test Option B:**
   - Restore prompt_builder.py from backup
   - Apply Option B modifications
   - Run manual tests
   - Record results in `RESULTS_OPTION_B.md`
   - Restore files

4. **Test Option C:**
   - Restore prompt_builder.py from backup
   - Apply Option C modifications
   - Run manual tests
   - Record results in `RESULTS_OPTION_C.md`
   - Restore files

5. **Restore original:**
   ```bash
   mv analyzer/src/claude/prompt_builder.py.backup analyzer/src/claude/prompt_builder.py
   ```

## Quick Test: Verify Prompt Output

After modifying, you can test the prompt generation without running improve:

```python
from analyzer.src.claude.prompt_builder import PromptBuilder

builder = PromptBuilder(style_guide='google', tone='concise')
prompt = builder.build_prompt(
    code="def add(a, b):\n    return a + b",
    item_name="add",
    item_type="function",
    language="python"
)

print(prompt)
# Check that your new requirements (5 and 6) are present
```

This lets you verify the prompt contains your modifications before running the full
improve workflow.
