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
  { t: ", full body shot", wide: true },
  { t: ", long thick braid", braid: true },
  { t: ", clean shaven", shave: true },
];

// ── invariants: rule -> may it fire, given the facts? ───────────────────────
// Returning false means "this rule must NOT be present for this prompt".
// Mirrors faceIsSubject() in lib/prompt.mjs. Explicit close framing wins, then
// explicit wide, then a body-in-frame pose, then: no setting named == portrait.
//
// This exists because the face-detail rules are ~30 words describing a face, and
// that description mass moves the camera — on a scene prompt they crop the scene
// to a headshot. Keeping the predicate duplicated here is deliberate: if the
// layer's gate changes and this does not, the cross-product below fails loudly
// rather than the crop bug returning unnoticed.
const faceSubject = (f) =>
  f.framing ? true : f.wide ? false : f.pose ? false : !f.named;

const INVARIANTS = {
  "modern-dress-default": (f) => f.person && !f.garment && !f.traditional,
  "house-look":           (f) => f.person && !f.minor && !f.complexion && !f.look && !f.traditional && faceSubject(f),
  "house-identity":       (f) => f.person && !f.minor && !f.complexion && !f.look && !f.traditional && !faceSubject(f),
  "hair-realism":         (f) => f.person && !f.nonPhoto && faceSubject(f),
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
  "hair-realism":  (f) => f.person && !f.nonPhoto && faceSubject(f),
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
  // SETTING_NAMED wildcard false positives. The group ended `)\\w*\\b`, so `car`
  // matched "cartoon", `port` matched "portrait", `bus` "business", `farm`
  // "farmer", `study` "studying", `ground` "groundwater". Each one silently told
  // the layer that a scene-less prompt had a named setting, which suppressed
  // scene-variety and — once the face-detail gate landed — swapped house-look
  // for house-identity. Invisible until a rule was gated on SETTING_NAMED.
  // house-identity firing here is the tell: it only fires when a setting matched.
  ["an indian woman, as a cartoon",          "house-identity"],
  ["a portrait of an indian woman",          "house-identity"],
  // NB: not "running a business" — `running` is a full-body pose, so
  // house-identity there is correct and the probe would test the wrong gate.
  ["an indian woman with a small business",  "house-identity"],
  ["an indian farmer",                       "house-identity"],
  ["an indian woman studying",               "house-identity"],
  ["an indian woman, automatic camera",      "house-identity"],
  ["an indian woman holding a tablet",       "house-identity"],
  ["an indian woman at a carnival",          "house-identity"],
  ["an indian woman, career woman",          "house-identity"],
  ["an indian woman, counterfeit notes",     "house-identity"],
  ["an indian woman near groundwater",       "house-identity"],
  ["an indian woman near bushes",            "house-identity"],
  ["an indian woman, a serious matter",      "house-identity"],
  ["an indian woman on the top storey",      "house-identity"],
  // A stated plain background must not get "Background in clear focus with
  // visible detail" appended over it. Same shape as daylight vs "at night".
  ["an indian woman, plain background",       "deep-focus"],
  ["an indian woman, white background",       "deep-focus"],
  ["an indian woman against a plain wall",    "deep-focus"],
  // A named photographic treatment already decides lighting and depth of field.
  ["an indian bride, editorial photography",  "daylight-default"],
  ["an indian bride, editorial photography",  "deep-focus"],
  ["an indian woman, fashion shoot",          "deep-focus"],
  // A stated minor must never get the young-adult age push.
  ["a 12 year old indian girl",               "reinforce"],
  ["indian girl aged 14",                     "reinforce"],
  // KNOWN AND ACCEPTED: "model" is a person word because "a model in a sari" is
  // the common case in this domain. "a model train" is collateral, pre-dates
  // today's expansion, and is not worth breaking the common case for.
];

// ── positive probes: settings that MUST be recognised ───────────────────────
//
// The negative probes above catch a list that is too WIDE. This catches one
// that is too NARROW, and nothing here caught it before: tightening the
// SETTING_NAMED wildcard to plurals silently dropped "marketplace", "hillside"
// and "hilltop", and "seaside" had never matched at all.
//
// A missed setting is worse than a spurious one. When SETTING_NAMED does not
// see the scene the user named, scene-variety appends a DIFFERENT scene on top
// of it — that is the reported "couple on a bed, rendered in front of a
// building". Every setting word the layer claims to know belongs here.
const SETTINGS_MUST_MATCH = [
  "on a bed", "on beds", "on a charpai", "on a chair", "on a scooter", "in an auto",
  "on a rooftop", "on the rooftops", "on a terrace", "on a balcony", "in a courtyard",
  "at a mela", "at a ghat", "at the ghats", "at a dhaba", "at a chowk", "in a bazaar",
  "at a market", "at the markets", "in a marketplace",
  "in a village", "in villages", "in a field", "in the fields", "at a factory",
  "in a bedroom", "in the kitchen", "in a salon", "in a temple", "at the temples",
  "at a railway platform", "at a stadium", "on a boat", "in a forest", "at a beach",
  "on a hillside", "on a hilltop", "at the seaside", "by the roadside", "in the countryside",
  // A stated background is a stated setting. RW-DEEP ("plain background") was
  // having a market appended over it before these were added.
  "against a plain background", "against a white background", "with a blurred background",
  "against a grey seamless backdrop", "against a wall",
];
let posFails = 0;
for (const setting of SETTINGS_MUST_MATCH) {
  const prompt = `an indian woman ${setting}`;
  const ids = new Set(enhance(prompt, { variant: "11" }).applied.map((a) => a.split(":")[0]));
  // scene-variety only fires when SETTING_NAMED saw nothing.
  if (ids.has("scene-variety")) {
    posFails++;
    console.log(`  SETTING NOT SEEN  ${JSON.stringify(setting)} — scene-variety would override it`);
  }
}
console.log(posFails ? `\n${posFails} settings unrecognised`
                     : `positive probes: ${SETTINGS_MUST_MATCH.length} settings recognised`);

let negFails = 0;
for (const [prompt, rule] of NEGATIVE) {
  const ids = new Set(enhance(prompt, { variant: "11" }).applied.map((a) => a.split(":")[0]));
  if (ids.has(rule)) { negFails++; console.log(`  FALSE POSITIVE  ${rule}  ${JSON.stringify(prompt)}`); }
}
console.log(negFails ? `\n${negFails} false positives` : `\nnegative probes: ${NEGATIVE.length} clean`);

process.exit(violations.length || missing.length || negFails || posFails ? 1 : 0);
