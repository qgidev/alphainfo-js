/**
 * Briefing 1 — JS/TS SDK tests for domain=auto + new response fields.
 *
 * Uses vi.spyOn to mock global.fetch so we can assert what the SDK sends
 * on the wire and verify parseAnalysis reads domain_applied /
 * domain_inference correctly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlphaInfo } from "../src/index.js";

function mockFetchReturning(body: Record<string, unknown>) {
  const lastRequest: { url?: string; body?: unknown } = {};
  const stub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    lastRequest.url = typeof input === "string" ? input : input.toString();
    lastRequest.body = init?.body ? JSON.parse(init.body as string) : undefined;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", stub);
  return { stub, lastRequest };
}

describe("AlphaInfo — domain=auto + domain_applied parsing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("analyzeAuto() forwards domain='auto' in the request body", async () => {
    const { lastRequest } = mockFetchReturning({
      structural_score: 0.42,
      change_detected: true,
      change_score: 0.58,
      confidence_band: "transition",
      engine_version: "e95c5d2",
      analysis_id: "r1",
      domain_applied: "biomedical",
      domain_inference: {
        inferred: "biomedical",
        confidence: 0.78,
        fallback_used: false,
        reasoning: "high_sampling_rate_with_periodic_structure",
      },
    });

    const c = new AlphaInfo({ apiKey: "ai_test_fake" });
    const r = await c.analyzeAuto({
      signal: Array.from({ length: 200 }, (_, i) => Math.sin(i / 10)),
      sampling_rate: 250,
    });
    expect((lastRequest.body as Record<string, unknown>).domain).toBe("auto");
    expect(r.domain_applied).toBe("biomedical");
    expect(r.domain_inference?.inferred).toBe("biomedical");
    expect(r.domain_inference?.confidence).toBe(0.78);
    expect(r.domain_inference?.fallback_used).toBe(false);
  });

  it("parseAnalysis leaves domain_inference undefined when server omits it", async () => {
    mockFetchReturning({
      structural_score: 0.87,
      change_detected: false,
      change_score: 0.13,
      confidence_band: "stable",
      engine_version: "e95c5d2",
      analysis_id: "r2",
      domain_applied: "generic",
      // no domain_inference
    });

    const c = new AlphaInfo({ apiKey: "ai_test_fake" });
    const r = await c.analyze({ signal: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], sampling_rate: 1 });
    expect(r.domain_applied).toBe("generic");
    expect(r.domain_inference).toBeUndefined();
  });

  it("accepts legacy-server responses without domain_* fields", async () => {
    mockFetchReturning({
      structural_score: 0.5,
      change_detected: false,
      change_score: 0.5,
      confidence_band: "transition",
      engine_version: "1.5.10",
      analysis_id: "legacy-1",
    });

    const c = new AlphaInfo({ apiKey: "ai_test_fake" });
    const r = await c.analyze({ signal: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], sampling_rate: 1 });
    expect(r.domain_applied).toBeUndefined();
    expect(r.domain_inference).toBeUndefined();
  });
});
