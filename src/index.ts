/**
 * alphainfo — TypeScript/JavaScript client for the alphainfo.io
 * Structural Intelligence API.
 *
 * Quick start:
 *
 *     import { AlphaInfo } from "alphainfo";
 *     const client = new AlphaInfo({ apiKey: "ai_..." });
 *     const result = await client.analyze({ signal, sampling_rate: 250 });
 *
 * Get a free key: https://alphainfo.io/register
 */

export { AlphaInfo, guide, health } from "./client.js";
export type { AlphaInfoOptions } from "./client.js";

export {
  MIN_FINGERPRINT_SAMPLES,
  MIN_FINGERPRINT_SAMPLES_WITH_BASELINE,
} from "./types.js";

export type {
  AlertLevel,
  AnalysisResult,
  AnalyzeOptions,
  AuditReplay,
  AuditSummary,
  BatchItemResult,
  BatchResult,
  ChannelResult,
  ConfidenceBand,
  DomainInference,
  FingerprintResult,
  HealthStatus,
  MatrixResult,
  PlanInfo,
  RateLimitInfo,
  SemanticResult,
  Severity,
  Trend,
  VectorResult,
} from "./types.js";

export {
  APIError,
  AlphaInfoError,
  AuthError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "./errors.js";
