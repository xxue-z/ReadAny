# Task 6: Integration verification checklist

## Files
- Modify: `docs/feature-expansion/verification-checklist.md` — add Phase 2 section

## Steps

- [ ] **Step 1: Read existing checklist**

Read `docs/feature-expansion/verification-checklist.md` to understand the format.

- [ ] **Step 2: Add "八、跨格式笔记" section**

Add 6 manual verification rows:

| # | 测试项 | 步骤 | 预期结果 | 桌面 | 备注 |
|---|--------|------|----------|------|------|
| 1 | EPUB 高亮迁移 | 打开已有 EPUB 高亮的书 | 高亮位置不变，颜色不变，笔记不变 | | T1 migration v14 |
| 2 | PDF 文本选择 | 打开 PDF → 拖拽选择文本 → 点击高亮 | 创建高亮，quad_points 有值 | | T2 selection layer |
| 3 | PDF 高亮重新打开 | 关闭书 → 重新打开 → 翻到高亮页 | 彩色叠加层显示在正确文字位置 | | T3 overlay rendering |
| 4 | PDF 高亮缩放适应性 | 100% 创建高亮 → 150% 重新打开 | 叠加层仍对齐文字 | | T3 viewport scaling |
| 5 | CBZ 页面笔记 | 打开 CBZ → 点击添加页面笔记 → 输入内容 | 创建笔记，NotebookPanel 显示 "Page N note" | | T4 CBZ notes |
| 6 | 格式感知 UI | 打开混有 EPUB/CBZ 笔记的 NotebookPanel | EPUB 显示文字摘录，CBZ 显示页面号 | | T4 format-aware |

- [ ] **Step 3: Commit**

```bash
git add docs/feature-expansion/verification-checklist.md
git commit -m "docs: add Phase 2 cross-format notes verification checklist"
```