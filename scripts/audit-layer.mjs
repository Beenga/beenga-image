// Systematic audit of the prompt layer.
//
//   node scripts/audit-layer.mjs
//
// Every bug found in this layer so far was found the same way: a user typed a
// word no benchmark case contained, a rule fired on the wrong condition, and
// nobody noticed because all 41 benchmark cases look alike. `clean shave`,
// state names, `concert`, `indian office`, `indian child` — five instances of
// one pattern, each found by accident.
//
// So this does not test outputs. It tests GATES. For every rule it asserts the
// conditions under which the rule may fire, then drives the layer with a
// cross-product of prompt facets and reports any rule that fires when its
// precondition is false, or fails to fire when it plainly should.
//
// Add a facet whenever a new category of prompt appears in real use.
import { enhance } from "../lib/prompt.mjs";

// ── facets: each is a fragment plus what it means for the gates ─────────────
const SUBJECT = [
  { t: "an indian woman", person: true, female: true },
  { t: "an indian man", person: true, male: true },
  { t: "an indian couple", person: true },
  { t: "an indian child", person: true, minor: true },
  { t: "an indian teenager", person: true, minor: true },
  { t: "a delhi office", person: false },
  { t: "an empty room in mumbai", person: false, noPeople: true },
  { t: "a still life of brass pots in kerala", person: false, noPeople: true },
  { t: "a kerala street", person: false },
  { t: "Lord Hanuman", person: false, deity: true, traditional: true },
];
const SETTING = [
  { t: "", named: false },
  { t: " on a rooftop", named: true },
  { t: " at a mela", named: true },
  { t: " at a concert", named: true },
  { t: " at a ghat", named: true },
  { t: " in a village", named: true },
  { t: " on a bed", named: true },
  { t: " on a chair", named: true },
];
const GARMENT = [
  { t: "", garment: false },
  { t: " in a sari", garment: true, sari: true },
  { t: " in jeans and a shirt", garment: true },
  { t: " in a lehenga", garment: true, traditional: true },
];
const MODIFIER = [
  { t: "", },
  { t: ", deep dark complexion", complexion: true },
  { t: ", ordinary everyday look", look: true },
  { t: ", as a watercolour painting", nonPhoto: true, styleStated: true },
  { t: ", as a cartoon", nonPhoto: true, cartoon: true },
  { t: ", as a 2d cartoon", nonPhoto: true, cartoon: true, styleStated: true },
  { t: ", as an anime", nonPhoto: true, cartoon: false, styleStated: true },
  { t: ", at night", lighting: true },
  { t: ", dancing", dance: true, pose: true },
  { t: ", lying down", pose: true },
  { t: ", shot as a close-up", framing: true },
  { t: ", long thick braid", braid: true },
  { t: ", clean shaven", shave: true },
];

// ── invariants: rule -> may it fire, given the facts? ───────────────────────
// Returning false means "this rule must NOT be present for this prompt".
const INVARIANTS = {
  "modern-dress-default": (f) => f.person && !f.garment && !f.traditional,
  "house-look":           (f) => f.person && !f.minor && !f.complexion && !f.look && !f.traditional,
  "hair-realism":         (f) => f.person && !f.nonPhoto,
  "scene-variety":        (f) => f.person && !f.named,
  "sari-variety":         (f) => f.sari,
  "modest-drape":         (f) => f.sari,
  "dance-venue-default":  (f) => f.dance && !f.named,
  "deity-icon":           (f) => f.deity,
  "contemporary-default": (f) => !f.traditional,
  "daylight-default":     (f) => !f.lighting,
  "cartoon-3d":           (f) => f.cartoon && !f.styleStated,
  "full-frame":           (f) => f.person && f.pose && !f.framing,
};
// Rules that SHOULD fire when the condition holds — catches silent no-ops.
const EXPECTED = {
  "sari-variety":  (f) => f.sari && !f.traditional,
  "deity-icon":    (f) => f.deity,
  "hair-realism":  (f) => f.person && !f.nonPhoto,
  "cartoon-3d":    (f) => f.cartoon && !f.styleStated,
};

const merge = (...os) => Object.assign({}, ...os);
const violations = [], missing = [];
let n = 0;

for (const s of SUBJECT)
  for (const set of SETTING)
    for (const g of GARMENT)
      for (const m of MODIFIER) {
        const prompt = `${s.t}${g.t}${set.t}${m.t}`;
        const f = merge(s, set, g, m);
        const { applied } = enhance(prompt, { variant: "11" });
        const ids = new Set(applied.map((a) => a.split(":")[0]));
        n++;
        for (const [rule, allowed] of Object.entries(INVARIANTS)) {
          if (ids.has(rule) && !allowed(f)) violations.push({ prompt, rule });
        }
        for (const [rule, expect] of Object.entries(EXPECTED)) {
          if (expect(f) && !ids.has(rule)) missing.push({ prompt, rule });
        }
      }

const group = (rows) => {
  const by = {};
  for (const r of rows) (by[r.rule] ??= []).push(r.prompt);
  return by;
};

console.log(`audited ${n} prompt combinations\n`);

const v = group(violations);
if (Object.keys(v).length) {
  console.log(`FIRES WHEN IT SHOULD NOT (${violations.length} across ${Object.keys(v).length} rules)`);
  for (const [rule, ps] of Object.entries(v)) {
    console.log(`\n  ${rule}  — ${ps.length} cases, e.g.`);
    for (const p of ps.slice(0, 4)) console.log(`     ${JSON.stringify(p)}`);
  }
} else console.log("no gate violations");

const mi = group(missing);
if (Object.keys(mi).length) {
  console.log(`\n\nDOES NOT FIRE WHEN IT SHOULD (${missing.length})`);
  for (const [rule, ps] of Object.entries(mi)) {
    console.log(`\n  ${rule}  — ${ps.length} cases, e.g.`);
    for (const p of ps.slice(0, 4)) console.log(`     ${JSON.stringify(p)}`);
  }
} else console.log("\nno silent no-ops");


// ── negative probes ─────────────────────────────────────────────────────────
//
// The cross-product above proves every GATE is correct. It cannot prove the
// vocabulary lists are, because it builds its probes from words I chose — the
// same blind spot that produced the bugs.
//
// This is the other half: prompts where a listed word appears in a DIFFERENT
// sense. Widening a list to close one hole opens others, and the generic words
// are where they open. Every false positive ever found goes here permanently,
// so the list only grows and a fix can never silently regress.
const NEGATIVE = [
  // [prompt, rule that must NOT fire]
  ["a chess figure on a board",              "hair-realism"],
  ["the subject of the painting is a mango", "hair-realism"],
  ["a player piano in a hall",               "hair-realism"],
  ["a guard rail on a highway",              "hair-realism"],
  ["a character from a story",               "hair-realism"],
  ["a human figure sculpture",               "hair-realism"],
  ["baby corn on a plate",                   "hair-realism"],
  ["an automatic camera",                    "hair-realism"],
  ["a table lamp",                           "hair-realism"],
  ["a cot bed frame",                        "hair-realism"],
  ["a mat woven from grass",                 "hair-realism"],
  ["a counter top with spices",              "hair-realism"],
  ["no people in frame, an empty street",    "house-look"],
  ["a still life of brass pots",             "house-look"],
  ["an indian child",                        "house-look"],
  ["an indian schoolgirl",                   "house-look"],
  ["a 12 year old indian girl",              "house-look"],
  // KNOWN AND ACCEPTED: "model" is a person word because "a model in a sari" is
  // the common case in this domain. "a model train" is collateral, pre-dates
  // today's expansion, and is not worth breaking the common case for.
];

let negFails = 0;
for (const [prompt, rule] of NEGATIVE) {
  const ids = new Set(enhance(prompt, { variant: "11" }).applied.map((a) => a.split(":")[0]));
  if (ids.has(rule)) { negFails++; console.log(`  FALSE POSITIVE  ${rule}  ${JSON.stringify(prompt)}`); }
}
console.log(negFails ? `\n${negFails} false positives` : `\nnegative probes: ${NEGATIVE.length} clean`);

process.exit(violations.length || missing.length || negFails ? 1 : 0);
