# Changelog

All notable changes to the alphainfo JS/TS SDK.

## 1.5.14 — Version parity bump

No code changes in this SDK. Bumped only to keep the version number in
sync with the Python SDK (which shipped 1.5.14 to fix a stale
`__version__` string that the other SDKs never had). All functional
behaviour is identical to 1.5.13.

## 1.5.13 — Response contract refinement and documentation improvements

Server response shape has been neutralised — the following keys have
new names:
  • metrics.scale_entropy                            → metrics.complexity_index
  • metrics.multiscale.curvature                     → metrics.multiscale.scale_profile
  • metrics.multiscale.summary.scale_curvature_score → metrics.multiscale.summary.profile_score

The 5D fingerprint contract (sim_local/sim_spectral/sim_fractal/
sim_transition/sim_trend + fingerprint_available + fingerprint_reason)
is unchanged.

## [1.5.12] - 2026-04-20

Added automatic domain inference; `domain` parameter now optional with
sensible default.

- New `DomainInference` type exported from `alphainfo`.
- `AnalysisResult.domain_applied` — populated by server 1.5.12+.
- `AnalysisResult.domain_inference` — populated only when the caller
  passed `domain: "auto"`.
- New `client.analyzeAuto({ signal, sampling_rate })` — sugar for
  `analyze({ ..., domain: "auto" })`.
- Docstring updates on `analyze()` explaining `"auto"`, aliases, and
  the "Did you mean …?" suggestion path.

Backwards-compatible — existing callers unaffected; new fields are
`undefined` when the server omits them.

## [1.5.11] - 2026-04-20

### Connection cleanup improvements.

- `AlphaInfo` now exposes `close()` and `[Symbol.asyncDispose]()` so
  instances can be used with the TS 5.2+ `await using` statement.
- `close()` is idempotent, aborts any in-flight requests via a shared
  `AbortController`, and marks the instance as closed. Further calls
  will throw `NetworkError("client is closed …")`.
- No behavioral change for existing users — the SDK still relies on
  the runtime's global `fetch` (Node 18+ undici or the browser), so
  there is no persistent per-instance connection pool to tear down.

## [1.5.10] - 2026-04-20

### Initial release — parity with Python SDK 1.5.10.

- `AlphaInfo` client with `analyze`, `fingerprint`, `analyzeBatch`,
  `analyzeMatrix`, `analyzeVector`, `auditList`, `auditReplay`,
  `health`, `plans`, `guide`, `version`.
- Module-level `guide()` and `health()` helpers (no API key required).
- Public constants `MIN_FINGERPRINT_SAMPLES` (192) and
  `MIN_FINGERPRINT_SAMPLES_WITH_BASELINE` (50).
- Honest fingerprint contract: `sim_*` fields are `number | null`,
  `vector` is `number[] | null`, plus `fingerprint_available` and
  `fingerprint_reason`. Never fills missing dimensions with 0.
- Typed error hierarchy (`AuthError`, `RateLimitError`,
  `ValidationError`, `NotFoundError`, `APIError`, `NetworkError`),
  all inheriting from `AlphaInfoError`.
- Works on Node 18+ and every modern browser (native `fetch`, no
  extra HTTP client dependency).
- Per-request and per-client `AbortSignal` support.
- `console.warn` when a `fingerprint()` call is likely to come back
  incomplete (signal shorter than the threshold).
