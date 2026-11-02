# Task 8 Report

## Status: DONE

## Commits

- `5fc80bb0` — test: enhance md-to-epub tests covering edge cases and test-cases-phase1 scenarios

## Tests

- **27 passed / 0 failed**
- Original: 23 tests
- Added: 4 new test cases in 4 new `describe` blocks

## Summary

Added 4 new test cases to `packages/core/src/utils/md-to-epub.test.ts`:

1. **XML escaping in XHTML chapter body** — Verifies that `& < > "` in chapter body text are HTML-escaped (`&amp;`, `&lt;`, `&gt;`, `&quot;`) by marked's built-in escaping in the final XHTML output. Previously only NCX escaping was tested.

2. **Large markdown input (5000 lines)** — Generates 5000 lines of markdown and confirms `convertToBytes` completes without error, producing a valid EPUB structure with correct metadata.

3. **Mixed CJK + Latin language detection edge cases** — Two tests near the `cjkCount > 0.5 × latinCount` threshold:
   - Near-threshold but still English: ~400 latin chars, ~100 CJK chars → "en"
   - Just-crossed threshold: ~400 latin chars, ~204 CJK chars → "zh"
   - **Note**: Adjusted from the brief — `"测试测试".repeat(26)` (104 chars) does not cross the threshold (400 × 0.5 = 200); used `"测试测试".repeat(51)` (204 chars) instead.

4. **Whitespace-only markdown** — Verifies that `"   \n\n  \n"` produces a single chapter with title "Untitled" and valid EPUB bytes.

## Concerns

- None. All tests pass. The language detection threshold edge-case numbers in the task brief were slightly off — `"测试测试".repeat(26)` produces only 104 CJK chars which is below the 200 threshold (0.5 × ~400 latin chars). Corrected to `"测试测试".repeat(51)` (204 CJK chars) to actually cross the threshold.