// Turn curated candidates into an ai-toolkit training folder.
//
//   node scripts/finalize-dataset.mjs --bucket facial_hair
//
// ai-toolkit reads a flat directory of images where each image has a matching
// .txt file holding its caption. That is the entire format — no manifest, no
// index. This script walks the surviving candidates, copies them into
// dataset/<bucket>/train/ and writes the caption files.
//
// Survivors only: a candidate is included if its .png still exists. Deleting an
// image in Finder is therefore the whole curation UI, and the orphaned .json is
// ignored rather than erroring.
import fs from "node:fs";
import path from "node:path";
import { BUCKETS } from "../datasets/recipes.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i === -1 ? d : argv[i + 1]; };
const BUCKET = arg("--bucket");

const spec = BUCKETS[BUCKET];
if (!spec) {
  console.error(`--bucket must be one of: ${Object.keys(BUCKETS).join(", ")}`);
  process.exit(1);
}

const candDir = path.join(ROOT, "dataset", spec.id, "candidates");
const trainDir = path.join(ROOT, "dataset", spec.id, "train");
if (!fs.existsSync(candDir)) {
  console.error(`no candidates at ${candDir} — run gen-dataset.mjs first`);
  process.exit(1);
}

fs.rmSync(trainDir, { recursive: true, force: true });
fs.mkdirSync(trainDir, { recursive: true });

const sidecars = fs.readdirSync(candDir).filter((f) => f.endsWith(".json")).sort();
let kept = 0, culled = 0;

for (const s of sidecars) {
  const stem = s.replace(/\.json$/, "");
  const png = path.join(candDir, `${stem}.png`);
  if (!fs.existsSync(png)) { culled++; continue; }

  const meta = JSON.parse(fs.readFileSync(path.join(candDir, s), "utf8"));
  fs.copyFileSync(png, path.join(trainDir, `${stem}.png`));
  fs.writeFileSync(path.join(trainDir, `${stem}.txt`), meta.caption.trim() + "\n");
  kept++;
}

const total = kept + culled;
const rate = total ? Math.round((kept / total) * 100) : 0;

console.log(`bucket   ${spec.id}`);
console.log(`kept     ${kept}`);
console.log(`culled   ${culled}  (${100 - rate}% rejected)`);
console.log(`train    ${trainDir}`);

// A dataset that kept almost everything usually means the curation pass was too
// gentle, not that generation was flawless. Mislabelled images actively teach
// the defect we are trying to remove, so it is worth a second look.
if (total && rate > 90) {
  console.log(`\n⚠ ${rate}% kept. Worth re-checking — a mislabelled image teaches the defect.`);
}
if (kept < 50) {
  console.log(`\n⚠ ${kept} images is thin for a LoRA. 100-200 is a more reliable range.`);
}
