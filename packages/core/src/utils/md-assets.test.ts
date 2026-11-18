import { describe, expect, it } from "vitest";
import { collectMarkdownAssets } from "./md-assets";

const encoder = new TextEncoder();

describe("collectMarkdownAssets", () => {
  it("rewrites only image-token srcs, leaving code blocks and longer paths untouched", async () => {
    const markdown = [
      "# Doc",
      "",
      "![diagram](img/a.png)",
      '<img src="img/a.png" alt="inline">',
      "",
      "```text",
      "reference: img/a.png",
      "```",
      "",
      "See also img/a.png@2x (not an image token).",
    ].join("\n");

    const visited: string[] = [];
    const { markdown: rewritten, assets } = await collectMarkdownAssets({
      markdown,
      readAsset: async (relativePath) => {
        visited.push(relativePath);
        return encoder.encode("bytes");
      },
      persistAsset: async () => "assets/b1/persisted.png",
    });

    expect(visited).toEqual(["img/a.png"]);
    expect(rewritten).toContain("![diagram](assets/b1/persisted.png)");
    expect(rewritten).toContain('<img src="assets/b1/persisted.png" alt="inline">');
    // Code fences and prose that merely mention the path must stay untouched.
    expect(rewritten).toContain("reference: img/a.png");
    expect(rewritten).toContain("See also img/a.png@2x (not an image token).");
    expect(assets["assets/b1/persisted.png"]).toEqual(encoder.encode("bytes"));
  });

  it("ignores image-like tokens inside fenced code blocks", async () => {
    const markdown = [
      "# Doc",
      "",
      "```md",
      "![fake](img/a.png)",
      "```",
      "",
      "![real](img/a.png)",
    ].join("\n");
    const visited: string[] = [];
    const { markdown: rewritten } = await collectMarkdownAssets({
      markdown,
      readAsset: async (relativePath) => {
        visited.push(relativePath);
        return encoder.encode("bytes");
      },
      persistAsset: async () => "assets/b1/persisted.png",
    });

    expect(visited).toEqual(["img/a.png"]);
    expect(rewritten).toContain("![fake](img/a.png)");
    expect(rewritten).toContain("![real](assets/b1/persisted.png)");
  });

  it("persists a shared src once and rewrites every occurrence", async () => {
    const calls: string[] = [];
    const { markdown: rewritten } = await collectMarkdownAssets({
      markdown: "![a](img/a.png)\n\n![b](img/a.png)",
      readAsset: async () => encoder.encode("bytes"),
      persistAsset: async (fileName) => {
        calls.push(fileName);
        return `assets/x/${fileName}`;
      },
    });

    expect(calls).toHaveLength(1);
    const occurrences = rewritten.split("assets/x/").length - 1;
    expect(occurrences).toBe(2);
  });

  it("keeps a title on markdown images and handles single-quoted html srcs", async () => {
    const { markdown: rewritten } = await collectMarkdownAssets({
      markdown: "![a](img/a.png \"the title\")\n<img src='img/a.png' />",
      readAsset: async () => encoder.encode("bytes"),
      persistAsset: async () => "assets/b1/persisted.png",
    });

    expect(rewritten).toContain('![a](assets/b1/persisted.png "the title")');
    expect(rewritten).toContain("<img src='assets/b1/persisted.png' />");
  });

  it("keeps the original src when persistence fails", async () => {
    const { markdown: rewritten, assets } = await collectMarkdownAssets({
      markdown: "![a](img/a.png)",
      readAsset: async () => encoder.encode("bytes"),
      persistAsset: async () => {
        throw new Error("disk full");
      },
    });

    expect(rewritten).toBe("![a](img/a.png)");
    expect(assets["img/a.png"]).toBeDefined();
  });
});