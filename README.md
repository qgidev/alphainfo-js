# alphainfo

[![npm version](https://img.shields.io/npm/v/alphainfo.svg)](https://www.npmjs.com/package/alphainfo)
[![Node 18+](https://img.shields.io/badge/node-18+-blue.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**TypeScript/JavaScript client for the [alphainfo.io](https://alphainfo.io) Structural Intelligence API.**

Detect structural regime changes in any time series — biomedical signals, financial markets, energy grids, seismic data, IoT sensors, network traffic. One API, no model training, no per-domain tuning. Every analysis ships with an audit trail.

## 30-second try

**Step 1 — [get a free API key](https://alphainfo.io/register)** (50 analyses/month, no credit card).

**Step 2** — install and analyze a signal:

```bash
npm install alphainfo
```

```typescript
import { AlphaInfo } from "alphainfo";

const client = new AlphaInfo({ apiKey: "ai_..." });

// Any time series — here, a toy sine with a regime change
const signal: number[] = [];
for (let i = 0; i < 200; i++) signal.push(Math.sin(i / 10));
for (let i = 0; i < 200; i++) signal.push(Math.sin(i / 10) * 3);

const result = await client.analyze({ signal, sampling_rate: 100 });
console.log(result.confidence_band);   // 'stable' | 'transition' | 'unstable'
console.log(result.structural_score);  // 0 (changed) → 1 (preserved)
console.log(result.analysis_id);       // UUID for audit replay
```

That's it. 🚀

## Works in Node and the browser

- **Node 18+**: native `fetch` — no extra dependency.
- **Browsers**: same code runs in any modern browser. Bundlers (Vite, webpack, esbuild) tree-shake down to what you use.

## Structural fingerprint (fast path)

```typescript
const fp = await client.fingerprint({ signal, sampling_rate: 250 });

if (fp.isComplete) {
  console.log(fp.vector);   // 5D list of floats for ANN indexing (pgvector, Qdrant, Faiss)
} else {
  console.log(`unavailable: ${fp.fingerprint_reason}`);
}
```

**Minimum signal length for a complete fingerprint:**

| Case | Minimum samples | Constant |
|---|---|---|
| No baseline | 192 | `MIN_FINGERPRINT_SAMPLES` |
| With baseline | 50 | `MIN_FINGERPRINT_SAMPLES_WITH_BASELINE` |

Below the threshold, `fingerprint_available` is `false` and `.vector` is `null`. The SDK logs a `console.warn` at call time so your ANN pipeline can fall back to `client.analyze()` for shorter signals.

See [`examples/fingerprint_handling.ts`](examples/fingerprint_handling.ts) for the full pattern with semantic-layer fallback.

## Batch and matrix

```typescript
// Up to 100 signals in one call.
const batch = await client.analyzeBatch({
  signals: [sig1, sig2, sig3],
  sampling_rate: 1000,
  domain: "sensors",
});

// Pairwise similarity matrix.
const m = await client.analyzeMatrix({
  signals: [sig1, sig2, sig3],
  sampling_rate: 1,
});
console.log(m.matrix);
```

## Multi-channel (vector)

```typescript
const v = await client.analyzeVector({
  channels: { lead_I: ecg1, lead_II: ecg2, lead_III: ecg3 },
  sampling_rate: 360,
  domain: "biomedical",
});
console.log(v.structural_score, v.confidence_band);
```

## Audit trail

```typescript
const replay = await client.auditReplay(result.analysis_id);
const history = await client.auditList(10);
```

## Error handling

```typescript
import {
  AlphaInfo,
  AuthError,
  RateLimitError,
  ValidationError,
  NotFoundError,
} from "alphainfo";

try {
  await client.analyze({ signal, sampling_rate: 250 });
} catch (err) {
  if (err instanceof AuthError) {
    // Invalid API key. Get one at https://alphainfo.io/register
  } else if (err instanceof RateLimitError) {
    console.error(`retry after ${err.retryAfter}s`);
  } else if (err instanceof ValidationError) {
    console.error("bad input", err.message);
  }
}
```

| Error | HTTP | When |
|---|---|---|
| `AuthError` | 401 | Invalid or missing API key |
| `ValidationError` | 400, 413, 422 | Bad input or signal too large |
| `RateLimitError` | 429 | Quota or concurrency limit |
| `NotFoundError` | 404 | Analysis id not found (audit) |
| `APIError` | 5xx | Server error |
| `NetworkError` | — | DNS / TCP / TLS / timeout |

All inherit from `AlphaInfoError`.

## Zero-auth exploration

You can poke at the API shape without a key:

```typescript
import { guide, health } from "alphainfo";

console.log(await health());
const g = await guide();
console.log(g.signal_requirements);
```

## Configuration

```typescript
const client = new AlphaInfo({
  apiKey: "ai_...",
  baseUrl: "https://www.alphainfo.io",   // override for staging/self-host
  timeoutMs: 30_000,                       // default
  signal: controller.signal,               // AbortSignal for external cancellation
});
```

## Links

- Web: https://alphainfo.io
- Dashboard: https://alphainfo.io/dashboard
- Encoding guide: https://www.alphainfo.io/v1/guide (no auth)
- Python SDK: https://pypi.org/project/alphainfo/
- Status: coming soon at status.alphainfo.io

## About

Built by **QGI Quantum Systems LTDA** — São Paulo, Brazil.
Contact: contato@alphainfo.io · api@alphainfo.io

## License

MIT
