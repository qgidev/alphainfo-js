/**
 * alphainfo — Public types and constants
 */

/**
 * Minimum signal length required for a full 5-dimensional fingerprint
 * when no baseline is provided. Below this the server returns
 * `fingerprint_available: false` with `fingerprint_reason: "signal_too_short"`.
 */
export const MIN_FINGERPRINT_SAMPLES = 192 as const;

/**
 * With an explicit baseline of comparable length, the engine can
 * decompose shorter signals because the baseline provides the
 * reference window.
 */
export const MIN_FINGERPRINT_SAMPLES_WITH_BASELINE = 50 as const;

// ---------------------------------------------------------------------------
// Semantic interpretation
// ---------------------------------------------------------------------------

export type AlertLevel = "normal" | "attention" | "alert" | "critical";
export type Severity = "none" | "low" | "moderate" | "high" | "critical";
export type Trend = "stable" | "transition" | "diverging" | "monitoring";
export type ConfidenceBand = "stable" | "transition" | "unstable";

export interface SemanticResult {
  summary: string;
  alert_level: AlertLevel;
  recommended_action?: string | null;
  trend?: Trend | null;
  severity?: Severity | null;
  severity_score?: number | null;
  details?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Analysis results
// ---------------------------------------------------------------------------

export interface AnalysisResult {
  structural_score: number;
  change_detected: boolean;
  change_score: number;
  confidence_band: ConfidenceBand;
  engine_version: string;
  analysis_id: string;
  metrics?: Record<string, unknown> | null;
  provenance?: Record<string, unknown> | null;
  semantic?: SemanticResult | null;
  warning?: string | null;
}

/**
 * Structural fingerprint of a signal — 5-dimensional similarity vector.
 *
 * Each `sim_*` is a float in `[0, 1]` when the engine could decompose the
 * signal, or `null` when it could not. Always check `fingerprint_available`
 * (or the convenience getter `isComplete`) before using `.vector`.
 */
export interface FingerprintResult {
  analysis_id: string;
  structural_score: number;
  confidence_band: ConfidenceBand;
  sim_local: number | null;
  sim_spectral: number | null;
  sim_fractal: number | null;
  sim_transition: number | null;
  sim_trend: number | null;
  fingerprint_available: boolean;
  /**
   * Short machine-readable reason when `fingerprint_available` is false.
   * Known values: `"signal_too_short"`, `"structural_degenerate"`,
   * `"internal_error"`. Null when the fingerprint is available.
   */
  fingerprint_reason: string | null;
  /**
   * Convenience alias for `fingerprint_available`.
   */
  readonly isComplete: boolean;
  /**
   * The 5D vector ready for ANN indexing (pgvector, Qdrant, Faiss, etc.),
   * or `null` when the fingerprint is not available. Callers that embed
   * vectors must skip on `null` rather than substituting zeros.
   */
  readonly vector: number[] | null;
}

// ---------------------------------------------------------------------------
// Batch / matrix / vector results
// ---------------------------------------------------------------------------

export interface BatchItemResult {
  index: number;
  structural_score?: number | null;
  change_detected?: boolean | null;
  change_score?: number | null;
  confidence_band?: ConfidenceBand | null;
  engine_version?: string | null;
  analysis_id?: string | null;
  metrics?: Record<string, unknown> | null;
  semantic?: SemanticResult | null;
  error?: string | null;
}

export interface BatchResult {
  results: BatchItemResult[];
  analyses_consumed: number;
  total_signals: number;
}

export interface ChannelResult {
  name: string;
  structural_score?: number | null;
  change_detected?: boolean | null;
  change_score?: number | null;
  confidence_band?: ConfidenceBand | null;
  engine_version?: string | null;
  error?: string | null;
}

export interface VectorResult {
  structural_score: number;
  change_score: number;
  change_detected: boolean;
  confidence_band: ConfidenceBand;
  analysis_id: string;
  engine_version: string;
  channels: Record<string, ChannelResult>;
  warning?: string | null;
}

export interface MatrixResult {
  matrix: number[][];
  labels: string[];
  n_signals: number;
  n_pairs: number;
  analyses_consumed: number;
}

// ---------------------------------------------------------------------------
// Infra
// ---------------------------------------------------------------------------

export interface HealthStatus {
  status: string;
  version: string;
  message: string;
  uptime_seconds?: number | null;
  services?: Record<string, string> | null;
}

export interface PlanInfo {
  id?: number | string;
  slug: string;
  name: string;
  price_cents?: number;
  monthly_limit?: number;
  features?: Record<string, unknown>;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

export interface AuditSummary {
  analysis_id: string;
  timestamp: string;
  signal_length?: number;
  domain?: string | null;
  structural_score?: number | null;
  change_detected?: boolean | null;
}

export interface AuditReplay {
  analysis_id: string;
  timestamp: string;
  signal_length: number;
  sampling_rate: number;
  domain?: string | null;
  input_hash?: string | null;
  parameters?: Record<string, unknown> | null;
  output: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Request-shaped types (for callers that prefer building an options object)
// ---------------------------------------------------------------------------

export interface AnalyzeOptions {
  signal: number[];
  sampling_rate: number;
  domain?: string;
  baseline?: number[] | null;
  metadata?: Record<string, unknown> | null;
  include_semantic?: boolean;
  use_multiscale?: boolean;
}
