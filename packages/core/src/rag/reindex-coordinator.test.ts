import { describe, expect, it, vi } from "vitest";
import { PerBookReindexCoordinator } from "./reindex-coordinator";

describe("PerBookReindexCoordinator", () => {
  it("aborts the previous run and keeps only the newest run current", async () => {
    const coordinator = new PerBookReindexCoordinator();
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const observed: { signal?: AbortSignal; current?: () => boolean } = {};

    const first = coordinator.schedule("book-1", async (context) => {
      observed.signal = context.signal;
      observed.current = context.isCurrent;
      await firstGate;
    });

    const secondRun = vi.fn(async () => undefined);
    const second = coordinator.schedule("book-1", secondRun);
    await Promise.resolve();

    expect(observed.signal?.aborted).toBe(true);
    expect(observed.current?.()).toBe(false);
    releaseFirst();
    await Promise.all([first, second]);
    expect(secondRun).toHaveBeenCalledOnce();
    expect(coordinator.isRunning("book-1")).toBe(false);
  });

  it("cancel prevents a queued run from remaining current", async () => {
    const coordinator = new PerBookReindexCoordinator();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const observed: { current?: () => boolean } = {};

    const run = coordinator.schedule("book-2", async (context) => {
      observed.current = context.isCurrent;
      await gate;
    });
    await Promise.resolve();

    coordinator.cancel("book-2");
    expect(observed.current?.()).toBe(false);
    expect(coordinator.isRunning("book-2")).toBe(false);
    release();
    await run;
  });
});
