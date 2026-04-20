/**
 * alphainfo — Hello World (TypeScript)
 *
 * Smallest runnable example: install, paste your key, run.
 *
 *     npm install alphainfo
 *     ALPHAINFO_API_KEY=ai_... npx tsx examples/quickstart.ts
 *
 * Get a free key at https://alphainfo.io/register (50 analyses/month).
 */
import { AlphaInfo } from "alphainfo";

const apiKey = process.env.ALPHAINFO_API_KEY;
if (!apiKey) {
  console.error("Set ALPHAINFO_API_KEY first: https://alphainfo.io/register");
  process.exit(1);
}

const client = new AlphaInfo({ apiKey });

// Toy signal: sine that abruptly changes amplitude at the midpoint.
const signal: number[] = [];
for (let i = 0; i < 200; i++) signal.push(Math.sin(i / 10));
for (let i = 0; i < 200; i++) signal.push(Math.sin(i / 10) * 3);

const result = await client.analyze({ signal, sampling_rate: 100 });

console.log(`structural_score: ${result.structural_score.toFixed(3)}`);
console.log(`confidence_band:  ${result.confidence_band}`);
console.log(`change_detected:  ${result.change_detected}`);
console.log(`analysis_id:      ${result.analysis_id}`);
