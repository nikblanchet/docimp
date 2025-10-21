# Results: Option C - Example-Based Format

**Wording Tested:**
```python
"5. Response format - return ONLY the docstring content:",
"   Python: \"\"\"Your documentation here\"\"\"",
"   JavaScript/TypeScript: /** Your documentation here */",
"6. Do NOT wrap your response in markdown code blocks like ```python or ```javascript",
```

**Tester:** [Your name]
**Date:** [YYYY-MM-DD]
**API Model:** claude-sonnet-4-5-20250929
**Branch:** issue-234-test-prompt-wordings

---

## Summary Statistics

- **Total functions tested:** 0 / 10
- **Clean responses (no markdown wrappers):** 0
- **Markdown-wrapped responses:** 0
- **Syntax errors after insertion:** 0
- **Functions with code examples in docstring:** 0
- **Success rate:** 0%

---

## Detailed Results

| # | Language | File | Function | Has Markdown Wrapper? | Syntax Valid? | Has Code Example? | Notes |
|---|----------|------|----------|----------------------|---------------|-------------------|-------|
| 1 | Python | calculator.py | multiply | | | | |
| 2 | Python | calculator.py | power | | | | |
| 3 | Python | validator.py | validate_username | | | | |
| 4 | Python | validator.py | sanitize_input | | | | |
| 5 | JavaScript | helpers.cjs | clone | | | | |
| 6 | JavaScript | helpers.cjs | merge | | | | |
| 7 | JavaScript | helpers.cjs | generateRandomString | | | | |
| 8 | JavaScript | api.js | post | | | | |
| 9 | TypeScript | service.ts | createUser | | | | |
| 10 | TypeScript | service.ts | deleteUser | | | | |
| 11 | TypeScript | service.ts | validateUser | | | | |

**Legend:**
- Has Markdown Wrapper?: `Yes` / `No` / `Partial`
- Syntax Valid?: `Yes` / `No`
- Has Code Example?: `Yes` / `No` / `N/A` (not applicable for simple functions)

---

## Notable Observations

### Positive Findings

[Record anything that worked well]

### Issues Encountered

[Record any problems, unexpected behavior, or edge cases]

### Unexpected Behavior

[Record anything surprising or noteworthy]

---

## Sample Responses

### Example 1: [Function Name]

**Response from Claude:**
```
[Paste the exact response here]
```

**After Insertion (first 10 lines):**
```
[Show what the file looked like after insertion]
```

**Assessment:** [Clean / Has markdown wrapper / Syntax error / etc.]

---

### Example 2: [Another Function]

[Repeat for 2-3 representative examples]

---

## Recommendation

**Should Option C be adopted?** [Yes / No / Maybe]

**Reasoning:**

[Explain your recommendation based on the data]

**Confidence Level:** [High / Medium / Low]

**Concerns:**

[List any concerns or caveats]

---

## Comparison Notes

[After testing all options, come back and add comparative notes]
