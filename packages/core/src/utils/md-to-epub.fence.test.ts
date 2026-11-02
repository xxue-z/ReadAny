import { describe, expect, it } from "vitest";
import { MdToEpubConverter, SOURCE_ENTRY } from "./md-to-epub";
import { recoverMarkdownSourceFromEpub } from "./md-source-recovery";

const converter = new MdToEpubConverter();

/** Directories have no `getData`; this narrows the ZIP entry union. */
interface ReadableZipEntry {
  filename: string;
  getData?: (writer: unknown) => Promise<unknown>;
}

async function readEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const { configure, ZipReader, Uint8ArrayReader, Uint8ArrayWriter } = await import(
    "@zip.js/zip.js"
  );
  configure({ useWebWorkers: false });
  const reader = new ZipReader(new Uint8ArrayReader(bytes));
  const entries = (await reader.getEntries()) as unknown as ReadableZipEntry[];
  const files = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (!entry.getData) continue;
    files.set(entry.filename, (await entry.getData(new Uint8ArrayWriter())) as Uint8Array);
  }
  await reader.close();
  return files;
}

const decoder = new TextDecoder();

function textOf(files: Map<string, Uint8Array>, name: string): string {
  const bytes = files.get(name);
  if (!bytes) throw new Error(`missing entry ${name}`);
  return decoder.decode(bytes);
}

describe("Markdown chapter splitting is fence-aware", () => {
  it("does not split on a # comment inside a fenced code block", async () => {
    const markdown = `# 部署手册

介绍文字。

## 安装步骤

\`\`\`bash
# 安装依赖
npm install
# 启动服务
npm run dev
\`\`\`

结束语。
`;
    const result = converter.convertToBytes({ markdown });
    expect(result.chapterCount).toBe(2);

    const entries = await readEntries(result.epubBytes);
    const chapters = [...entries.keys()].filter((name) => /^OEBPS\/chapter\d+\.xhtml$/.test(name));
    expect(chapters).toHaveLength(2);
    const body = chapters.map((name) => textOf(entries, name)).join("\n");
    expect(body).toContain("npm install");
    expect(body).toContain("npm run dev");
    expect(body).toContain("结束语");
    expect(body).not.toContain("<h2>安装依赖</h2>");
    // The shell block is still one code block.
    expect(body.match(/<pre><code/g)).toHaveLength(1);
  });

  it("handles tilde fences, longer fences and nested-looking markers", async () => {
    const markdown = `# Doc

~~~python
# not a heading
print(1)
~~~

\`\`\`\`md
# also not a heading
\`\`\`\`

## Real section

body
`;
    const result = converter.convertToBytes({ markdown });
    expect(result.chapterCount).toBe(2);
    const entries = await readEntries(result.epubBytes);
    const body = textOf(entries, "OEBPS/chapter1.xhtml");
    expect(body).toContain("# not a heading");
    expect(body).not.toContain("<h2>not a heading</h2>");
  });

  it("does not split on a # line inside an HTML comment", () => {
    const markdown = `# Doc

<!--
# commented heading
-->

body
`;
    const result = converter.convertToBytes({ markdown });
    expect(result.chapterCount).toBe(1);
  });

  it("drops YAML front matter from the rendered body", async () => {
    const markdown = `---
title: 未命名
tags: [a, b]
---

# 正文

content
`;
    const result = converter.convertToBytes({ markdown });
    expect(result.bookTitle).toBe("正文");
    const entries = await readEntries(result.epubBytes);
    const body = textOf(entries, "OEBPS/chapter1.xhtml");
    expect(body).not.toContain("tags: [a, b]");
    expect(body).toContain("content");
  });
});

describe("EPUB embeds the Markdown source for recovery", () => {
  it("writes OEBPS/source.md and lists it in the manifest", async () => {
    const markdown = "# 可恢复文档\n\n正文内容。\n";
    const result = converter.convertToBytes({ markdown });
    const entries = await readEntries(result.epubBytes);

    expect(textOf(entries, `OEBPS/${SOURCE_ENTRY}`)).toBe(markdown);
    const opf = textOf(entries, "content.opf");
    expect(opf).toContain(`href="OEBPS/${SOURCE_ENTRY}"`);
    expect(opf).toContain('media-type="text/markdown"');
  });

  it("recovers the source and images from the EPUB", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const markdown = "# 可恢复文档\n\n正文。\n\n![图](assets/book-1/pic.png)\n";
    const result = converter.convertToBytes({
      markdown,
      assets: { "assets/book-1/pic.png": png },
    });

    const recovered = await recoverMarkdownSourceFromEpub(result.epubBytes);
    expect(recovered).not.toBeNull();
    expect(recovered?.markdown).toBe(markdown);
    expect(recovered?.assets).toHaveLength(1);
    expect(recovered?.assets[0]?.path).toBe("assets/book-1/pic.png");
    expect([...(recovered?.assets[0]?.bytes ?? [])]).toEqual([...png]);
  });

  it("can be disabled for callers that do not want the extra entry", async () => {
    const result = converter.convertToBytes({ markdown: "# X\n\nbody", embedSource: false });
    const entries = await readEntries(result.epubBytes);
    expect(entries.has(`OEBPS/${SOURCE_ENTRY}`)).toBe(false);
    expect(await recoverMarkdownSourceFromEpub(result.epubBytes)).toBeNull();
  });

  it("returns null for an EPUB without embedded source", async () => {
    expect(await recoverMarkdownSourceFromEpub(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
