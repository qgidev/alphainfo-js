# Changelog

All notable changes to the alphainfo JS/TS SDK.

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
