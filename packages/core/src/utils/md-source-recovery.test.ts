import { describe, expect, it } from "vitest";
import { isSafeAssetRelativePath } from "./md-source-recovery";

describe("isSafeAssetRelativePath", () => {
  it("accepts normal library-relative asset paths", () => {
    expect(isSafeAssetRelativePath("assets/book-1/image.png")).toBe(true);
    expect(isSafeAssetRelativePath("image.png")).toBe(true);
  });

  it("rejects zip-slip and absolute paths", () => {
    expect(isSafeAssetRelativePath("../outside.png")).toBe(false);
    expect(isSafeAssetRelativePath("assets/../../outside.png")).toBe(false);
    expect(isSafeAssetRelativePath("/etc/outside.png")).toBe(false);
    expect(isSafeAssetRelativePath("C:/outside.png")).toBe(false);
    expect(isSafeAssetRelativePath("assets\\..\\outside.png")).toBe(false);
    expect(isSafeAssetRelativePath("assets//outside.png")).toBe(false);
  });
});
