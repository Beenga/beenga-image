// Harvest real, freely-licensed photographs of Indian people from Wikimedia
// Commons, for the complexion bucket.
//
//   node scripts/harvest-commons.mjs --limit 400 --licence permissive
//   node scripts/harvest-commons.mjs --dry
//
// This bucket is the one that CANNOT use synthetic data. Klein lightens any
// complexion below wheatish (measured: 3 of 3 samples), so generating training
// images from Klein — or from any model with the same bias — would teach the
// defect back. Real photographs are the only signal that works.
//
// ── Licence policy ───────────────────────────────────────────────────────────
//
// Commons is not one licence. A probe of Category:People of India came back
// mostly CC BY-SA 4.0 with some CC0. They are not equivalent for our purpose:
//
//   pd / cc0        No conditions. Safe.
//   cc-by           Attribution only. Safe, and we record the credit.
//   cc-by-sa        Share-alike. It is genuinely unsettled whether a model
//                   trained on SA images is a derivative work that must itself
//                   be SA. We plan to release under Apache-2.0, which is
//                   incompatible with that reading. Excluded by default.
//
// --licence strict     pd, cc0
// --licence permissive pd, cc0, cc-by            ← default
// --licence loose      adds cc-by-sa             ← only with legal advice
//
// ── What this does NOT solve ─────────────────────────────────────────────────
//
// Commons photographs vary wildly in lighting, resolution, framing and colour
// grading. A commissioned shoot would give a controlled set. If the complexion
// LoRA underperforms, suspect the data before the method.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const API = "https://commons.wikimedia.org/w/api.php";
const UA = "BeengaImage-dataset/0.1 (https://github.com/beenga/beenga-image; contact via GitHub)";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i === -1 ? d : argv[i + 1]; };
const LIMIT = Number(arg("--limit", "400"));
const POLICY = arg("--licence", "permissive");
const MIN_PX = Number(arg("--min-px", "600"));
const DRY = argv.includes("--dry");

const ALLOWED = {
  strict: [/^cc0/i, /public domain/i, /^pd/i],
  permissive: [/^cc0/i, /public domain/i, /^pd/i, /^cc by (?!.*sa)/i],
  loose: [/^cc0/i, /public domain/i, /^pd/i, /^cc by/i],
}[POLICY];
if (!ALLOWED) { console.error("--licence must be strict | permissive | loose"); process.exit(1); }

// Portrait-leaning categories. "People of India" alone returns mostly festival
// and market scenes — crowds are useless here, we need faces large in frame.
const CATEGORIES = [
  "Portrait photographs of India",
  "Portrait photographs of men of India",
  "Portrait photographs of women of India",
  "Faces of India",
  "Men of India",
  "Women of India",
  "Farmers of India",
  "Workers of India",
  "Students of India",
];

// Crude but useful: skip anything whose title or categories smell of a public
// figure. Personality rights in India are actively litigated, and a recognisable
// face in the training set can surface in outputs. This will not catch everyone
// — treat curation as the real filter, not this list.
const NOTABLE = new RegExp(
  "\\b(actor|actress|singer|politician|minister|mp\\b|mla\\b|cricketer|player|" +
  "award|film|bollywood|tollywood|celebrity|president|prime minister|governor|" +
  "chief minister|ambassador|olympic|padma|bharat ratna)\\w*", "i");

const q = (params) =>
  fetch(`${API}?${new URLSearchParams({ format: "json", origin: "*", ...params })}`,
        { headers: { "User-Agent": UA } }).then((r) => r.json());

const html2text = (s) => (s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

async function fromCategory(cat, want) {
  const out = [];
  let cont;
  do {
    const j = await q({
      action: "query", generator: "categorymembers", gcmtitle: `Category:${cat}`,
      gcmtype: "file", gcmlimit: "50", prop: "imageinfo",
      iiprop: "url|extmetadata|size", iiurlwidth: "1024",
      ...(cont ? { gcmcontinue: cont } : {}),
    });
    for (const p of Object.values(j?.query?.pages ?? {})) {
      const ii = (p.imageinfo ?? [])[0];
      if (!ii) continue;
      const m = ii.extmetadata ?? {};
      const g = (k) => html2text(m[k]?.value);
      const licence = g("LicenseShortName");
      const rec = {
        title: p.title, licence,
        artist: g("Artist"), credit: g("Credit"),
        descUrl: ii.descriptionurl, url: ii.thumburl || ii.url,
        width: ii.width, height: ii.height,
        restrictions: g("Restrictions"),
        categories: g("Categories"),
      };
      const blob = `${rec.title} ${rec.categories}`;
      if (!ALLOWED.some((re) => re.test(licence))) { rec.skip = `licence:${licence}`; }
      else if (rec.restrictions) { rec.skip = `restricted:${rec.restrictions}`; }
      else if (Math.min(ii.width, ii.height) < MIN_PX) { rec.skip = "too-small"; }
      else if (NOTABLE.test(blob)) { rec.skip = "possibly-notable"; }
      out.push(rec);
      if (out.filter((r) => !r.skip).length >= want) return out;
    }
    cont = j?.continue?.gcmcontinue;
  } while (cont);
  return out;
}

const perCat = Math.ceil(LIMIT / CATEGORIES.length);
const all = [];
for (const c of CATEGORIES) {
  process.stdout.write(`${c.padEnd(42)} `);
  try {
    const rows = await fromCategory(c, perCat);
    all.push(...rows);
    console.log(`${rows.filter((r) => !r.skip).length} usable / ${rows.length} seen`);
  } catch (e) { console.log(`ERR ${e.message.slice(0, 60)}`); }
}

const keep = all.filter((r) => !r.skip);
const reasons = all.filter((r) => r.skip)
  .reduce((a, r) => (a[r.skip.split(":")[0]] = (a[r.skip.split(":")[0]] ?? 0) + 1, a), {});

console.log(`\npolicy   ${POLICY}\nusable   ${keep.length}\nrejected ${all.length - keep.length}`, reasons);

if (DRY) {
  for (const r of keep.slice(0, 8)) console.log(` · ${r.licence.padEnd(14)} ${r.title.slice(0, 60)}`);
  process.exit(0);
}

const dir = path.join(ROOT, "dataset", "complexion", "candidates");
fs.mkdirSync(dir, { recursive: true });
// Wikimedia rate-limits bulk downloads and answers with an HTML error PAGE at a
// 2xx-looking status rather than a clean failure. The first run wrote 86 of 102
// files as "<!DOCTYPE html><title>Wikimedia Error</title>" with a .jpg name, and
// nothing complained. So: throttle, verify content-type, sniff the magic bytes,
// and retry — never trust that bytes arriving means an image arrived.
async function fetchImage(url, attempt = 0) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*" } });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.startsWith("image/")) {
    if (attempt >= 4) throw new Error(`${res.status} ${type.slice(0, 30)}`);
    await new Promise((s) => setTimeout(s, 1000 * 2 ** attempt));
    return fetchImage(url, attempt + 1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  // JPEG ffd8ff, PNG 89504e47. Belt and braces over the content-type header.
  const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (!jpg && !png) throw new Error("not an image after all");
  return buf;
}

let n = 0, lost = 0;
for (const r of keep) {
  const stem = String(n).padStart(4, "0");
  try {
    await new Promise((s) => setTimeout(s, 350)); // be a good Commons citizen
    const buf = await fetchImage(r.url);
    fs.writeFileSync(path.join(dir, `${stem}.jpg`), buf);
    // Attribution travels with the image. CC-BY obliges us to credit, and we
    // cannot reconstruct it later from a folder of anonymous JPEGs.
    fs.writeFileSync(path.join(dir, `${stem}.json`), JSON.stringify({
      source: "wikimedia-commons", ...r, caption: null,
    }, null, 2));
    n++;
    if (n % 10 === 0) process.stdout.write(`\r  downloaded ${n}/${keep.length}, ${lost} lost  `);
  } catch { lost++; }
}
console.log(`\n\n${n} images → ${dir}`);
if (lost) console.log(`${lost} failed to download after retries`);
console.log(`\nNEXT: these have NO captions yet — caption is a separate step, and`);
console.log(`the complexion term in each caption has to be judged by eye.`);
