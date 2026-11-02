/**
 * Markdown fidelity analysis.
 *
 * The desktop document editor is a WYSIWYG tiptap instance whose extension set
 * (StarterKit) cannot represent GFM tables or images: loading such a document
 * silently drops them, and the next save writes the loss back to disk. Before
 * handing a document to that editor we therefore detect constructs it would
 * lose, so the UI can fall back to a lossless source editor.
 */

export type MarkdownFidelityIssue = "table" | "image" | "task-list";

export interface MarkdownFidelityReport {
  /** True when the WYSIWYG editor would drop or mangle content. */
  lossy: boolean;
  issues: MarkdownFidelityIssue[];
}

const TASK_LIST_PATTERN = /^\s*[-*+]\s+\[[ xX]\]\s/;
const IMAGE_PATTERN = /!\[[^\]]*\]\([^)]+\)/;
const TABLE_SEPARATOR_PATTERN = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

/**
 * Detect constructs that a StarterKit-only tiptap editor cannot round-trip.
 * Fenced code blocks are skipped: code is preserved verbatim by the editor.
 */
export function analyzeMarkdownFidelity(markdown: string): MarkdownFidelityReport {
  const issues = new Set<MarkdownFidelityIssue>();
  if (!markdown) return { lossy: false, issues: [] };

  const lines = markdown.split(/\r?\n/);
  let fence: string | null = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";

    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (fenceMatch?.[1]?.[0] === fence[0] && (fenceMatch?.[1]?.length ?? 0) >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fenceMatch?.[1]) {
      fence = fenceMatch[1];
      continue;
    }

    if (IMAGE_PATTERN.test(line)) issues.add("image");
    if (TASK_LIST_PATTERN.test(line)) issues.add("task-list");

    // A table needs a header row containing `|` plus a separator row beneath it.
    if (line.includes("|") && !TABLE_SEPARATOR_PATTERN.test(line)) {
      const next = lines[index + 1] ?? "";
      if (TABLE_SEPARATOR_PATTERN.test(next)) issues.add("table");
    }
  }

  return { lossy: issues.size > 0, issues: [...issues] };
}
