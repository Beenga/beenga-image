// Re-measure the clean-shaven claim properly: layer on vs off, same seed, across
// the age and complexion range the README claim covers, plus both phrasings that
// real users type. Writes files named <case>-<on|off>-<seed>.png.
import fs from "node:fs";

const API = "https://api.replicate.com/v1";
const T = process.env.REPLICATE_API_TOKEN;
const OUT = process.env.OUTDIR;
const VERSION = process.env.VERSION;
const auth = () => ({ Authorization: `Bearer ${T}`, "Content-Type": "application/json" });

// Spans age (20s / 40s / middle-aged), complexion (unspecified / deep / very deep /
// fair) and both phrasings — "clean-shaven" as the benchmark writes it and
// "clean shave" as users type it.
const CASES = [
  ["hero",     "A clean-shaven young Indian man on a rooftop in Delhi, no moustache, no beard"],
  ["gym",      "modern indian man in 20s in gym, shorts and tshirt, clean shave"],
  ["deep40",   "a clean-shaven indian man in his 40s with a deep complexion, no beard, no moustache"],
  ["verydeep", "a clean-shaven young indian man with a very deep complexion, no moustache, no beard"],
  ["shopkeep", "a clean-shaven middle aged indian shopkeeper in his shop"],
  ["plain20s", "a clean-shaven indian man in his 20s, plain background, no beard, no moustache"],
];
const SEEDS = [11, 22];

async function gen(label, prompt, layer, seed) {
  const input = {
    prompt, seed, aspect_ratio: "1:1", output_format: "png",
    beenga_prompt_layer: layer,
  };
  let r, wait = 12_000;
  for (let i = 0; i < 10; i++) {
    r = await fetch(`${API}/predictions`, {
      method: "POST", headers: auth(), body: JSON.stringify({ version: VERSION, input }),
    });
    if (r.status !== 429) break;
    const ra = Number(r.headers.get("retry-after"));
    await new Promise((s) => setTimeout(s, Number.isFinite(ra) && ra > 0 ? ra * 1000 : wait));
    wait = Math.min(wait * 2, 60_000);
  }
  if (!r.ok) { console.log(`${label} ${layer ? "on" : "off"} s${seed}  HTTP ${r.status}`); return; }
  let j = await r.json();
  while (!["succeeded", "failed", "canceled"].includes(j.status)) {
    await new Promise((s) => setTimeout(s, 2500));
    j = await (await fetch(`${API}/predictions/${j.id}`, { headers: auth() })).json();
  }
  if (j.status !== "succeeded") { console.log(`${label} ${layer ? "on" : "off"} s${seed}  ${j.status}`); return; }
  const u = Array.isArray(j.output) ? j.output[0] : j.output;
  const f = `${OUT}/${label}-${layer ? "on" : "off"}-${seed}.png`;
  fs.writeFileSync(f, Buffer.from(await (await fetch(u)).arrayBuffer()));
  const rules = (j.logs ?? "").match(/beenga rules applied: (.*)/)?.[1] ?? "(none)";
  console.log(`${label.padEnd(9)} ${(layer ? "on" : "off").padEnd(3)} s${seed}  ok   ${rules.slice(0, 60)}`);
}

for (const [label, prompt] of CASES)
  for (const seed of SEEDS)
    for (const layer of [true, false])
      await gen(label, prompt, layer, seed);
