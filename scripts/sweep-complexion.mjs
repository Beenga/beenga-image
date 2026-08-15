// Complexion sweep — does the prompt layer's per-tone stacking actually land on
// the requested tone, across the full range?
//
//   node scripts/sweep-complexion.mjs --seeds 3
//
// Why this exists. A single restatement of a complexion left everything below
// wheatish rendering lighter than asked, and that was written up as a
// weights-level bias needing real photography. Stacking five descriptions of the
// same tone fixed it on 3 of 3 — but three samples on one seed is a signal, not
// a result, and the conclusion it overturned was expensive.
//
// Two failure modes are being tested, not one:
//
//   UNDERSHOOT  the old bug — deep tones render lighter than requested
//   OVERSHOOT   the new risk — a "make it darker" rule pushes every tone dark,
//               which is the same bias mirrored. The layer uses one stack PER
//               TONE for this reason, and wheatish/medium must still land mid.
//
// Control tones (very fair, fair, light-medium) get no stack because they never
// failed. They are included anyway: if the layer has leaked into them, that is a
// regression worth catching.
import fs from "node:fs";
import path from "node:path";
import { enhance } from "../lib/prompt.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const API = "https://api.replicate.com/v1";
const T = process.env.REPLICATE_API_TOKEN;
if (!T) { console.error("REPLICATE_API_TOKEN not set"); process.exit(1); }

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i === -1 ? d : argv[i + 1]; };
const SEEDS = Number(arg("--seeds", "3"));
const MODEL = arg("--model", "black-forest-labs/flux-2-klein-4b");

const TONES = [
  ["very_fair", "very fair skin", false],
  ["fair", "fair skin with cool undertones", false],
  ["light_medium", "light-medium skin with warm undertones", false],
  ["wheatish", "wheatish medium-brown skin", true],
  ["medium", "medium brown skin with olive undertones", true],
  ["deep", "deep brown skin with warm undertones", true],
  ["very_deep", "very deep dark brown skin", true],
];
const SUBJECTS = [
  ["m", "a 32-year-old Indian man", "short cropped black hair", "a plain cotton shirt"],
  ["f", "a 29-year-old Indian woman", "long straight black hair", "a plain cotton kurti"],
];

const auth = () => ({ Authorization: `Bearer ${T}`, "Content-Type": "application/json" });

async function generate(version, prompt, seed) {
  let r, attempt = 0;
  for (;;) {
    r = await fetch(`${API}/predictions`, {
      method: "POST", headers: auth(),
      body: JSON.stringify({ version, input: {
        prompt, seed, aspect_ratio: "1:1", output_format: "png", output_megapixels: "1",
      } }),
    });
    if (r.status !== 429 || attempt >= 6) break;
    const w = 5 * 2 ** attempt;
    process.stdout.write(` [throttled ${w}s]`);
    await new Promise((s) => setTimeout(s, w * 1000));
    attempt++;
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  let j = await r.json();
  while (!["succeeded", "failed", "canceled"].includes(j.status)) {
    await new Promise((s) => setTimeout(s, 900));
    j = await (await fetch(`${API}/predictions/${j.id}`, { headers: auth() })).json();
  }
  if (j.status !== "succeeded") throw new Error(String(j.status));
  return Array.isArray(j.output) ? j.output[0] : j.output;
}

const outDir = path.join(ROOT, "out", "complexion-sweep");
fs.mkdirSync(outDir, { recursive: true });
const version = (await (await fetch(`${API}/models/${MODEL}`, { headers: auth() })).json()).latest_version.id;

const rows = [];
for (const [tid, tone, stacked] of TONES) {
  for (const [sid, who, hair, wear] of SUBJECTS) {
    for (let s = 0; s < SEEDS; s++) {
      const raw = `waist-up portrait of ${who} with ${tone}, ${hair}, wearing ${wear}, ` +
                  `plain neutral background, realistic documentary photography, natural skin texture`;
      const e = enhance(raw);
      const seed = 5000 + s * 97;
      const tag = `${tid}-${sid}-s${s}`;
      process.stdout.write(`${tag.padEnd(22)}`);
      try {
        const url = await generate(version, e.prompt, seed);
        const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
        fs.writeFileSync(path.join(outDir, `${tag}.png`), buf);
        rows.push({ tag, tone: tid, subject: sid, seed, stacked, applied: e.applied });
        console.log(" ok");
      } catch (err) {
        rows.push({ tag, tone: tid, subject: sid, seed, stacked, error: String(err.message) });
        console.log(` FAIL ${err.message}`);
      }
    }
  }
}
fs.writeFileSync(path.join(outDir, "sweep.json"), JSON.stringify({ model: MODEL, seeds: SEEDS, rows }, null, 2));
const ok = rows.filter((r) => !r.error).length;
console.log(`\n${ok}/${rows.length} generated → ${outDir}`);
console.log(`est. cost ~$${(ok * 0.001).toFixed(3)}`);
console.log(`\nScoring is by eye: does each tone land on its target, and do the`);
console.log(`unstacked control tones still look right?`);
