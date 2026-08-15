// Generate LoRA training candidates for a bucket.
//
//   node scripts/gen-dataset.mjs --bucket facial_hair --count 200
//   node scripts/gen-dataset.mjs --bucket curl_type --count 8 --dry
//
// Writes to dataset/<bucket>/candidates/NNNN.png with a sidecar NNNN.json
// holding the caption. Nothing here is training-ready yet — candidates must be
// curated first (see below), then run finalize-dataset.mjs.
//
// ── Curation is manual, and that is the point ────────────────────────────────
//
// Generation is cheap; a wrong caption is not. If an image labelled
// "clean-shaven, no moustache" actually has stubble, the LoRA learns that
// stubble IS clean-shaven, and the defect gets worse rather than better. So:
//
//   1. run this script
//   2. open dataset/<bucket>/candidates/ in Finder, icon view, large previews
//   3. DELETE every image that does not match its caption — be harsh
//   4. run finalize-dataset.mjs, which pairs the survivors with their captions
//
// Expect to throw away a third or more. That is a healthy hit rate, not a
// failure — over-generating and culling hard is cheaper than training twice.
import fs from "node:fs";
import path from "node:path";
import { BUCKETS } from "../datasets/recipes.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const API = "https://api.replicate.com/v1";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i === -1 ? d : argv[i + 1]; };
const BUCKET = arg("--bucket");
const COUNT = Number(arg("--count", "0"));
// Bucket recipes may pin their own generator — facial_hair uses Z-Image because
// Klein will not reliably render a clean-shaven Indian man. --model overrides.
const MODEL_FLAG = arg("--model");
const DRY = argv.includes("--dry");

const spec = BUCKETS[BUCKET];
if (!spec) {
  console.error(`--bucket must be one of: ${Object.keys(BUCKETS).join(", ")}`);
  process.exit(1);
}
const n = COUNT || spec.target;
const MODEL = MODEL_FLAG || spec.model || "black-forest-labs/flux-2-klein-4b";
// Z-Image ignores aspect_ratio and needs explicit pixel dimensions; Klein takes
// output_megapixels and rejects width/height. One shape per family.
const isZ = MODEL.includes("z-image");
const SIZE = isZ ? { width: 1024, height: 1024 } : { aspect_ratio: "1:1", output_megapixels: "1" };
const PER_IMAGE = isZ ? 0.005 : 0.001;

if (DRY) {
  console.log(`bucket   ${spec.id}\nmodel    ${MODEL}\ndefect   ${spec.defect}\ncount    ${n}\n`);
  for (let i = 0; i < Math.min(n, 6); i++) {
    console.log(`── ${String(i).padStart(4, "0")}`);
    console.log(`gen      ${spec.genPrompt(i)}`);
    console.log(`caption  ${spec.caption(i)}\n`);
  }
  console.log(`est. cost $${(n * PER_IMAGE).toFixed(3)}`);
  process.exit(0);
}

const T = process.env.REPLICATE_API_TOKEN;
if (!T) { console.error("REPLICATE_API_TOKEN not set"); process.exit(1); }
const auth = () => ({ Authorization: `Bearer ${T}`, "Content-Type": "application/json" });

const dir = path.join(ROOT, "dataset", spec.id, "candidates");
fs.mkdirSync(dir, { recursive: true });

const vr = await fetch(`${API}/models/${MODEL}`, { headers: auth() });
if (!vr.ok) { console.error(`${MODEL}: HTTP ${vr.status}`); process.exit(1); }
const version = (await vr.json()).latest_version.id;

async function one(prompt, seed) {
  // Sequential requests are NOT enough on their own. The first 200-image run
  // sailed through 120 images and then took 79 consecutive 429s — Replicate
  // rate-limits prediction *creation*, and once tripped it stays tripped for a
  // while. So back off and retry rather than burning the rest of the run.
  let r, attempt = 0;
  for (;;) {
    r = await fetch(`${API}/predictions`, {
      method: "POST", headers: auth(),
      body: JSON.stringify({ version, input: {
        prompt, seed, output_format: "png", ...SIZE,
      } }),
    });
    if (r.status !== 429 || attempt >= 6) break;
    // Honour Retry-After when offered; otherwise 5s, 10s, 20s, 40s, 80s, 160s.
    const hinted = Number(r.headers.get("retry-after"));
    const wait = (Number.isFinite(hinted) && hinted > 0 ? hinted : 5 * 2 ** attempt) * 1000;
    process.stdout.write(`\n  throttled, waiting ${Math.round(wait / 1000)}s  `);
    await new Promise((s) => setTimeout(s, wait));
    attempt++;
  }
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${(await r.text()).slice(0, 160)}`);
  let j = await r.json();
  while (!["succeeded", "failed", "canceled"].includes(j.status)) {
    await new Promise((s) => setTimeout(s, 900));
    j = await (await fetch(`${API}/predictions/${j.id}`, { headers: auth() })).json();
  }
  if (j.status !== "succeeded") throw new Error(`${j.status}: ${j.error ?? "no detail"}`);
  return Array.isArray(j.output) ? j.output[0] : j.output;
}

console.log(`${spec.id}: generating ${n} candidates → ${dir}\n`);
let ok = 0, failed = 0;

// Sequential on purpose. Replicate rate-limits bursts, and a dataset run is not
// latency-sensitive — it is cheaper to be slow than to retry a throttled batch.
for (let i = 0; i < n; i++) {
  const stamp = String(i).padStart(4, "0");
  // Seed varies per image so the axes actually produce different people. A fixed
  // seed with varying prompts still collapses toward one face.
  const seed = 10_000 + i * 7;
  try {
    const url = await one(spec.genPrompt(i), seed);
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    fs.writeFileSync(path.join(dir, `${stamp}.png`), buf);
    fs.writeFileSync(path.join(dir, `${stamp}.json`), JSON.stringify({
      index: i, seed, bucket: spec.id, model: MODEL,
      gen_prompt: spec.genPrompt(i), caption: spec.caption(i),
    }, null, 2));
    ok++;
  } catch (e) {
    failed++;
    console.log(`  ${stamp} FAIL ${e.message.slice(0, 90)}`);
  }
  if ((i + 1) % 10 === 0 || i === n - 1) {
    process.stdout.write(`\r  ${ok} ok, ${failed} failed, ${n - i - 1} left   `);
  }
}

console.log(`\n\n${ok} candidates in ${dir}`);
console.log(`spent ~$${(ok * PER_IMAGE).toFixed(3)}`);
console.log(`\nNext: cull the bad ones in Finder, then:\n  node scripts/finalize-dataset.mjs --bucket ${spec.id}`);
