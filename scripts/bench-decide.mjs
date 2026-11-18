// Measure real decision latency of the deterministic engine (dry runs, in-memory DB).
import { ensureDemoWorkspace } from '../app/lib/seed.js';
import { decide, normalizeInput } from '../app/lib/engine.js';
import { SCENARIOS, CLEAN_SET } from '../app/lib/tests.js';

await ensureDemoWorkspace();
const actions = [...SCENARIOS.flatMap((s) => s.actions), ...CLEAN_SET];
const times = [];
for (let round = 0; round < 3; round++) {
  for (const a of actions) {
    const n = normalizeInput(a);
    const t0 = performance.now();
    await decide('lumen-studio', n.value, { dryRun: true });
    times.push(performance.now() - t0);
  }
}
times.sort((x, y) => x - y);
const p = (q) => times[Math.floor(q * (times.length - 1))].toFixed(1);
console.log(JSON.stringify({ decisions: times.length, p50_ms: p(0.5), p95_ms: p(0.95), max_ms: times[times.length - 1].toFixed(1) }));