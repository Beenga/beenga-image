// Text-level regression check for the prompt layer. No GPU, no Replicate, no cost.
//
// The image suites (beenga-india-v1, real-world-defects) can only catch what shows
// up in a render, and every case in both of them contains a person — so a layer
// that assumes there is ALWAYS a person passes all 41. This runs
// benchmarks/layer-contradictions.json against the enhanced TEXT instead, and also
// re-runs the JS/Python parity check, because a rule can only be right in one
// implementation at a time if nothing compares them.
//
//   node scripts/check-layer.mjs
//
// Exit code is 0 only when every case passes in BOTH implementations and parity
// holds across all three suites.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { enhance } from "../lib/prompt.mjs";

const SUITES = [
  "benchmarks/beenga-india-v1.json",
  "benchmarks/real-world-defects.json",
  "benchmarks/layer-contradictions.json",
];
const read = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"));

// ---- 1. contradiction cases, in JS -----------------------------------------
const cases = read("benchmarks/layer-contradictions.json").cases;
let failed = 0;

for (const c of cases) {
  const { prompt, applied } = enhance(c.prompt);
  const problems = [];
  for (const rule of c.must_not_apply ?? []) if (applied.includes(rule)) problems.push(`applied ${rule}`);
  for (const rule of c.must_apply ?? []) if (!applied.includes(rule)) problems.push(`did not apply ${rule}`);
  for (const s of c.must_not_contain ?? []) if (prompt.includes(s)) problems.push(`emitted "${s}"`);
  for (const s of c.must_contain ?? []) if (!prompt.includes(s)) problems.push(`omitted "${s}"`);
  if (problems.length) {
    failed++;
    console.log(`FAIL ${c.id}: ${problems.join("; ")}`);
    console.log(`     ${c.defect}`);
    console.log(`     rules: ${JSON.stringify(applied)}`);
  }
}
console.log(`contradictions: ${cases.length - failed}/${cases.length} pass`);

// ---- 2. parity, JS against the Python port ---------------------------------
// The Python file is hand-maintained; four silent drifts have got past code review.
// fal/beenga_prompt.py is a SYMLINK to cog/beenga_prompt.py, so it cannot drift on
// its own — the last check below exists to notice the day someone replaces that
// symlink with a copy, which is how a third hand-maintained implementation starts.
const jsOut = (suite) => read(suite).cases.map((c) => enhance(c.prompt).prompt.trim());
const pyOut = (suite) => JSON.parse(execFileSync("python3", ["-c", `
import sys, json
sys.path.insert(0, "cog")
from beenga_prompt import enhance
cases = json.load(open("${suite}"))["cases"]
print(json.dumps([enhance(c["prompt"])[0].strip() for c in cases]))
`], { encoding: "utf8" }));

let drift = 0;
for (const suite of SUITES) {
  const [a, b] = [jsOut(suite), pyOut(suite)];
  const bad = read(suite).cases.filter((c, i) => a[i] !== b[i]).map((c) => c.id);
  drift += bad.length;
  console.log(`parity ${suite.replace("benchmarks/", "")}: ${a.length - bad.length}/${a.length}${bad.length ? ` — ${bad.join(", ")}` : ""}`);
}

const copies = ["cog/beenga_prompt.py", "fal/beenga_prompt.py"].map((f) =>
  readFileSync(new URL(`../${f}`, import.meta.url), "utf8"));
const copyDrift = copies[0] !== copies[1];
console.log(`fal copy: ${copyDrift ? "DRIFTED from cog/beenga_prompt.py" : "identical to cog/beenga_prompt.py"}`);

process.exit(failed || drift || copyDrift ? 1 : 0);
