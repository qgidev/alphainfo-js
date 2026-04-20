/**
 * tests/cleanup.test.ts — Block 1.2
 *
 * Verifies the close() / Symbol.asyncDispose contract added in 1.5.11.
 */

import { describe, expect, it } from "vitest";
import { AlphaInfo, NetworkError } from "../src/index.js";

describe("AlphaInfo cleanup contract", () => {
  it("close() is idempotent", async () => {
    const c = new AlphaInfo({ apiKey: "ai_test_fake" });
    await c.close();
    await c.close(); // must not throw
  });

  it("requests after close() reject with NetworkError", async () => {
    const c = new AlphaInfo({ apiKey: "ai_test_fake" });
    await c.close();
    await expect(
      c.analyze({ signal: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], sampling_rate: 1 }),
    ).rejects.toBeInstanceOf(NetworkError);
  });

  it("[Symbol.asyncDispose] calls close()", async () => {
    const c = new AlphaInfo({ apiKey: "ai_test_fake" });
    // invoke the disposer directly (simulates TS 5.2+ `await using`)
    await c[Symbol.asyncDispose]();
    await expect(
      c.analyze({ signal: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], sampling_rate: 1 }),
    ).rejects.toBeInstanceOf(NetworkError);
  });
});
