/**
 * Core behavior tests for the alphainfo TS client.
 *
 * The HTTP layer is stubbed via a replaced global `fetch`, so these
 * tests run without any network access.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AlphaInfo,
  AuthError,
  MIN_FINGERPRINT_SAMPLES,
  MIN_FINGERPRINT_SAMPLES_WITH_BASELINE,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "../src/index.js";

type MockFetch = ReturnType<typeof vi.fn>;

function mockResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("public constants", () => {
  it("matches server-side fingerprint thresholds", () => {
    expect(MIN_FINGERPRINT_SAMPLES).toBe(192);
    expect(MIN_FINGERPRINT_SAMPLES_WITH_BASELINE).toBe(50);
    expect(MIN_FINGERPRINT_SAMPLES).toBeGreaterThan(MIN_FINGERPRINT_SAMPLES_WITH_BASELINE);
  });
});

describe("AlphaInfo constructor", () => {
  it("requires an API key", () => {
    expect(() => new AlphaInfo({ apiKey: "" })).toThrow(/https:\/\/alphainfo\.io\/register/);
  });
});

describe("fingerprint — threshold warning", () => {
  let fetchMock: MockFetch;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        analysis_id: "abc",
        structural_score: 0.5,
        confidence_band: "transition",
        change_detected: false,
        change_score: 0.5,
        engine_version: "t",
        metrics: {
          sim_local: null,
          sim_spectral: null,
          sim_fractal: null,
          sim_transition: null,
          sim_trend: null,
          fingerprint_available: false,
          fingerprint_reason: "signal_too_short",
        },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("warns when signal is shorter than the no-baseline threshold", async () => {
    const client = new AlphaInfo({ apiKey: "ai_test", baseUrl: "http://x" });
    const fp = await client.fingerprint({
      signal: new Array(50).fill(0).map((_, i) => Math.sin(i / 10)),
      sampling_rate: 1,
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = warnSpy.mock.calls[0][0] as string;
    expect(msg).toContain(`≥${MIN_FINGERPRINT_SAMPLES}`);
    expect(fp.isComplete).toBe(false);
    expect(fp.vector).toBeNull();
    expect(fp.fingerprint_reason).toBe("signal_too_short");
  });

  it("does not warn at or above the threshold", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        analysis_id: "abc",
        structural_score: 0.9,
        confidence_band: "stable",
        change_detected: false,
        change_score: 0.1,
        engine_version: "t",
        metrics: {
          sim_local: 0.9,
          sim_spectral: 0.9,
          sim_fractal: 0.9,
          sim_transition: 0.9,
          sim_trend: 0.9,
          fingerprint_available: true,
          fingerprint_reason: null,
        },
      }),
    );
    const client = new AlphaInfo({ apiKey: "ai_test", baseUrl: "http://x" });
    const fp = await client.fingerprint({
      signal: new Array(MIN_FINGERPRINT_SAMPLES).fill(0).map((_, i) => Math.sin(i / 10)),
      sampling_rate: 1,
    });
    expect(warnSpy).not.toHaveBeenCalled();
    expect(fp.isComplete).toBe(true);
    expect(fp.vector).toEqual([0.9, 0.9, 0.9, 0.9, 0.9]);
  });

  it("uses the lower with-baseline threshold", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        analysis_id: "abc",
        structural_score: 0.9,
        confidence_band: "stable",
        change_detected: false,
        change_score: 0.1,
        engine_version: "t",
        metrics: {
          sim_local: 0.9,
          sim_spectral: 0.9,
          sim_fractal: 0.9,
          sim_transition: 0.9,
          sim_trend: 0.9,
          fingerprint_available: true,
          fingerprint_reason: null,
        },
      }),
    );
    const client = new AlphaInfo({ apiKey: "ai_test", baseUrl: "http://x" });
    const signal = new Array(60).fill(0).map((_, i) => Math.sin(i / 10));
    await client.fingerprint({ signal, sampling_rate: 1, baseline: signal });
    // 60 is >= 50 (with-baseline threshold) and >= 192 is false — no warn.
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("FingerprintResult.vector — silent-zero regression guard", () => {
  it("never substitutes zeros for missing sim_*; vector is null", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        analysis_id: "abc",
        structural_score: 0.5,
        confidence_band: "transition",
        change_detected: false,
        change_score: 0.5,
        engine_version: "t",
        metrics: {
          sim_local: null,
          sim_spectral: null,
          sim_fractal: null,
          sim_transition: null,
          sim_trend: null,
          fingerprint_available: false,
          fingerprint_reason: "signal_too_short",
        },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = new AlphaInfo({ apiKey: "ai_test", baseUrl: "http://x" });
    const fp = await client.fingerprint({
      signal: new Array(20).fill(0).map((_, i) => i),
      sampling_rate: 1,
    });
    expect(fp.sim_local).toBeNull();
    expect(fp.sim_spectral).toBeNull();
    expect(fp.vector).toBeNull();
    warnSpy.mockRestore();
  });
});

describe("error mapping", () => {
  it("401 → AuthError with register URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ detail: "Invalid API key" }, { status: 401 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const client = new AlphaInfo({ apiKey: "ai_test", baseUrl: "http://x" });
    await expect(
      client.analyze({ signal: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], sampling_rate: 1 }),
    ).rejects.toThrow(AuthError);
    await expect(
      client.analyze({ signal: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], sampling_rate: 1 }),
    ).rejects.toThrow(/alphainfo\.io\/register/);
  });

  it("429 → RateLimitError with retryAfter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ detail: "Rate limit exceeded" }, {
        status: 429,
        headers: { "Retry-After": "42" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const client = new AlphaInfo({ apiKey: "ai_test", baseUrl: "http://x" });
    try {
      await client.analyze({ signal: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], sampling_rate: 1 });
      throw new Error("expected RateLimitError");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as RateLimitError).retryAfter).toBe(42);
    }
  });

  it("404 from auditReplay → NotFoundError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ detail: "Not found" }, { status: 404 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const client = new AlphaInfo({ apiKey: "ai_test", baseUrl: "http://x" });
    await expect(client.auditReplay("0".repeat(36))).rejects.toThrow(NotFoundError);
  });

  it("empty analysisId → ValidationError without any fetch call", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const client = new AlphaInfo({ apiKey: "ai_test", baseUrl: "http://x" });
    await expect(client.auditReplay("")).rejects.toThrow(ValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("rate limit info", () => {
  it("reads X-RateLimit-* headers from responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(
        {
          analysis_id: "a",
          structural_score: 0.9,
          change_detected: false,
          change_score: 0.1,
          confidence_band: "stable",
          engine_version: "t",
        },
        {
          headers: {
            "X-RateLimit-Limit": "100",
            "X-RateLimit-Remaining": "73",
            "X-RateLimit-Reset": "1234567890",
          },
        },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const client = new AlphaInfo({ apiKey: "ai_test", baseUrl: "http://x" });
    expect(client.rateLimitInfo).toBeNull();
    await client.analyze({
      signal: new Array(200).fill(0),
      sampling_rate: 1,
    });
    expect(client.rateLimitInfo).toEqual({ limit: 100, remaining: 73, reset: 1234567890 });
  });
});
