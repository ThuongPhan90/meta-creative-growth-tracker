import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  it("preserves result order while respecting the concurrency limit", async () => {
    let active = 0;
    let peak = 0;

    const results = await mapWithConcurrency(
      [30, 5, 20, 10],
      2,
      async (delay, index) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, delay));
        active -= 1;
        return `item-${index}`;
      },
    );

    expect(peak).toBe(2);
    expect(results).toEqual(["item-0", "item-1", "item-2", "item-3"]);
  });

  it("rejects invalid concurrency values", async () => {
    await expect(
      mapWithConcurrency([1], 0, async (value) => value),
    ).rejects.toThrow("concurrency must be a positive integer");
  });

  it("waits for active workers and stops claiming work after a failure", async () => {
    const started: number[] = [];
    let activeWorkerFinished = false;

    await expect(
      mapWithConcurrency([0, 1, 2], 2, async (value) => {
        started.push(value);
        if (value === 0) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          throw new Error("worker failed");
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
        activeWorkerFinished = true;
        return value;
      }),
    ).rejects.toThrow("worker failed");

    expect(activeWorkerFinished).toBe(true);
    expect(started).toEqual([0, 1]);
  });
});
