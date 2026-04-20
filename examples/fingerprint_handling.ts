/**
 * alphainfo — Handling fingerprint availability (TypeScript).
 *
 * Idiom: check `isComplete` (or `fingerprint_available`) BEFORE using
 * `.vector` for similarity search / ANN indexing. The SDK never
 * substitutes zeros for missing dimensions — `.vector` is `null` when
 * the engine could not decompose the signal.
 *
 *     ALPHAINFO_API_KEY=ai_... npx tsx examples/fingerprint_handling.ts
 */
import { AlphaInfo } from "alphainfo";

const apiKey = process.env.ALPHAINFO_API_KEY;
if (!apiKey) {
  console.error("Set ALPHAINFO_API_KEY first: https://alphainfo.io/register");
  process.exit(1);
}
const client = new AlphaInfo({ apiKey });

async function runFingerprint(label: string, signal: number[], samplingRate = 1) {
  console.log(`\n--- ${label} (n=${signal.length}) ---`);
  const fp = await client.fingerprint({ signal, sampling_rate: samplingRate });
  console.log(
    `  structural_score=${fp.structural_score.toFixed(3)} band=${fp.confidence_band}`,
  );

  if (fp.isComplete) {
    console.log(`  ✓ fingerprint available  vector=${JSON.stringify(fp.vector)}`);
    // Feed into pgvector / Qdrant / Faiss here.
  } else {
    console.log(`  ✗ fingerprint unavailable  reason=${fp.fingerprint_reason}`);
    // Fallback: full analyze for the semantic layer.
    const result = await client.analyze({
      signal,
      sampling_rate: samplingRate,
      include_semantic: true,
    });
    if (result.semantic) {
      console.log(
        `    semantic fallback → trend=${result.semantic.trend}, severity=${result.semantic.severity}`,
      );
    }
  }
}

// Healthy: full fingerprint.
const longSine = Array.from({ length: 200 }, (_, i) => Math.sin(i / 10))
  .concat(Array.from({ length: 200 }, (_, i) => Math.sin(i / 10) * 3));
await runFingerprint("regime change, 400 pts", longSine, 100);

// Too short: fingerprint_reason="signal_too_short" + UserWarning.
await runFingerprint("short signal, 30 pts",
  Array.from({ length: 30 }, (_, i) => Math.sin(i / 5)));

// Degenerate: fingerprint_reason="structural_degenerate".
await runFingerprint("constant signal, 100 pts", Array(100).fill(1));
