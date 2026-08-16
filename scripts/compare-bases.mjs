// Head-to-head on the real-world defect list, prompt layer OFF.
//
//   node scripts/compare-bases.mjs
//
// The point is to find out whether eleven prompt rules are compensating for the
// wrong base model. Every case here is a defect found by using the product; the
// original spec-derived suite caught none of them.
//
// Layer off on purpose: we are comparing raw priors. If one model already gets
// these right, that is worth far more than another rule.
//
// All three candidates are Apache-2.0 and commercially usable.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const API = "https://api.replicate.com/v1";
const T = process.env.REPLICATE_API_TOKEN;
if (!T) { console.error("REPLICATE_API_TOKEN not set"); process.exit(1); }

const MODELS = [
  { id: "klein", model: "black-forest-labs/flux-2-klein-4b",
    input: (p, s) => ({ prompt: p, seed: s, aspect_ratio: "1:1", output_format: "png", output_megapixels: "1" }) },
  { id: "zimage", model: "prunaai/z-image-turbo",
    input: (p, s) => ({ prompt: p, seed: s, width: 1024, height: 1024, output_format: "png" }) },
  { id: "qwen", model: "qwen/qwen-image",
    input: (p, s) => ({ prompt: p, seed: s, aspect_ratio: "1:1", output_format: "png" }) },
];

const suite = JSON.parse(fs.readFileSync(path.join(ROOT, "benchmarks/real-world-defects.json"), "utf8"));
const outDir = path.join(ROOT, "out", "compare");
fs.mkdirSync(outDir, { recursive: true });
const auth = () => ({ Authorization: `Bearer ${T}`, "Content-Type": "application/json" });
const SEED = 1234;

async function version(m) {
  const r = await fetch(`${API}/models/${m}`, { headers: auth() });
  if (!r.ok) throw new Error(`${m}: HTTP ${r.status}`);
  return (await r.json()).latest_version.id;
}

async function gen(v, input) {
  let r, attempt = 0;
  for (;;) {
    r = await fetch(`${API}/predictions`, { method: "POST", headers: auth(),
      body: JSON.stringify({ version: v, input }) });
    if (r.status !== 429 || attempt >= 6) break;
    const w = 5 * 2 ** attempt;
    process.stdout.write(` [throttled ${w}s]`);
    await new Promise((s) => setTimeout(s, w * 1000));
    attempt++;
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  let j = await r.json();
  while (!["succeeded", "failed", "canceled"].includes(j.status)) {
    await new Promise((s) => setTimeout(s, 1000));
    j = await (await fetch(`${API}/predictions/${j.id}`, { headers: auth() })).json();
  }
  if (j.status !== "succeeded") throw new Error(String(j.status));
  return Array.isArray(j.output) ? j.output[0] : j.output;
}

const rows = [];
for (const m of MODELS) {
  let v;
  try { v = await version(m.model); }
  catch (e) { console.log(`${m.id}: unavailable — ${e.message}`); continue; }
  for (const c of suite.cases) {
    const tag = `${c.id}-${m.id}`;
    process.stdout.write(tag.padEnd(24));
    try {
      const url = await gen(v, m.input(c.prompt, SEED));
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      fs.writeFileSync(path.join(outDir, `${tag}.png`), buf);
      rows.push({ case: c.id, model: m.id, ok: true });
      console.log("ok");
    } catch (e) {
      rows.push({ case: c.id, model: m.id, ok: false, error: e.message });
      console.log(`FAIL ${e.message.slice(0, 50)}`);
    }
  }
}
fs.writeFileSync(path.join(outDir, "runs.json"), JSON.stringify({ seed: SEED, rows }, null, 2));
const ok = rows.filter((r) => r.ok).length;
console.log(`\n${ok}/${rows.length} generated -> ${outDir}`);
