/**
 * alphainfo — HTTP client (async, works in Node 18+ and modern browsers).
 *
 * All I/O goes through the Fetch API, which is a runtime builtin on Node 18+
 * and every supported browser. No http client library dependency.
 */

import {
  APIError,
  AlphaInfoError,
  AuthError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "./errors.js";
import {
  MIN_FINGERPRINT_SAMPLES,
  MIN_FINGERPRINT_SAMPLES_WITH_BASELINE,
} from "./types.js";
import type {
  AnalysisResult,
  AuditReplay,
  AuditSummary,
  BatchItemResult,
  BatchResult,
  ChannelResult,
  FingerprintResult,
  HealthStatus,
  MatrixResult,
  PlanInfo,
  RateLimitInfo,
  SemanticResult,
  VectorResult,
} from "./types.js";

const SDK_VERSION = "1.5.21";
const DEFAULT_BASE_URL = "https://www.alphainfo.io";
const DEFAULT_TIMEOUT_MS = 30_000;
const ANALYZE_TIMEOUT_MS = 120_000;

export interface AlphaInfoOptions {
  apiKey: string;
  baseUrl?: string;
  /** Default request timeout in ms (default 30_000). */
  timeoutMs?: number;
  /** Attach per-request AbortSignal for external cancellation. */
  signal?: AbortSignal;
}

interface RequestOptions {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function buildUrl(base: string, path: string): string {
  const trimmed = base.replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${trimmed}${normalized}`;
}

function extractRateLimit(headers: Headers): RateLimitInfo | null {
  const limit = parseInt(headers.get("x-ratelimit-limit") ?? "", 10);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return {
    limit,
    remaining: parseInt(headers.get("x-ratelimit-remaining") ?? "0", 10) || 0,
    reset: parseInt(headers.get("x-ratelimit-reset") ?? "0", 10) || 0,
  };
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asOptionalNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asBool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

// ---------------------------------------------------------------------------
// Response / error mapping
// ---------------------------------------------------------------------------

async function handleErrorResponse(response: Response): Promise<never> {
  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    // non-JSON body, leave {}
  }

  const status = response.status;
  const detail = data.detail;
  const detailMsg = typeof detail === "string"
    ? detail
    : isPlainObject(detail) && typeof detail.message === "string"
    ? detail.message
    : undefined;

  const common = { statusCode: status, responseData: data };

  if (status === 401) {
    throw new AuthError(undefined, common);
  }
  if (status === 400) {
    throw new ValidationError(
      `Validation error: ${detailMsg ?? "Bad request"}`,
      common,
    );
  }
  if (status === 413 || status === 422) {
    throw new ValidationError(
      `Payload invalid: ${detailMsg ?? "Unprocessable entity"}`,
      common,
    );
  }
  if (status === 404) {
    throw new NotFoundError(detailMsg ?? "Not found", common);
  }
  if (status === 429) {
    const header = response.headers.get("retry-after");
    const retryAfter = header ? parseInt(header, 10) || undefined : undefined;
    throw new RateLimitError(
      detailMsg ?? "Rate limit exceeded",
      { ...common, retryAfter },
    );
  }
  if (status >= 500) {
    throw new APIError(`Server error: ${detailMsg ?? "Internal server error"}`, common);
  }
  throw new APIError(`HTTP ${status}: ${detailMsg ?? response.statusText}`, common);
}

// ---------------------------------------------------------------------------
// Parsers (server JSON → typed dataclasses)
// ---------------------------------------------------------------------------

function parseSemantic(raw: unknown): SemanticResult | null {
  if (!isPlainObject(raw)) return null;
  const known = new Set([
    "summary",
    "alert_level",
    "recommended_action",
    "trend",
    "severity",
    "severity_score",
  ]);
  const details: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!known.has(k)) details[k] = v;
  }
  return {
    summary: asString(raw.summary, ""),
    alert_level: asString(raw.alert_level, "normal") as SemanticResult["alert_level"],
    recommended_action: typeof raw.recommended_action === "string"
      ? raw.recommended_action
      : null,
    trend: typeof raw.trend === "string"
      ? (raw.trend as SemanticResult["trend"])
      : null,
    severity: typeof raw.severity === "string"
      ? (raw.severity as SemanticResult["severity"])
      : null,
    severity_score: asOptionalNumber(raw.severity_score),
    details: Object.keys(details).length > 0 ? details : null,
  };
}

function parseAnalysis(data: Record<string, unknown>): AnalysisResult {
  const result: AnalysisResult = {
    structural_score: asNumber(data.structural_score),
    change_detected: asBool(data.change_detected),
    change_score: asNumber(data.change_score),
    confidence_band: asString(data.confidence_band, "stable") as AnalysisResult["confidence_band"],
    engine_version: asString(data.engine_version, ""),
    analysis_id: asString(data.analysis_id, ""),
    metrics: isPlainObject(data.metrics) ? data.metrics : null,
    provenance: isPlainObject(data.provenance) ? data.provenance : null,
    semantic: parseSemantic(data.semantic),
    warning: typeof data.warning === "string" ? data.warning : null,
  };
  // Briefing 1 — new fields on server 1.5.12+. Absent keys fall through to
  // undefined, which the SDK exposes as `undefined` (not `null`) so TS
  // destructuring with default-assignment works as expected.
  if (typeof data.domain_applied === "string") {
    result.domain_applied = data.domain_applied;
  }
  if (isPlainObject(data.domain_inference)) {
    const inf = data.domain_inference;
    result.domain_inference = {
      inferred: asString(inf.inferred, "generic"),
      confidence: asNumber(inf.confidence, 0),
      fallback_used: asBool(inf.fallback_used, false),
      reasoning: asString(inf.reasoning, ""),
    };
  }
  return result;
}

function parseFingerprint(data: Record<string, unknown>): FingerprintResult {
  const metrics = isPlainObject(data.metrics) ? data.metrics : {};

  const simLocal = asOptionalNumber(metrics.sim_local);
  const simSpectral = asOptionalNumber(metrics.sim_spectral);
  const simFractal = asOptionalNumber(metrics.sim_fractal);
  const simTransition = asOptionalNumber(metrics.sim_transition);
  const simTrend = asOptionalNumber(metrics.sim_trend);

  const hasFlag = Object.prototype.hasOwnProperty.call(metrics, "fingerprint_available");
  let fingerprintAvailable: boolean;
  let fingerprintReason: string | null;
  if (hasFlag) {
    fingerprintAvailable = asBool(metrics.fingerprint_available);
    fingerprintReason = typeof metrics.fingerprint_reason === "string"
      ? metrics.fingerprint_reason
      : null;
  } else {
    // Backwards compat with older servers.
    fingerprintAvailable = [
      simLocal,
      simSpectral,
      simFractal,
      simTransition,
      simTrend,
    ].every((x) => x !== null);
    fingerprintReason = fingerprintAvailable ? null : "internal_error";
  }

  const result: FingerprintResult = {
    analysis_id: asString(data.analysis_id, ""),
    structural_score: asNumber(data.structural_score),
    confidence_band: asString(data.confidence_band, "stable") as FingerprintResult["confidence_band"],
    sim_local: simLocal,
    sim_spectral: simSpectral,
    sim_fractal: simFractal,
    sim_transition: simTransition,
    sim_trend: simTrend,
    fingerprint_available: fingerprintAvailable,
    fingerprint_reason: fingerprintReason,
    get isComplete() {
      return this.fingerprint_available;
    },
    get vector() {
      if (!this.fingerprint_available) return null;
      return [
        this.sim_local,
        this.sim_spectral,
        this.sim_fractal,
        this.sim_transition,
        this.sim_trend,
      ] as number[];
    },
  };
  return result;
}

function parseBatchItem(raw: unknown): BatchItemResult {
  const r = isPlainObject(raw) ? raw : {};
  return {
    index: asNumber(r.index, 0),
    structural_score: asOptionalNumber(r.structural_score),
    change_detected: typeof r.change_detected === "boolean" ? r.change_detected : null,
    change_score: asOptionalNumber(r.change_score),
    confidence_band: typeof r.confidence_band === "string"
      ? (r.confidence_band as BatchItemResult["confidence_band"])
      : null,
    engine_version: typeof r.engine_version === "string" ? r.engine_version : null,
    analysis_id: typeof r.analysis_id === "string" ? r.analysis_id : null,
    metrics: isPlainObject(r.metrics) ? r.metrics : null,
    semantic: parseSemantic(r.semantic),
    error: typeof r.error === "string" ? r.error : null,
  };
}

function parseBatch(data: Record<string, unknown>): BatchResult {
  const results = Array.isArray(data.results) ? data.results.map(parseBatchItem) : [];
  return {
    results,
    analyses_consumed: asNumber(data.analyses_consumed, results.length),
    total_signals: asNumber(data.total_signals, results.length),
  };
}

function parseChannel(name: string, raw: unknown): ChannelResult {
  const r = isPlainObject(raw) ? raw : {};
  return {
    name,
    structural_score: asOptionalNumber(r.structural_score),
    change_detected: typeof r.change_detected === "boolean" ? r.change_detected : null,
    change_score: asOptionalNumber(r.change_score),
    confidence_band: typeof r.confidence_band === "string"
      ? (r.confidence_band as ChannelResult["confidence_band"])
      : null,
    engine_version: typeof r.engine_version === "string" ? r.engine_version : null,
    error: typeof r.error === "string" ? r.error : null,
  };
}

function parseVector(data: Record<string, unknown>): VectorResult {
  const channelsRaw = isPlainObject(data.channels) ? data.channels : {};
  const channels: Record<string, ChannelResult> = {};
  for (const [name, raw] of Object.entries(channelsRaw)) {
    channels[name] = parseChannel(name, raw);
  }
  return {
    structural_score: asNumber(data.structural_score),
    change_score: asNumber(data.change_score),
    change_detected: asBool(data.change_detected),
    confidence_band: asString(data.confidence_band, "stable") as VectorResult["confidence_band"],
    analysis_id: asString(data.analysis_id, ""),
    engine_version: asString(data.engine_version, ""),
    channels,
    warning: typeof data.warning === "string" ? data.warning : null,
  };
}

function parseMatrix(data: Record<string, unknown>): MatrixResult {
  const matrix = Array.isArray(data.matrix)
    ? (data.matrix as unknown[][]).map((row) =>
        Array.isArray(row) ? row.map((v) => asNumber(v)) : [],
      )
    : [];
  return {
    matrix,
    labels: Array.isArray(data.labels)
      ? (data.labels as unknown[]).map((v) => asString(v))
      : [],
    n_signals: asNumber(data.n_signals, matrix.length),
    n_pairs: asNumber(data.n_pairs, 0),
    analyses_consumed: asNumber(data.analyses_consumed, 0),
  };
}

function parseHealth(data: Record<string, unknown>): HealthStatus {
  return {
    status: asString(data.status, ""),
    version: asString(data.version, ""),
    message: asString(data.message, ""),
    uptime_seconds: asOptionalNumber(data.uptime_seconds),
    services: isPlainObject(data.services)
      ? (data.services as Record<string, string>)
      : null,
  };
}

// ---------------------------------------------------------------------------
// Module-level helpers — no API key required.
// ---------------------------------------------------------------------------

/**
 * Fetch the public encoding guide. No API key needed — useful for
 * exploring the API surface before signing up.
 *
 *     import { guide } from "alphainfo";
 *     const g = await guide();
 *     console.log(Object.keys(g));
 *
 * Get a free key to actually analyze signals:
 * https://alphainfo.io/register
 */
export async function guide(
  opts: { baseUrl?: string; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<Record<string, unknown>> {
  const base = opts.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = buildUrl(base, "/v1/guide");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onParentAbort = () => ctrl.abort();
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    opts.signal.addEventListener("abort", onParentAbort);
  }
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) await handleErrorResponse(res);
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof AlphaInfoError) throw err;
    throw new NetworkError(`Network error fetching /v1/guide: ${(err as Error).message}`, err);
  } finally {
    clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener("abort", onParentAbort);
  }
}

/**
 * Fetch API health status. No API key needed.
 */
export async function health(
  opts: { baseUrl?: string; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<HealthStatus> {
  const base = opts.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const url = buildUrl(base, "/health");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    opts.signal.addEventListener("abort", () => ctrl.abort());
  }
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) await handleErrorResponse(res);
    return parseHealth((await res.json()) as Record<string, unknown>);
  } catch (err) {
    if (err instanceof AlphaInfoError) throw err;
    throw new NetworkError(`Network error fetching /health: ${(err as Error).message}`, err);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// AlphaInfo client
// ---------------------------------------------------------------------------

/**
 * Client for the alphainfo.io Structural Intelligence API.
 *
 * Usage:
 *     import { AlphaInfo } from "alphainfo";
 *     const client = new AlphaInfo({ apiKey: "ai_..." });
 *     const result = await client.analyze({ signal, sampling_rate: 250 });
 */
export class AlphaInfo {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultTimeoutMs: number;
  private readonly defaultSignal?: AbortSignal;
  private readonly abortCtrl = new AbortController();
  private rateLimit: RateLimitInfo | null = null;
  private closed = false;

  constructor(opts: AlphaInfoOptions) {
    if (!opts.apiKey) {
      throw new Error(
        "apiKey is required. Get one at https://alphainfo.io/register (format: 'ai_...')",
      );
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.defaultTimeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultSignal = opts.signal;
  }

  get rateLimitInfo(): RateLimitInfo | null {
    return this.rateLimit;
  }

  /**
   * Close the client. Cancels any in-flight requests that haven't resolved
   * yet and marks the instance as closed (further calls will throw).
   *
   * The JS SDK relies on the runtime's global fetch (Node 18+ undici or the
   * browser), so there's no persistent TCP pool held per-instance — but
   * calling close() gives you a deterministic hook to abort outstanding
   * analyses during shutdown, and it enables `await using` in TS 5.2+.
   *
   * Idempotent.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      this.abortCtrl.abort();
    } catch {
      /* defensive — never throw from close() */
    }
  }

  /** TS 5.2+ `await using client = new AlphaInfo(...)` hook. */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  private async request(opts: RequestOptions): Promise<Record<string, unknown>> {
    if (this.closed) {
      throw new NetworkError("client is closed — cannot issue new requests");
    }
    const url = buildUrl(this.baseUrl, opts.path);
    const timeoutMs = opts.timeoutMs ?? this.defaultTimeoutMs;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    const parentSignals: AbortSignal[] = [this.abortCtrl.signal];
    if (opts.signal) parentSignals.push(opts.signal);
    if (this.defaultSignal) parentSignals.push(this.defaultSignal);
    const onAbort = () => ctrl.abort();
    for (const s of parentSignals) {
      if (s.aborted) ctrl.abort();
      else s.addEventListener("abort", onAbort);
    }

    try {
      const res = await fetch(url, {
        method: opts.method,
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
          "User-Agent": `alphainfo-js/${SDK_VERSION}`,
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
      });
      this.rateLimit = extractRateLimit(res.headers);
      if (!res.ok) await handleErrorResponse(res);
      return (await res.json()) as Record<string, unknown>;
    } catch (err) {
      if (err instanceof AlphaInfoError) throw err;
      if ((err as { name?: string }).name === "AbortError") {
        throw new NetworkError(`Request timed out or aborted: ${opts.path}`, err);
      }
      throw new NetworkError(`Network error: ${(err as Error).message}`, err);
    } finally {
      clearTimeout(timer);
      for (const s of parentSignals) s.removeEventListener("abort", onAbort);
    }
  }

  // -- analyze --------------------------------------------------------------

  /**
   * Run a structural analysis on a single signal.
   *
   * `domain` is optional. Omit for the universal `"generic"` calibration,
   * pass `"auto"` to let the server infer the calibration from the signal
   * (then read `result.domain_applied` + `result.domain_inference`), or
   * name a specific domain (`"biomedical"`, `"finance"`, etc.). Aliases
   * like `"fintech"` / `"biomed"` resolve server-side; real typos receive
   * an HTTP 400 with a "Did you mean …?" suggestion.
   */
  async analyze(opts: {
    signal: number[];
    sampling_rate: number;
    domain?: string;
    baseline?: number[] | null;
    metadata?: Record<string, unknown> | null;
    include_semantic?: boolean;
    use_multiscale?: boolean;
  }): Promise<AnalysisResult> {
    const body: Record<string, unknown> = {
      signal: opts.signal,
      sampling_rate: opts.sampling_rate,
      domain: opts.domain ?? "generic",
    };
    if (opts.baseline !== undefined && opts.baseline !== null) body.baseline = opts.baseline;
    if (opts.metadata) body.metadata = opts.metadata;
    if (opts.include_semantic !== undefined) body.include_semantic = opts.include_semantic;
    if (opts.use_multiscale !== undefined) body.use_multiscale = opts.use_multiscale;

    const data = await this.request({
      method: "POST",
      path: "/v1/analyze/stream",
      body,
      timeoutMs: ANALYZE_TIMEOUT_MS,
    });
    return parseAnalysis(data);
  }

  /**
   * Syntactic sugar for `analyze({ ..., domain: "auto" })`.
   *
   * Read `result.domain_applied` for the calibration the server picked,
   * and `result.domain_inference` for the confidence + reasoning.
   */
  async analyzeAuto(opts: {
    signal: number[];
    sampling_rate: number;
    baseline?: number[] | null;
    metadata?: Record<string, unknown> | null;
    include_semantic?: boolean;
    use_multiscale?: boolean;
  }): Promise<AnalysisResult> {
    return this.analyze({ ...opts, domain: "auto" });
  }

  // -- fingerprint ----------------------------------------------------------

  /**
   * Extract the 5D structural fingerprint (fast path — skips semantic +
   * multiscale). Emits a console.warn when the signal is shorter than
   * `MIN_FINGERPRINT_SAMPLES` (or the with-baseline threshold) so callers
   * know the response will likely be incomplete before paying a round-trip.
   */
  async fingerprint(opts: {
    signal: number[];
    sampling_rate: number;
    domain?: string;
    baseline?: number[] | null;
  }): Promise<FingerprintResult> {
    this.warnIfTooShortForFingerprint(opts.signal, opts.baseline ?? null);

    const body: Record<string, unknown> = {
      signal: opts.signal,
      sampling_rate: opts.sampling_rate,
      domain: opts.domain ?? "generic",
      include_semantic: false,
      use_multiscale: false,
    };
    if (opts.baseline !== undefined && opts.baseline !== null) body.baseline = opts.baseline;

    const data = await this.request({
      method: "POST",
      path: "/v1/analyze/stream",
      body,
      timeoutMs: ANALYZE_TIMEOUT_MS,
    });
    return parseFingerprint(data);
  }

  private warnIfTooShortForFingerprint(
    signal: number[],
    baseline: number[] | null,
  ): void {
    const threshold = baseline !== null
      ? MIN_FINGERPRINT_SAMPLES_WITH_BASELINE
      : MIN_FINGERPRINT_SAMPLES;
    if (signal.length >= threshold) return;
    const qualifier = baseline !== null ? "with baseline" : "without baseline";
    const msg =
      `[alphainfo] Signal has ${signal.length} samples; the 5D fingerprint ` +
      `needs ≥${threshold} ${qualifier}. Response will likely come back ` +
      `with fingerprint_available=false (reason="signal_too_short"). ` +
      `Use client.analyze() for shorter signals.`;
    // eslint-disable-next-line no-console
    console.warn(msg);
  }

  // -- batch / matrix / vector ---------------------------------------------

  async analyzeBatch(opts: {
    signals: number[][];
    sampling_rate: number;
    domain?: string;
    baselines?: (number[] | null)[] | null;
    include_semantic?: boolean;
    use_multiscale?: boolean;
  }): Promise<BatchResult> {
    const body: Record<string, unknown> = {
      signals: opts.signals,
      sampling_rate: opts.sampling_rate,
      domain: opts.domain ?? "generic",
    };
    if (opts.baselines !== undefined && opts.baselines !== null) body.baselines = opts.baselines;
    if (opts.include_semantic !== undefined) body.include_semantic = opts.include_semantic;
    if (opts.use_multiscale !== undefined) body.use_multiscale = opts.use_multiscale;

    const data = await this.request({
      method: "POST",
      path: "/v1/analyze/batch",
      body,
      timeoutMs: ANALYZE_TIMEOUT_MS,
    });
    return parseBatch(data);
  }

  async analyzeMatrix(opts: {
    signals: number[][];
    sampling_rate: number;
    domain?: string;
    use_multiscale?: boolean;
  }): Promise<MatrixResult> {
    const body: Record<string, unknown> = {
      signals: opts.signals,
      sampling_rate: opts.sampling_rate,
      domain: opts.domain ?? "generic",
    };
    if (opts.use_multiscale !== undefined) body.use_multiscale = opts.use_multiscale;

    const data = await this.request({
      method: "POST",
      path: "/v1/analyze/matrix",
      body,
      timeoutMs: ANALYZE_TIMEOUT_MS,
    });
    return parseMatrix(data);
  }

  async analyzeVector(opts: {
    channels: Record<string, number[]>;
    sampling_rate: number;
    domain?: string;
    baselines?: Record<string, number[]> | null;
    include_semantic?: boolean;
    use_multiscale?: boolean;
  }): Promise<VectorResult> {
    const body: Record<string, unknown> = {
      channels: opts.channels,
      sampling_rate: opts.sampling_rate,
      domain: opts.domain ?? "generic",
    };
    if (opts.baselines !== undefined && opts.baselines !== null) body.baselines = opts.baselines;
    if (opts.include_semantic !== undefined) body.include_semantic = opts.include_semantic;
    if (opts.use_multiscale !== undefined) body.use_multiscale = opts.use_multiscale;

    const data = await this.request({
      method: "POST",
      path: "/v1/analyze/vector",
      body,
      timeoutMs: ANALYZE_TIMEOUT_MS,
    });
    return parseVector(data);
  }

  // -- audit ----------------------------------------------------------------

  async auditReplay(analysisId: string): Promise<AuditReplay> {
    if (!analysisId) throw new ValidationError("analysisId cannot be empty");
    const data = await this.request({
      method: "GET",
      path: `/v1/audit/replay/${encodeURIComponent(analysisId)}`,
    });
    return data as unknown as AuditReplay;
  }

  async auditList(limit = 100): Promise<AuditSummary[]> {
    const data = await this.request({
      method: "GET",
      path: `/v1/audit/list?limit=${encodeURIComponent(String(limit))}`,
    });
    const items = Array.isArray(data)
      ? data
      : Array.isArray((data as { analyses?: unknown[] }).analyses)
      ? (data as { analyses: unknown[] }).analyses
      : [];
    return items.map((a) => {
      const r = isPlainObject(a) ? a : {};
      return {
        analysis_id: asString(r.analysis_id ?? r.id),
        timestamp: asString(r.timestamp),
        signal_length: asNumber(r.signal_length, 0),
        domain: typeof r.domain === "string" ? r.domain : null,
        structural_score: asOptionalNumber(r.structural_score),
        change_detected: typeof r.change_detected === "boolean" ? r.change_detected : null,
      };
    });
  }

  // -- meta -----------------------------------------------------------------

  async health(): Promise<HealthStatus> {
    return health({ baseUrl: this.baseUrl });
  }

  async plans(): Promise<PlanInfo[]> {
    const data = await this.request({ method: "GET", path: "/api/plans" });
    return (Array.isArray(data) ? data : []).map((p) => p as PlanInfo);
  }

  async guide(): Promise<Record<string, unknown>> {
    return guide({ baseUrl: this.baseUrl });
  }

  async version(): Promise<Record<string, unknown>> {
    return this.request({ method: "GET", path: "/v1/version" });
  }
}
