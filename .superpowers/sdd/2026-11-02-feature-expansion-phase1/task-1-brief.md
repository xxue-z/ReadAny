# Task 1: Fix DocumentWorkspace bugs (missing imports, duplicate declarations)

## Files

- Modify: `packages/app/src/components/editor/DocumentWorkspace.tsx`

## Steps

- [ ] **Step 1: Fix `resolveDesktopDataPath` import**

Add the missing import at the top of the file:
```ts
import { resolveDesktopDataPath } from "@/lib/storage/desktop-library-root";
```
The function is used on line 87 without being imported — this would throw `ReferenceError` at runtime.

- [ ] **Step 2: Remove duplicate `const { join }` declarations**

Currently lines 83 and 91-92 both declare `const { join } = await import("@tauri-apps/api/path");`. Remove the second declaration (lines 91-92) and reuse the `join` already declared on line 83.

- [ ] **Step 3: Verify the fix compiles**

Run: `cd packages/app && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/components/editor/DocumentWorkspace.tsx
git commit -m "fix: add missing resolveDesktopDataPath import and remove duplicate join in DocumentWorkspace"
```

## Spec Ref

From `docs/feature-expansion/01-doc-edit-tags.md`:
- MD 编辑器（桌面）：复用现有 tiptap MarkdownEditor，增加两文件存储模型
- 编辑器始终读写 .md 文件
- 保存时：写 .md → 调 MdToEpubConverter 重新生成 .epub → 更新 Book 元数据