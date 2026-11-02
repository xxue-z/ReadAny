# Task 5 Report: End-to-end test suite

## Status: ✅ Complete

## Summary

Created `packages/core/src/__tests__/pdf-highlight-quads.test.ts` with 7 test cases covering:

1. **quadPoints serialization** (3 tests)
   - JSON roundtrip for PDF quad-points number arrays
   - Undefined quadPoints for EPUB highlights (no quads)
   - NULL handling in database (null string → undefined)

2. **Highlight type compatibility** (2 tests)
   - EPUB highlight: no `quadPoints` property
   - PDF highlight: has `quadPoints` with 8 elements (4 corners × 2 coordinates)

3. **CBZ page note CFI format** (2 tests)
   - CFI generation (`page-${pageN}`)
   - CFI parsing with regex (`/^page-(\d+)$/`)

## Test Results

```
 ✓ packages/core/src/__tests__/pdf-highlight-quads.test.ts (7 tests) 8ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
```

## Commit

`29e57f5c` — `test: add PDF quad-points serialization and CBZ note CFI tests`

## Notes

- The `Highlight` type in `packages/core/src/types/annotation.ts` already defines `quadPoints?: number[]`, consistent with the test expectations.
- All tests are pure unit tests with no external dependencies; they run in <10ms.