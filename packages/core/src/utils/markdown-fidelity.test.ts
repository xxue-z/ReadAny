import { describe, expect, it } from "vitest";
import { analyzeMarkdownFidelity } from "./markdown-fidelity";

describe("analyzeMarkdownFidelity", () => {
  it("accepts plain markdown the WYSIWYG editor can round-trip", () => {
    const report = analyzeMarkdownFidelity(
      "# Title\n\nSome **bold** text and a [link](https://example.com).\n\n- one\n- two\n",
    );
    expect(report).toEqual({ lossy: false, issues: [] });
  });

  it("flags GFM tables", () => {
    const report = analyzeMarkdownFidelity("# T\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n");
    expect(report.lossy).toBe(true);
    expect(report.issues).toContain("table");
  });

  it("flags images", () => {
    const report = analyzeMarkdownFidelity("# T\n\n![cover](./cover.png)\n");
    expect(report.issues).toContain("image");
  });

  it("flags task lists", () => {
    const report = analyzeMarkdownFidelity("# T\n\n- [ ] todo\n- [x] done\n");
    expect(report.issues).toContain("task-list");
  });

  it("ignores tables/images/tasks inside fenced code blocks", () => {
    const markdown = `# T

\`\`\`md
| a | b |
| --- | --- |
![x](y.png)
- [ ] todo
\`\`\`
`;
    expect(analyzeMarkdownFidelity(markdown)).toEqual({ lossy: false, issues: [] });
  });

  it("does not treat a lone pipe as a table", () => {
    expect(analyzeMarkdownFidelity("# T\n\n使用 a | b 表达“或”。\n").lossy).toBe(false);
  });

  it("handles empty input", () => {
    expect(analyzeMarkdownFidelity("")).toEqual({ lossy: false, issues: [] });
  });
});
