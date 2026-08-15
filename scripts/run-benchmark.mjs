// Wave 0 — run the Beenga India benchmark against a base model and save images.
// Raw prompts, no Beenga style suffix: this measures the BASE model's behaviour,
// which is the baseline every later wave is scored against.
//
//   node scripts/run-benchmark.mjs [--model <replicate/model>] [--only <ID,ID>] [--seed N]
import fs from "node:fs";
import path from "node:path";
import { enhance } from "../lib/prompt.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const API = "https://api.replicate.com/v1";
const T = process.env.REPLICATE_API_TOKEN;
if (!T) { console.error("REPLICATE_API_TOKEN not set"); process.exit(1); }

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i === -1 ? d : argv[i + 1]; };
const MODEL = arg("--model", "black-forest-labs/flux-2-klein-4b");
const SEED = Number(arg("--seed", "1234"));
const ONLY = arg("--only", "")?.split(",").filter(Boolean);
const TAG = arg("--tag", "baseline");
const ENHANCE = argv.includes("--enhance");

const suite = JSON.parse(fs.readFileSync(path.join(ROOT, "benchmarks/beenga-india-v1.json"), "utf8"));
const cases = ONLY?.length ? suite.cases.filter((c) => ONLY.includes(c.id)) : suite.cases;
const outDir = path.join(ROOT, "out", TAG);
fs.mkdirSync(outDir, { recursive: true });

const auth = () => ({ Authorization: `Bearer ${T}`, "Content-Type": "application/json" });

async function version(model) {
  const r = await fetch(`${API}/models/${model}`, { headers: auth() });
  if (!r.ok) throw new Error(`${model}: HTTP ${r.status}`);
  return (await r.json()).latest_version.id;
}

async function generate(v, prompt, seed) {
  const body = {
    version: v,
    input: { prompt, seed, aspect_ratio: "3:4", output_format: "png", output_megapixels: "1" },
  };
  let r = await fetch(`${API}/predictions`, { method: "POST", headers: auth(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${(await r.text()).slice(0, 200)}`);
  let j = await r.json();
  while (!["succeeded", "failed", "canceled"].includes(j.status)) {
    await new Promise((s) => setTimeout(s, 900));
    j = await (await fetch(`${API}/predictions/${j.id}`, { headers: auth() })).json();
  }
  if (j.status !== "succeeded") throw new Error(`${j.status}: ${j.error ?? "no detail"}`);
  return { url: Array.isArray(j.output) ? j.output[0] : j.output, predict: j.metrics?.predict_time ?? null };
}

const v = await version(MODEL);
console.log(`suite  ${suite.suite}\nmodel  ${MODEL}\ncases  ${cases.length}\nout    ${outDir}\n`);

const runs = [];
for (const c of cases) {
  process.stdout.write(`${c.id.padEnd(16)} ${c.concept.padEnd(30)} `);
  const e = ENHANCE ? enhance(c.prompt) : { prompt: c.prompt, applied: [] };
  try {
    const g = await generate(v, e.prompt, SEED);
    const buf = Buffer.from(await (await fetch(g.url)).arrayBuffer());
    const file = `${c.id}.png`;
    fs.writeFileSync(path.join(outDir, file), buf);
    runs.push({ ...c, file, sent_prompt: e.prompt, applied: e.applied, predict: g.predict, status: "generated", score: null, observed: null });
    console.log(`ok  ${g.predict?.toFixed(2)}s`);
  } catch (e) {
    runs.push({ ...c, file: null, status: "error", error: String(e.message).slice(0, 200) });
    console.log(`FAIL ${e.message.slice(0, 90)}`);
  }
}

fs.writeFileSync(path.join(outDir, "runs.json"), JSON.stringify({ suite: suite.suite, model: MODEL, seed: SEED, tag: TAG, runs }, null, 2));
const ok = runs.filter((r) => r.status === "generated").length;
console.log(`\n${ok}/${runs.length} generated → ${path.join(outDir, "runs.json")}`);
console.log(`est. cost ~$${(ok * 0.001).toFixed(3)} at ~1MP`);
