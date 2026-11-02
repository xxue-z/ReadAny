# Task 9: Integration smoke test — verification checklist

## Files

- Create: `docs/feature-expansion/verification-checklist.md`

## Steps

- [ ] **Step 1: Create the verification checklist document**

Create `docs/feature-expansion/verification-checklist.md` with the following content. This is a documentation-only task — no code changes.

The checklist must cover every scenario from `docs/feature-expansion/test-cases-phase1.md` that is relevant to the implemented features, structured as a markdown table with columns: # | 测试项 | 步骤 | 预期结果 | 桌面 | 移动 | 备注

Sections:

### 一、MD 文件导入
Cover test-cases 1.1-1.7: basic import, GFM table, code block, multi-chapter, no-heading fallback, XML special chars, duplicate import.

### 二、新建文档
Cover test-cases 2.1-2.2: desktop create, mobile create.

### 三、文档编辑器
Cover test-cases 3.1-3.3: desktop tiptap editor, desktop auto-save, mobile editor with toolbar + preview toggle + save.

### 四、标签与分组（回归）
Cover test-cases from section 4: tags on MD books, rename tags, move to group, delete group, filter by tag.

### 五、边界 & 异常
Cover test-cases from section 5: empty file, large file, English-only, mixed CJK/Latin, non-.md extension imported as .txt, offline, rapid consecutive create.

### 六、移动端特有
Cover test-cases from section 6: rotation, background, call/notification, low power.

### 七、数据模型验证
Verify the two-file model: `books/{id}.md` exists, `books/{id}.epub` exists, `Book.filePath` → `.epub`, editor reads `.md`.

Each row should have a checkbox for desktop and mobile verification results.

- [ ] **Step 2: Commit**

```bash
git add docs/feature-expansion/verification-checklist.md
git commit -m "docs: add phase 1 verification checklist"
```