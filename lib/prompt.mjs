// Beenga prompt layer — wave 1.
//
// Every rule here exists because a specific benchmark case failed. Nothing is
// speculative. See out/baseline/SCORES.md for the evidence.
//
// The baseline run found one clean pattern: Klein obeys attributes it is told
// about, and reaches for traditional/ceremonial India when it is told nothing.
// 5 pass / 3 partial / 0 fail on explicit attributes; 0 pass / 3 fail on
// generic prompts. So this layer does three jobs, in order of measured payoff:
//
//   1. Rewrite negations, because FLUX ignores them outright.
//   2. Supply a contemporary default when the prompt names India but no era.
//   3. Restate fragile attributes that get diluted in long prompts.

// ── 1. Negations ─────────────────────────────────────────────────────────────
//
// IND-MEN-001 asked for "no beard and no moustache and no stubble" and got
// stubble anyway. The words are not weak — they are inert. FLUX has no
// mechanism for negation in the prompt, so "no moustache" contributes the
// token "moustache" and nothing else. The only fix is to describe the face as
// it should positively appear.
//
// Ordered longest-first so "no facial hair" wins before "no hair" could match.
//
// Replacements must never contain a phrase that a LATER rule matches. The first
// draft rewrote "no kajal" into "...with no eyeliner of any kind", which the
// next rule then rewrote again, yielding "bare clean eyelids with bare clean
// eyelids of any kind". Keep the right-hand side free of negation wording.
const NEGATIONS = [
  [/\bno\s+facial\s+hair\b/gi, "a completely smooth clean-shaven face"],
  [/\bwithout\s+a\s+moustache\b/gi, "with a bare smooth upper lip"],
  [/\bno\s+moustache\b/gi, "a bare smooth upper lip"],
  [/\bno\s+beard\b/gi, "a smooth bare jawline and chin"],
  [/\bno\s+stubble\b/gi, "freshly shaved smooth skin"],
  [/\bno\s+makeup\s+at\s+all\b/gi, "a completely bare unmade-up face"],
  [/\bno\s+makeup\b/gi, "a bare unmade-up face"],
  [/\bno\s+kajal\b/gi, "completely undecorated bare eyes"],
  [/\bno\s+eyeliner\b/gi, "bare clean eyelids"],
  [/\bno\s+heavy\s+embroidery\b/gi, "plain unadorned fabric"],
  [/\bno\s+glamou?r\b/gi, "a plain everyday unglamorous appearance"],
  [/\bno\s+styling\s+products\b/gi, "hair left in its natural untreated state"],
  [/\bnot\s+cropped\b/gi, "the whole subject inside the frame"],
];

// ── 2. Contemporary default ──────────────────────────────────────────────────
//
// IND-SCENE-001, IND-DANCE-001 and IND-SKIN-003 all failed the same way: a
// generic Indian prompt produced heavy silk, gold jewellery, a weathered
// terrace or a performance stage. The model's prior for "India" is ceremonial.
//
// So when a prompt names India and does NOT ask for something traditional, we
// state the present day explicitly. This is a default, not an override — the
// moment the user asks for a wedding or a classical form, we stay out of it.
const INDIA = /\b(indian?|delhi|mumbai|bombay|bengaluru|bangalore|chennai|kolkata|hyderabad|pune|jaipur|ahmedabad|kochi|lucknow)\b/i;

const TRADITIONAL_INTENT = new RegExp(
  "\\b(traditional|classical|bharatanatyam|kathak|kuchipudi|odissi|bhangra|garba|" +
  "temple|ritual|ceremon|wedding|bridal|festival|puja|pooja|diwali|navratri|" +
  "historical|period|ancient|mytholog|village|rural|folk|hanuman|krishna|krishn|radha|\\brama\\b|\\bram\\b|shiva|shiv\\b|vishnu|ganesh|ganpati|lakshmi|laxmi|durga|kali\\b|saraswati|brahma|parvati|murugan|ayyappa|venkatesw|balaji|jagannath|nataraj|buddha|mahavir|nanak|sai baba|deity|goddess|\\bgod\\b|\\blord\\b|avatar|ramayana|mahabharata|bhagavad|bhakti|devotional|aarti|mandir|idol|murti|shrine|pilgrim|sadhu|saint|yogi|ascetic|epic\\b|scripture|vedic|sanskrit)\\w*\\\b", "i");

const CONTEMPORARY =
  "Present-day contemporary India, modern well-maintained surroundings, clean and " +
  "tidy environment, current-day styling.";

// Clothing is handled separately: only nudge toward modern dress when the user
// has not named a garment at all. Otherwise we would fight an explicit request.
const GARMENT = /\b(sari|saree|lehenga|salwar|kurti|kurta|dupatta|sherwani|dhoti|blouse|dress|shirt|t-?shirt|jeans|suit|top|gown|uniform)\b/i;
const MODERN_DRESS = "Modern everyday clothing.";

// ── 2b. Venue for dance prompts ──────────────────────────────────────────────
//
// Fixing the classical-dance stereotype exposed a second failure underneath it.
// "An Indian woman dancing to music" stopped producing temple costume and
// started producing a drum kit, cymbals, mic stands and a strapped-on dhol —
// on 2 of 2 seeds, so systematic rather than noise. The word "music" was being
// rendered literally as equipment because nothing else furnished the scene.
//
// The fix is to give the scene something to be. Note this is stated positively:
// naming the unwanted objects would summon them (see the NEGATIONS note above).
const DANCE = /\bdanc(e|es|ing|er)\b/i;
const VENUE = new RegExp(
  "\\b(rooftop|terrace|balcony|room|home|house|apartment|flat|hall|stage|studio|" +
  "club|bar|party|cafe|café|restaurant|kitchen|garden|park|beach|street|road|" +
  "campus|college|school|office|mall|metro|station|temple|wedding|venue|floor|" +
  "courtyard|lawn|field|outdoors|indoors)\\w*\\b", "i");
const DANCE_VENUE =
  "The setting is an ordinary domestic living room with a sofa, a rug and plain walls.";

// ── 3. Fragile attributes ────────────────────────────────────────────────────
//
// IND-MULTI-001 held five attributes correctly and dropped one: "soft loose
// salon curls" became tight ringlets. The same curl instruction passed on its
// own in IND-HAIR-004. So the concept is present — it just loses a competition
// against longer prompts.
//
// Restating the fragile attribute at the end costs nothing and gives it a
// second, uncontested mention. We only restate what the prompt actually asked
// for, and we never invent an attribute.
//
// ── Two rules these strings must follow, both learned by breaking them ───────
//
//  * NO NEGATIONS, and never name the unwanted thing. The first draft said
//    "definitely not tight ringlets or coils" and "no cap sleeves". FLUX cannot
//    negate, so those phrases contributed "ringlets", "coils" and "cap sleeves"
//    as positive tokens — actively arguing for the failure they meant to
//    prevent. The curls came back tighter, not looser. Describe only the wanted
//    state.
//
//  * DO NOT REPEAT BODY-PART NOUNS. "bare shoulders and bare upper arms" landed
//    on a prompt already saying "one hand raised", and the render grew a third
//    hand. Extra mentions of arms/hands/legs raise the odds of extra limbs.
//    Describe the GARMENT, not the body it exposes.
// One attribute earns more than a single restatement. Asked for "clean-shaven,
// no beard, no moustache, no stubble", Klein rendered stubble on 3 of 4 samples
// — and switching to the undistilled base changed nothing, so it was never a
// checkpoint problem.
//
// What fixed it was volume: FIVE separate positive descriptions of the same
// smooth face, stacked. That went 6/6 across the full complexion and age range.
// Attribute repetition beats attribute mention — one clear statement loses a
// competition that five identical ones win.
//
// Credit where due: this came from Biren testing his own phrasing, not from me.
// His original also carried "fashion model" and "commercial fashion photography",
// which do help — but they drag the output glamorous and fair, so only the
// repetition is kept here.
const SHAVE_STACK =
  "completely clean-shaven face, perfectly smooth freshly shaved cheeks, " +
  "smooth bare upper lip, smooth chin and jawline, zero facial hair";

// Guard: "light short stubble only, no full beard, no moustache styling" matched
// the clean-shaven trigger on `no moustache` and got the whole zero-facial-hair
// stack bolted on, overriding the stubble the user actually asked for. A rule
// that enforces an attribute has to check nobody asked for its opposite.
const WANTS_HAIR = /\bstubble\b|\bbeard\b|\bmoustache\b|\bmustache\b|\bgoatee\b/i;
const WANTS_NONE = /\bno\s+(full\s+)?(beard|moustache|mustache|stubble|facial\s+hair)\b|\bclean[- ]shaven\b|\bzero\s+facial\s+hair\b/i;

const FRAGILE = [
  // "beautiful delhi girl in sari" rendered a woman around thirty, on the raw
  // model as well as through this layer — Klein maps youth words to roughly 30
  // whatever you type. Same failure shape as clean-shaven and complexion, so the
  // same fix: stack several positive statements of the age instead of one.
  { test: /\b(girl|young(\s+\w+){0,2}\s+(woman|man|lady|guy|boy|girl)|teenager|college\s+student|in\s+(her|his)\s+(early\s+)?twenties)\b/i,
    say: "Clearly a young adult in their early twenties, youthful unlined face, smooth taut young skin, visibly in their early 20s." },
  { test: (raw) =>
      /\bclean[- ]shaven\b|\bno\s+beard\b|\bno\s+moustache\b|\bno\s+stubble\b|\bno\s+facial\s+hair\b/i.test(raw) &&
      // Every facial-hair mention must be a negated one. If any survives the
      // WANTS_NONE strip, the prompt wants some hair and we stay out of it.
      !WANTS_HAIR.test(raw.replace(new RegExp(WANTS_NONE.source, "gi"), "")),
    say: SHAVE_STACK },
  { test: /\b(soft|loose|salon|blowout|beauty-?parlou?r)\s+(curls?|waves?)\b/i,
    say: "The hair falls in wide relaxed S-shaped waves with long gentle bends and plenty of loose movement." },
  { test: /\b(two|2)\s+braids?\b|\btwo\s+plaits\b/i,
    say: "Exactly two separate braids, clearly distinct from each other." },
  { test: /\b(one|single)\s+(thick\s+)?braid\b/i,
    say: "Exactly one single braid." },
  { test: /\bsleeveless\b/i,
    say: "The blouse ends at a narrow shoulder strap with the armhole cut high and clean." },
  { test: /\bfull[- ]sleeve/i,
    say: "The sleeve fabric continues unbroken all the way to the wrist cuff." },
  // Complexion needed the same stacking treatment as SHAVE_STACK, and finding
  // that out corrected a wrong conclusion. A single restatement left every
  // requested tone below wheatish rendering lighter than asked, which was read
  // as a weights-level bias that only real photography could fix. It was not.
  // Stacking five descriptions of the same tone — control vs stack on an
  // identical seed — produced a visibly deeper, correct complexion on 3 of 3.
  //
  // One stack PER TONE, deliberately. A single "make it darker" rule would push
  // every complexion toward the dark end, which is the same failure as the
  // lightening bias, just mirrored. Each entry has to land on its own target.
  { test: /\bvery\s+deep\b|\bvery\s+dark\s+brown\b/i,
    say: "Very deep dark brown skin, richly pigmented complexion, dark brown skin tone across the whole face, deeply melanated skin, unmistakably dark brown complexion." },
  { test: /\bdeep\s+(dark\s+)?complexion\b|\bdeep\s+brown\s+skin\b|\bdark\s+skin(ned)?\b/i,
    say: "Deep brown skin, richly pigmented deep complexion, dark brown skin tone across the whole face, deeply melanated skin, unmistakably deep brown complexion." },
  { test: /\bmedium\s+brown\b|\bmedium\s+complexion\b/i,
    say: "Medium brown skin, clearly mid-toned complexion, even medium brown skin across the face, neither pale nor dark." },
  { test: /\bwheatish\b/i,
    say: "Wheatish complexion, warm light-brown skin, golden wheat-toned skin across the face, a mid-light Indian complexion." },
  { test: /\bpin-?straight\b|\bstraight\s+(black\s+)?hair\b/i,
    say: "The hair is perfectly straight and smooth from root to tip." },
  { test: /\bwet\b.{0,20}\bhair\b|\bhair\b.{0,20}\bwet\b|\bdamp\s+hair\b/i,
    say: "The hair is visibly wet, strands darkened and clumped together, moisture clearly present." },
  { test: /\baverage[- ]looking\b|\bordinary\b.{0,30}\bappearance\b/i,
    say: "An ordinary unremarkable everyday face with real skin texture and natural asymmetry." },
];

/**
 * Apply the Beenga prompt layer.
 *
 * @param {string} raw            the user's prompt, untouched
 * @param {object} [opts]
 * @param {boolean} [opts.contemporary=true]  supply the present-day default
 * @param {boolean} [opts.reinforce=true]     restate fragile attributes
 * @returns {{prompt: string, applied: string[]}}
 */
export function enhance(raw, { contemporary = true, reinforce = true } = {}) {
  const applied = [];
  let out = raw;

  for (const [re, positive] of NEGATIONS) {
    if (re.test(out)) {
      out = out.replace(re, positive);
      applied.push(`negation:${re.source.slice(0, 28)}`);
    }
  }

  const tail = [];

  if (contemporary && INDIA.test(raw) && !TRADITIONAL_INTENT.test(raw)) {
    tail.push(CONTEMPORARY);
    applied.push("contemporary-default");
    if (!GARMENT.test(raw)) {
      tail.push(MODERN_DRESS);
      applied.push("modern-dress-default");
    }
  }

  if (DANCE.test(raw) && !VENUE.test(raw)) {
    tail.push(DANCE_VENUE);
    applied.push("dance-venue-default");
  }

  if (reinforce) {
    // A rule's `test` is either a RegExp or a predicate over the raw prompt.
    const hit = (f) => (typeof f.test === "function" ? f.test(raw) : f.test.test(raw));
    const recap = FRAGILE.filter(hit).map((f) => f.say);
    if (recap.length) {
      tail.push(...recap);
      applied.push(`reinforce:${recap.length}`);
    }
  }

  if (tail.length) out = `${out.trim().replace(/\.?$/, ".")} ${tail.join(" ")}`;
  return { prompt: out, applied };
}
