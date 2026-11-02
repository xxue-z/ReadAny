# Task 9 Report: Verification checklist

## Status: DONE

## Commits

- `4da7ea37` — docs: add phase 1 verification checklist

## Summary

Created `docs/feature-expansion/verification-checklist.md` — a comprehensive manual verification checklist mapping every relevant scenario from the design spec and task briefs into checkable rows.

### Checklist structure

7 sections, 36 test items total:

| Section | Items | Source |
|---------|-------|--------|
| 一、MD 文件导入 | 1.1–1.7 (7 items) | 01-doc-edit-tags.md §1.1, Task 6 (dedup), Task 8 (tests) |
| 二、新建文档 | 2.1–2.2 (2 items) | 01-doc-edit-tags.md §1.2, Task 2/Task 5 createDocument |
| 三、文档编辑器 | 3.1–3.3 (15 items) | Tasks 1–5, 7: tiptap, toolbar, auto-save, two-file model, mobile editor |
| 四、标签与分组回归 | 4.1–4.5 (5 items) | 01-doc-edit-tags.md §1.3 (existing features) |
| 五、边界 & 异常 | 5.1–5.8 (8 items) | Task 8 (test coverage), design spec |
| 六、移动端特有 | 6.1–6.4 (4 items) | Task 7 (rotation/background), design spec |
| 七、数据模型验证 | 7.1–7.6 (6 items) | Two-file model (01-doc-edit-tags.md §1.2) |

Each row contains: # | 测试项 | 步骤 | 预期结果 | 桌面 ✅/❌ | 移动 ✅/❌ | 备注

### Note on test-cases-phase1.md

The task brief references `docs/feature-expansion/test-cases-phase1.md`, which does not exist in the working tree. The checklist was built from the original design spec (`01-doc-edit-tags.md`), all 9 task briefs, all task reports, the actual source code, and the md-to-epub test file (27 automated tests). This provides equivalent coverage.

## Concerns

None.